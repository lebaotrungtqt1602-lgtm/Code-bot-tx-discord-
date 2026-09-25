require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

// ID Owner phụ
const CO_OWNER_ID = 'ĐIỀN_ID_DISCORD_CỦA_BẠN_VÀO_ĐÂY'; 

// 1. HTTP Server giữ Render 24/7
http.createServer((req, res) => {
  res.write("Bot Casino Live Session 24/7");
  res.end();
}).listen(process.env.PORT || 3000);

// 2. Khởi tạo Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 3. CSDL SQLite
const db = new sqlite3.Database('./casino.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 1000,
    bank INTEGER DEFAULT 0,
    debt INTEGER DEFAULT 0,
    last_daily INTEGER DEFAULT 0,
    last_work INTEGER DEFAULT 0,
    last_crime INTEGER DEFAULT 0,
    last_rob INTEGER DEFAULT 0,
    last_interest INTEGER DEFAULT 0,
    is_vip INTEGER DEFAULT 0,
    married_with TEXT DEFAULT NULL,
    pet_type TEXT DEFAULT NULL,
    pet_level INTEGER DEFAULT 1,
    bounty INTEGER DEFAULT 0,
    gang_id TEXT DEFAULT NULL,
    exp INTEGER DEFAULT 0,
    insurance_until INTEGER DEFAULT 0,
    quest_work INTEGER DEFAULT 0,
    quest_gamble INTEGER DEFAULT 0,
    quest_done INTEGER DEFAULT 0,
    last_quest_reset INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS jackpot (
    id INTEGER PRIMARY KEY,
    amount INTEGER DEFAULT 50000
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS gangs (
    id TEXT PRIMARY KEY,
    name TEXT,
    owner_id TEXT,
    fund INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    tx_channel_id TEXT DEFAULT NULL,
    lottery_channel_id TEXT DEFAULT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS lottery_tickets (
    user_id TEXT,
    number INTEGER
  )`);

  db.run(`INSERT OR IGNORE INTO jackpot (id, amount) VALUES (1, 50000)`);
});

const getUser = (id) => new Promise((resolve) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (id) VALUES (?)`, [id]);
      resolve({ 
        id, balance: 1000, bank: 0, debt: 0, last_daily: 0, last_work: 0, 
        last_crime: 0, last_rob: 0, last_interest: 0, is_vip: 0, married_with: null, 
        pet_type: null, pet_level: 1, bounty: 0, gang_id: null, exp: 0, 
        insurance_until: 0, quest_work: 0, quest_gamble: 0, quest_done: 0, last_quest_reset: 0 
      });
    } else {
      resolve(row);
    }
  });
});

const getGang = (gangId) => new Promise((resolve) => {
  db.get(`SELECT * FROM gangs WHERE id = ?`, [gangId], (err, row) => resolve(row));
});

const updateBalance = (id, amount) => new Promise((resolve) => {
  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, id], resolve);
});

const addEXP = (id, expGain) => {
  db.run(`UPDATE users SET exp = exp + ? WHERE id = ?`, [expGain, id]);
};

const checkResetQuest = (uData) => {
  const now = Date.now();
  const oneDay = 86400000;
  if (now - uData.last_quest_reset > oneDay) {
    db.run(`UPDATE users SET quest_work = 0, quest_gamble = 0, quest_done = 0, last_quest_reset = ? WHERE id = ?`, [now, uData.id]);
  }
};

const getTitle = (exp) => {
  const lvl = Math.floor(exp / 100);
  if (lvl < 5) return { lvl, title: '🌱 Tập Sự Casino' };
  if (lvl < 15) return { lvl, title: '🎲 Tay Chơi Khá' };
  if (lvl < 30) return { lvl, title: '🔥 Cao Thủ Đặt Cược' };
  if (lvl < 50) return { lvl, title: '💎 Đại Gia Phố Wall' };
  return { lvl, title: '👑 Vua Sòng Bài' };
};

// 4. Register Commands
const commands = [
  new SlashCommandBuilder().setName('info').setDescription('Xem thông tin chi tiết về Bot và Chủ sở hữu'),
  new SlashCommandBuilder().setName('help').setDescription('Xem menu trợ giúp đầy đủ'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví và ngân hàng'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng điểm danh hằng ngày'),
  new SlashCommandBuilder().setName('rank').setDescription('Xem cấp độ, EXP và danh hiệu cá nhân'),
  new SlashCommandBuilder().setName('quest').setDescription('Xem và nhận thưởng nhiệm vụ hàng ngày'),
  new SlashCommandBuilder().setName('baohiem').setDescription('Mua bảo hiểm chống cướp tiền mặt (10.000 xu / 24h)'),

  new SlashCommandBuilder()
    .setName('veso')
    .setDescription('Hệ thống vé số quay thưởng 18:30 hàng ngày')
    .addSubcommand(s => s.setName('buy').setDescription('Mua vé số (5.000 xu / vé)').addIntegerOption(o => o.setName('sonchon').setDescription('Chọn số may mắn từ 0 đến 99').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand(s => s.setName('list').setDescription('Xem các con số bạn đã mua hôm nay')),

  new SlashCommandBuilder()
    .setName('setlotterychannel')
    .setDescription('Chọn kênh thông báo kết quả vé số hàng ngày (Admin)')
    .addChannelOption(o => o.setName('kenh').setDescription('Chọn kênh thông báo').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('settxchannel')
    .setDescription('Thiết lập kênh đặt cược Tài Xỉu tự động liên tục')
    .addChannelOption(o => o.setName('kenh').setDescription('Chọn kênh làm sòng Tài Xỉu').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('canceltxchannel')
    .setDescription('Tắt chế độ Auto Tài Xỉu tự động ở server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('cl')
    .setDescription('Chơi Chẵn Lẻ')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn hoặc Lẻ').setRequired(true).addChoices({name:'Chẵn',value:'chan'},{name:'Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  new SlashCommandBuilder()
    .setName('hu')
    .setDescription('Quay Hũ hoặc xem hũ hiện tại')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền đặt hũ').setRequired(false)),

  new SlashCommandBuilder()
    .setName('xidach')
    .setDescription('Chơi Xì Dách (Blackjack 21 điểm)')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  new SlashCommandBuilder()
    .setName('baucua')
    .setDescription('Chơi Bầu Cua Tôm Cá')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn linh vật').setRequired(true).addChoices(
      {name:'🍐 Bầu',value:'bau'},{name:'🦀 Cua',value:'cua'},{name:'🦐 Tôm',value:'tom'},{name:'🐟 Cá',value:'ca'},{name:'🦌 Nai',value:'nai'},{name:'🐓 Gà',value:'ga'}
    ))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  new SlashCommandBuilder()
    .setName('xocdia')
    .setDescription('Chơi Xóc Đĩa')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn hoặc Lẻ').setRequired(true).addChoices({name:'🔴 Chẵn',value:'chan'},{name:'⚪ Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  new SlashCommandBuilder().setName('work').setDescription('Làm việc kiếm xu'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm việc phi pháp (Rủi ro cao)'),
  new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Cướp tiền người khác')
    .addUserOption(o => o.setName('target').setDescription('Mục tiêu cướp').setRequired(true)),

  new SlashCommandBuilder().setName('marry').setDescription('Cầu hôn').addUserOption(o => o.setName('target').setDescription('Người phối ngẫu').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn'),

  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Hệ thống Thú Cưng')
    .addSubcommand(s => s.setName('info').setDescription('Xem thú cưng'))
    .addSubcommand(s => s.setName('buy').setDescription('Mua thú cưng').addStringOption(o => o.setName('loai').setDescription('Loại pet').setRequired(true).addChoices(
      {name:'🐶 Chó Cảnh (10.000 xu)',value:'cho'},{name:'🐱 Mèo Thần Tài (20.000 xu)',value:'meo'},{name:'🐉 Rồng Lửa (50.000 xu)',value:'rong'}
    )))
    .addSubcommand(s => s.setName('feed').setDescription('Cho thú cưng ăn')),

  new SlashCommandBuilder()
    .setName('gang')
    .setDescription('Hệ thống Băng Nhóm')
    .addSubcommand(s => s.setName('create').setDescription('Tạo bang').addStringOption(o => o.setName('tenbang').setDescription('Tên bang').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Xem bang')),

  new SlashCommandBuilder()
    .setName('truyna')
    .setDescription('Treo thưởng truy nã')
    .addUserOption(o => o.setName('target').setDescription('Người bị truy nã').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền treo thưởng').setRequired(true)),

  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Chuyển tiền')
    .addUserOption(o => o.setName('target').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền chuyển').setRequired(true)),

  new SlashCommandBuilder().setName('hug').setDescription('Ôm').addUserOption(o => o.setName('target').setDescription('Người ôm').setRequired(true)),
  new SlashCommandBuilder().setName('kiss').setDescription('Hôn').addUserOption(o => o.setName('target').setDescription('Người hôn').setRequired(true)),
  new SlashCommandBuilder().setName('slap').setDescription('Tát').addUserOption(o => o.setName('target').setDescription('Người tát').setRequired(true)),
  new SlashCommandBuilder().setName('pat').setDescription('Xoa đầu').addUserOption(o => o.setName('target').setDescription('Người xoa đầu').setRequired(true)),

  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền gửi').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền rút').setRequired(true)),
  new SlashCommandBuilder().setName('vay').setDescription('Vay tiền').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền vay').setRequired(true)),
  new SlashCommandBuilder().setName('tra').setDescription('Trả nợ').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền trả').setRequired(true)),
  new SlashCommandBuilder().setName('laylai').setDescription('Lấy tiền lãi'),

  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng đại gia'),

  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('Cộng tiền cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi được cộng tiền').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền muốn cộng').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setexp')
    .setDescription('Cài đặt hoặc cộng điểm EXP / Rank cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
    .addIntegerOption(o => o.setName('exp').setDescription('Số điểm EXP muốn cộng thêm (hoặc trừ nếu điền số âm)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setvip')
    .setDescription('Set VIP cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi nhận VIP').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setmoney')
    .setDescription('Cài đặt số tiền của người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi cần sửa số dư').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền mới').setRequired(true)),

  new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Gửi thông báo toàn server (Owner)')
    .addStringOption(o => o.setName('noidung').setDescription('Nội dung thông báo').setRequired(true)),

  new SlashCommandBuilder()
    .setName('lixi')
    .setDescription('Phát lì xì (Owner)')
    .addIntegerOption(o => o.setName('tongtien').setDescription('Tổng tiền lì xì').setRequired(true))
    .addIntegerOption(o => o.setName('sobao').setDescription('Số lượng bao lì xì').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🚀 Bot đã online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Đã đăng ký tất cả lệnh Slash Command thành công!');
  } catch (err) {
    console.error('❌ Lỗi đăng ký lệnh:', err);
  }

  startAutoTxLoop();
  startLotteryCron();
});

function startLotteryCron() {
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 18 && now.getMinutes() === 30 && now.getSeconds() < 10) {
      const luckyNum = Math.floor(Math.random() * 100);

      db.all(`SELECT lottery_channel_id FROM guild_settings WHERE lottery_channel_id IS NOT NULL`, [], async (err, rows) => {
        if (err || !rows) return;

        db.all(`SELECT user_id FROM lottery_tickets WHERE number = ?`, [luckyNum], async (e, winners) => {
          let winnerText = "Không có ai trúng thưởng hôm nay!";
          if (winners && winners.length > 0) {
            const rewardPerPerson = Math.floor(100000 / winners.length);
            const winnerMentions = [];
            for (const w of winners) {
              await updateBalance(w.user_id, rewardPerPerson);
              winnerMentions.push(`<@${w.user_id}> (+${rewardPerPerson.toLocaleString()} xu)`);
            }
            winnerText = `🎉 **NGƯỜI TRÚNG THƯỞNG:**\n${winnerMentions.join('\n')}`;
          }

          const embed = new EmbedBuilder()
            .setTitle('🎟️ KẾT QUẢ VÉ SỐ KIẾN THIẾT (18:30)')
            .setColor('#ff0055')
            .setDescription(`🎲 Con số may mắn hôm nay là: **[ ${luckyNum < 10 ? '0' + luckyNum : luckyNum} ]**\n\n${winnerText}`)
            .setFooter({ text: 'Tất cả vé số cũ đã được làm mới cho ngày mai!' });

          for (const row of rows) {
            const ch = await client.channels.fetch(row.lottery_channel_id).catch(() => null);
            if (ch) ch.send({ embeds: [embed] });
          }

          db.run(`DELETE FROM lottery_tickets`);
        });
      });
    }
  }, 10000);
}

const activeSessions = new Map();

async function startSingleTxSession(channel) {
  if (activeSessions.has(channel.id)) return;

  const session = { timeLeft: 40, totalTai: 0, totalXiu: 0, bets: new Map(), message: null };
  activeSessions.set(channel.id, session);

  await channel.send('🎲 **Đặt cược Tài Xỉu đã bắt đầu! Thời gian đặt cược là 40 giây.**');

  const renderEmbed = () => new EmbedBuilder()
    .setColor('#ff9900')
    .setDescription(
      `🎲 **Đặt cược Tài Xỉu!**\nThời gian còn lại: **${session.timeLeft}s**.\n\n` +
      `**Tổng Tài:** ${session.totalTai.toLocaleString()}$\n` +
      `**Tổng Xỉu:** ${session.totalXiu.toLocaleString()}$\n` +
      `**Số người cược:** ${session.bets.size}`
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tx_btn_tai').setLabel('Tài').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_xiu').setLabel('Xỉu').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_cancel').setLabel('Hủy cược').setStyle(ButtonStyle.Danger)
  );

  session.message = await channel.send({ embeds: [renderEmbed()], components: [buttons] });

  const timer = setInterval(async () => {
    session.timeLeft -= 5;
    if (session.timeLeft <= 0) {
      clearInterval(timer);
      await finishTxSession(channel, session);
    } else {
      session.message.edit({ embeds: [renderEmbed()] }).catch(() => {});
    }
  }, 5000);
}

async function finishTxSession(channel, session) {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const d3 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2 + d3;
  const result = total >= 11 ? 'tai' : 'xiu';

  let summary = `🎲 **KẾT QUẢ TÀI XỈU:** **${d1} - ${d2} -${d3}** (Tổng: **${total}** - **${result.toUpperCase()}**)\n\n`;

  if (session.bets.size === 0) {
    summary += '❌ Không có ai tham gia đặt cược!';
  } else {
    for (const [userId, bet] of session.bets.entries()) {
      if (bet.choice === result) {
        const winAmt = bet.amount * 2;
        await updateBalance(userId, winAmt);
        addEXP(userId, 15);
        db.run(`UPDATE users SET quest_gamble = quest_gamble + 1 WHERE id = ?`, [userId]);
        summary += `🎉 <@${userId}> thắng **+${bet.amount.toLocaleString()}** xu!\n`;
      } else {
        addEXP(userId, 5);
        summary += `💸 <@${userId}> thua **-${bet.amount.toLocaleString()}** xu!\n`;
      }
    }
  }

  activeSessions.delete(channel.id);
  await channel.send({ embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(summary)] });
}

function startAutoTxLoop() {
  setInterval(() => {
    db.all(`SELECT tx_channel_id FROM guild_settings WHERE tx_channel_id IS NOT NULL`, [], async (err, rows) => {
      if (err || !rows) return;
      for (const row of rows) {
        const channel = await client.channels.fetch(row.tx_channel_id).catch(() => null);
        if (channel && !activeSessions.has(channel.id)) startSingleTxSession(channel);
      }
    });
  }, 10000);
}

// 5. Interaction Handler
client.on('interactionCreate', async (i) => {
  // Xử lý nút bấm cầu hôn
  if (i.isButton() && (i.customId.startsWith('marry_accept_') || i.customId.startsWith('marry_deny_'))) {
    const [, action, proposerId, targetId] = i.customId.split('_');

    if (i.user.id !== targetId) {
      return i.reply({ content: '❌ Lời cầu hôn này không dành cho bạn!', ephemeral: true });
    }

    if (action === 'deny') {
      return i.update({
        content: `💔 <@${targetId}> đã từ chối lời cầu hôn của <@${proposerId}>!`,
        components: []
      });
    }

    if (action === 'accept') {
      db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [targetId, proposerId]);
      db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [proposerId, targetId]);

      return i.update({
        content: `🎉 **CHÚC MỪNG HP!** <@${proposerId}> và <@${targetId}> đã chính thức nên duyên vợ chồng! 👩‍❤️‍👨`,
        components: []
      });
    }
  }

  // Xử lý nút bấm Tài Xỉu
  if (i.isButton()) {
    const session = activeSessions.get(i.channelId);
    if (!session) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });

    if (i.customId === 'tx_btn_cancel') {
      const userBet = session.bets.get(i.user.id);
      if (!userBet) return i.reply({ content: '❌ Bạn chưa đặt cược!', ephemeral: true });

      await updateBalance(i.user.id, userBet.amount);
      if (userBet.choice === 'tai') session.totalTai -= userBet.amount;
      else session.totalXiu -= userBet.amount;

      session.bets.delete(i.user.id);
      return i.reply({ content: `✅ Đã hủy cược và nhận lại **${userBet.amount.toLocaleString()}** xu!`, ephemeral: true });
    }

    if (i.customId === 'tx_btn_tai' || i.customId === 'tx_btn_xiu') {
      const choice = i.customId === 'tx_btn_tai' ? 'tai' : 'xiu';
      const modal = new ModalBuilder().setCustomId(`tx_modal_${choice}`).setTitle(`Đặt cược ${choice.toUpperCase()}`);
      const input = new TextInputBuilder().setCustomId('tx_bet_amount').setLabel('Nhập số tiền cược:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return i.showModal(modal);
    }
  }

  if (i.isModalSubmit() && i.customId.startsWith('tx_modal_')) {
    const session = activeSessions.get(i.channelId);
    if (!session) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });

    const choice = i.customId.replace('tx_modal_', '');
    const amt = parseInt(i.fields.getTextInputValue('tx_bet_amount'));
    if (isNaN(amt) || amt <= 0) return i.reply({ content: '❌ Tiền cược không hợp lệ!', ephemeral: true });

    const uData = await getUser(i.user.id);
    if (uData.balance < amt) return i.reply({ content: '❌ Số dư không đủ!', ephemeral: true });

    if (session.bets.has(i.user.id)) return i.reply({ content: '❌ Bạn đã cược phiên này rồi!', ephemeral: true });

    await updateBalance(i.user.id, -amt);
    session.bets.set(i.user.id, { choice, amount: amt });

    if (choice === 'tai') session.totalTai += amt;
    else session.totalXiu += amt;

    return i.reply({ content: `✅ Đã cược **${amt.toLocaleString()}** xu vào cửa **${choice.toUpperCase()}**!`, ephemeral: true });
  }

  if (!i.isChatInputCommand()) return;

  const { commandName: cmd, user, options, guildId } = i;
  const uid = user.id;
  const isBotOwner = (id) => id === process.env.OWNER_ID || id === CO_OWNER_ID;

  const uData = await getUser(uid);
  checkResetQuest(uData);

  // Menu Help đầy đủ
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🎰 MENU TẤT CẢ CÁC LỆNH CASINO & BĂNG NHÓM')
      .setDescription('Dưới đây là danh sách đầy đủ các lệnh hiện có của Bot:')
      .addFields(
        { 
          name: '🎟️ Hệ Thống Mới', 
          value: '`/rank` • `/quest` • `/baohiem` • `/veso buy` • `/veso list`', 
          inline: false 
        },
        { 
          name: '⚙️ Cấu Hình Kênh (Admin)', 
          value: '`/settxchannel` • `/canceltxchannel` • `/setlotterychannel`', 
          inline: false 
        },
        { 
          name: '🎲 Game Casino', 
          value: '`/cl` • `/hu` • `/xidach` • `/baucua` • `/xocdia`', 
          inline: false 
        },
        { 
          name: '💼 Cày Cấy & Cướp Tiền', 
          value: '`/work` • `/crime` • `/rob` • `/daily` • `/sodu` • `/top`', 
          inline: false 
        },
        { 
          name: '🏦 Ngân Hàng', 
          value: '`/gui` • `/rut` • `/vay` • `/tra` • `/laylai`', 
          inline: false 
        },
        { 
          name: '❤️ Tình Cảm & Thú Cưng', 
          value: '`/marry` • `/divorce` • `/pet info` • `/pet buy` • `/pet feed`', 
          inline: false 
        },
        { 
          name: '🏴‍☠️ Băng Nhóm & Truy Nã', 
          value: '`/gang create` • `/gang info` • `/truyna`', 
          inline: false 
        },
        { 
          name: '💬 Tương Tác & Chuyển Tiền', 
          value: '`/pay` • `/hug` • `/kiss` • `/slap` • `/pat` • `/info`', 
          inline: false 
        },
        { 
          name: '👑 Owner / Admin', 
          value: '`/addmoney` • `/setmoney` • `/setexp` • `/setvip` • `/broadcast` • `/lixi`', 
          inline: false 
        }
      )
      .setFooter({ text: 'Dùng / [tên lệnh] để sử dụng!' });

    return i.reply({ embeds: [embed] });
  }

  // Lệnh Cầu Hôn (/marry)
  if (cmd === 'marry') {
    const target = options.getUser('target');

    if (target.id === uid) return i.reply({ content: '❌ Bạn không thể tự kết hôn với chính mình!', ephemeral: true });
    if (target.bot) return i.reply({ content: '❌ Bạn không thể kết hôn với Bot!', ephemeral: true });
    if (uData.married_with) return i.reply({ content: `❌ Bạn đã kết hôn với <@${uData.married_with}> rồi!`, ephemeral: true });

    const tData = await getUser(target.id);
    if (tData.married_with) return i.reply({ content: `❌ <@${target.id}> đã có bạn đời rồi!`, ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`marry_accept_${uid}_${target.id}`).setLabel('Đồng Ý 💕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`marry_deny_${uid}_${target.id}`).setLabel('Từ Chối 💔').setStyle(ButtonStyle.Danger)
    );

    return i.reply({
      content: `💍 <@${target.id}> ơi! <@${uid}> đang ngỏ lời cầu hôn bạn. Bạn có đồng ý không?`,
      components: [row]
    });
  }

  // Lệnh Ly Hôn (/divorce)
  if (cmd === 'divorce') {
    if (!uData.married_with) return i.reply({ content: '❌ Bạn đang độc thân, không thể ly hôn!', ephemeral: true });

    const exPartnerId = uData.married_with;
    db.run(`UPDATE users SET married_with = NULL WHERE id = ? OR id = ?`, [uid, exPartnerId]);

    return i.reply(`💔 <@${uid}> và <@${exPartnerId}> đã chính thức chia tay...`);
  }

  // Lệnh Băng Nhóm (/gang)
  if (cmd === 'gang') {
    const sub = options.getSubcommand();

    // 1. Tạo Băng Nhóm (/gang create)
    if (sub === 'create') {
      if (uData.gang_id) {
        return i.reply({ content: '❌ Bạn đã ở trong một Băng Nhóm rồi! Hãy rời bang trước khi tạo mới.', ephemeral: true });
      }

      const cost = 50000; // Phí tạo bang
      if (uData.balance < cost) {
        return i.reply({ content: `❌ Chi phí thành lập Băng Nhóm là **${cost.toLocaleString()}** xu! Bạn không đủ tiền.`, ephemeral: true });
      }

      const gangName = options.getString('tenbang');
      const gangId = `gang_${Date.now()}`;

      // Trừ tiền và tạo Bang
      await updateBalance(uid, -cost);
      db.run(`INSERT INTO gangs (id, name, owner_id, fund) VALUES (?, ?, ?, ?)`, [gangId, gangName, uid, 0]);
      db.run(`UPDATE users SET gang_id = ? WHERE id = ?`, [gangId, uid]);

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏴‍☠️ THÀNH LẬP BĂNG NHÓM THÀNH CÔNG!')
        .setDescription(`Băng nhóm **${gangName}** đã được lập bởi Bang chủ <@${uid}>!`)
        .addFields(
          { name: '💰 Phí thành lập', value: `${cost.toLocaleString()} xu`, inline: true },
          { name: '🛡️ Quỹ bang ban đầu', value: '0 xu', inline: true }
        );

      return i.reply({ embeds: [embed] });
    }

    // 2. Xem thông tin Băng Nhóm (/gang info)
    if (sub === 'info') {
      if (!uData.gang_id) {
        return i.reply({ content: '❌ Bạn hiện tại chưa gia nhập Băng Nhóm nào!', ephemeral: true });
      }

      const gang = await getGang(uData.gang_id);
      if (!gang) {
        return i.reply({ content: '❌ Băng nhóm của bạn không tồn tại hoặc đã bị giải tán!', ephemeral: true });
      }

      // Đếm số lượng thành viên
      db.all(`SELECT id FROM users WHERE gang_id = ?`, [gang.id], (err, members) => {
        const memberCount = members ? members.length : 1;

        const embed = new EmbedBuilder()
          .setColor('#9b59b6')
          .setTitle(`🏴‍☠️ BĂNG NHÓM: ${gang.name}`)
          .addFields(
            { name: '👑 Bang Chủ', value: `<@${gang.owner_id}>`, inline: true },
            { name: '👥 Thành Viên', value: `\`${memberCount} thành viên\``, inline: true },
            { name: '💰 Quỹ Băng Nhóm', value: `**${(gang.fund || 0).toLocaleString()}** xu`, inline: false }
          )
          .setFooter({ text: 'Gia nhập băng nhóm để cùng nhau xưng bá Casino!' });

        return i.reply({ embeds: [embed] });
      });
      return;
    }
  }

  // Lệnh Set EXP / Add Rank dành cho Owner (/setexp)
  if (cmd === 'setexp') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });

    const target = options.getUser('user');
    const expAmount = options.getInteger('exp');

    await getUser(target.id);
    addEXP(target.id, expAmount);

    const updatedData = await getUser(target.id);
    const { lvl, title } = getTitle(updatedData.exp);

    return i.reply(`⚡ Đã cộng/trừ **${expAmount} EXP** cho <@${target.id}>!\n📊 EXP hiện tại: **${updatedData.exp}** (Cấp **Lvl ${lvl}** - **${title}**)`);
  }

  if (cmd === 'rank') {
    const { lvl, title } = getTitle(uData.exp);
    const expNext = (lvl + 1) * 100;
    const embed = new EmbedBuilder()
      .setTitle(`📊 RANK & DANH HIỆU: ${user.username}`)
      .setColor('#00d2d3')
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '🎖️ Danh Hiệu', value: `**${title}**`, inline: true },
        { name: '⭐ Cấp Độ (Level)', value: `\`Lvl ${lvl}\``, inline: true },
        { name: '✨ Kinh Nghiệm (EXP)', value: `\`${uData.exp} / ${expNext} EXP\``, inline: false }
      );
    return i.reply({ embeds: [embed] });
  }

  if (cmd === 'quest') {
    const q1 = uData.quest_work >= 3 ? '✅' : `❌ (${uData.quest_work}/3)`;
    const q2 = uData.quest_gamble >= 3 ? '✅' : `❌ (${uData.quest_gamble}/3)`;

    if (uData.quest_work >= 3 && uData.quest_gamble >= 3 && uData.quest_done === 0) {
      await updateBalance(uid, 30000);
      db.run(`UPDATE users SET quest_done = 1 WHERE id = ?`, [uid]);
      return i.reply('🎉 **HOÀN THÀNH TẤT CẢ NHIỆM VỤ!** Bạn nhận được phần thưởng **+30.000 xu**!');
    }

    const embed = new EmbedBuilder()
      .setTitle(`📜 NHIỆM VỤ HÀNG NGÀY`)
      .setColor('#ff9f43')
      .setDescription(
        `1. Thực hiện lệnh \`/work\` 3 lần: ${q1}\n` +
        `2. Thắng 3 phiên Tài Xỉu Auto: ${q2}\n\n` +
        `🎁 **Phần thưởng:** 30.000 xu (Tự động nhận khi hoàn tất cả 2 nhiệm vụ)`
      );
    return i.reply({ embeds: [embed] });
  }

  if (cmd === 'baohiem') {
    const now = Date.now();
    if (uData.insurance_until > now) {
      const hoursLeft = Math.ceil((uData.insurance_until - now) / 3600000);
      return i.reply(`🛡️ Bảo hiểm của bạn vẫn còn hiệu lực trong **${hoursLeft} giờ** nữa!`);
    }
    if (uData.balance < 10000) return i.reply({ content: '❌ Cần 10.000 xu để mua bảo hiểm!', ephemeral: true });

    await updateBalance(uid, -10000);
    const expireTime = now + 86400000;
    db.run(`UPDATE users SET insurance_until = ? WHERE id = ?`, [expireTime, uid]);

    return i.reply('🛡️ **Mua thành công gói Bảo Hiểm Chống Cướp (24h)!** Nếu bị cướp, Bảo hiểm sẽ đền bù 80% số tiền bị mất.');
  }

  if (cmd === 'veso') {
    const sub = options.getSubcommand();
    if (sub === 'buy') {
      const num = options.getInteger('sonchon');
      if (uData.balance < 5000) return i.reply({ content: '❌ Giá mỗi vé là 5.000 xu!', ephemeral: true });

      await updateBalance(uid, -5000);
      db.run(`INSERT INTO lottery_tickets (user_id, number) VALUES (?, ?)`, [uid, num]);

      return i.reply(`🎟️ Bạn đã mua thành công vé số **[ ${num < 10 ? '0' + num : num} ]** với giá 5.000 xu! Kết quả quay thưởng lúc 18:30.`);
    }

    if (sub === 'list') {
      db.all(`SELECT number FROM lottery_tickets WHERE user_id = ?`, [uid], (err, rows) => {
        if (!rows || rows.length === 0) return i.reply({ content: '🎫 Bạn chưa mua vé số nào hôm nay!', ephemeral: true });
        const nums = rows.map(r => `\`${r.number < 10 ? '0' + r.number : r.number}\``).join(', ');
        return i.reply(`🎟️ Các con số bạn đang sở hữu: ${nums}`);
      });
      return;
    }
  }

  if (cmd === 'setlotterychannel') {
    const ch = options.getChannel('kenh');
    db.run(`INSERT INTO guild_settings (guild_id, lottery_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET lottery_channel_id = ?`, [guildId, ch.id, ch.id]);
    return i.reply(`✅ Đã cài đặt kênh <#${ch.id}> làm kênh trả kết quả Vé Số lúc 18:30!`);
  }

  if (cmd === 'info') {
    const app = await client.application.fetch();
    const primaryOwner = app.owner;
    let ownersText = `<@${CO_OWNER_ID}>`;
    if (primaryOwner) ownersText = `<@${primaryOwner.id}> & <@${CO_OWNER_ID}>`;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🤖 THÔNG TIN BOT: ${client.user.username}`)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: '📛 Tên Bot', value: `**${client.user.tag}**`, inline: true },
        { name: '👑 Chủ Sở Hữu', value: ownersText, inline: true },
        { name: '🌐 Máy chủ', value: `\`${client.guilds.cache.size}\` server`, inline: true }
      );
    return i.reply({ embeds: [embed] });
  }

  if (cmd === 'settxchannel') {
    const targetChannel = options.getChannel('kenh');
    db.run(`INSERT INTO guild_settings (guild_id, tx_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET tx_channel_id = ?`, [guildId, targetChannel.id, targetChannel.id]);
    return i.reply(`✅ Đã chọn <#${targetChannel.id}> làm **Sòng Auto Tài Xỉu**!`);
  }

  if (cmd === 'canceltxchannel') {
    db.run(`UPDATE guild_settings SET tx_channel_id = NULL WHERE guild_id = ?`, [guildId]);
    return i.reply(`🛑 Đã tắt sòng Auto Tài Xỉu.`);
  }

  if (cmd === 'rob') {
    const target = options.getUser('target');
    if (target.id === uid) return i.reply({ content: '❌ Không thể tự cướp chính mình!', ephemeral: true });

    const tData = await getUser(target.id);
    if (tData.balance < 2000) return i.reply({ content: '❌ Đối phương quá nghèo!', ephemeral: true });

    const now = Date.now();
    if (now - uData.last_rob < 900000) return i.reply({ content: '⏳ Hãy đợi 15 phút!', ephemeral: true });

    db.run(`UPDATE users SET last_rob = ? WHERE id = ?`, [now, uid]);

    if (Math.random() > 0.5) {
      const robAmt = Math.floor(tData.balance * 0.2);
      await updateBalance(target.id, -robAmt);
      await updateBalance(uid, robAmt);

      let insuranceMsg = '';
      if (tData.insurance_until > now) {
        const refund = Math.floor(robAmt * 0.8);
        await updateBalance(target.id, refund);
        insuranceMsg = `\n🛡️ Do <@${target.id}> có **Bảo Hiểm**, công ty bảo hiểm đã đền bù lại **+${refund.toLocaleString()}** xu!`;
      }

      return i.reply(`💥 Cướp thành công **${robAmt.toLocaleString()}** xu từ <@${target.id}>!${insuranceMsg}`);
    } else {
      return i.reply(`🛡️ Cướp thất bại, đối phương phản công né được!`);
    }
  }

  if (cmd === 'work') {
    const now = Date.now();
    if (now - uData.last_work < 300000) return i.reply({ content: '⏳ Đợi 5 phút nữa!', ephemeral: true });

    const earn = Math.floor(Math.random() * 2000) + 1000;
    db.run(`UPDATE users SET balance = balance + ?, last_work = ?, quest_work = quest_work + 1 WHERE id = ?`, [earn, now, uid]);
    addEXP(uid, 10);

    return i.reply(`💼 Bạn nhận công làm việc **+${earn.toLocaleString()}** xu (+10 EXP)!`);
  }

  if (cmd === 'cl') {
    const choice = options.getString('luachon'), bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Không đủ tiền cược!', ephemeral: true });
    const num = Math.floor(Math.random() * 100);
    const isChan = num % 2 === 0;
    const win = (choice === 'chan' && isChan) || (choice === 'le' && !isChan);

    if (win) {
      await updateBalance(uid, bet);
      addEXP(uid, 10);
      return i.reply(`🔢 Số ra: **${num}** (${isChan ? 'CHẮN' : 'LẺ'}). Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      addEXP(uid, 3);
      return i.reply(`🔢 Số ra: **${num}** (${isChan ? 'CHẮN' : 'LẺ'}). Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'daily') {
    const now = Date.now();
    if (now - uData.last_daily < 86400000) return i.reply({ content: '⏳ Đã nhận quà hôm nay rồi!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + 5000, last_daily = ? WHERE id = ?`, [now, uid]);
    return i.reply('🎉 Bạn nhận được điểm danh +5,000 xu!');
  }

  if (cmd === 'sodu') {
    return i.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle(`💰 Tài Khoản ${user.username}`)
      .setDescription(`• Số dư ví: ${uData.balance.toLocaleString()} xu\n• Ngân hàng: ${uData.bank.toLocaleString()} xu`)] });
  }

  if (cmd === 'top') {
    db.all(`SELECT id, (balance + bank) as total FROM users ORDER BY total DESC LIMIT 5`, [], (err, rows) => {
      let txt = rows.map((r, idx) => `**#${idx + 1}** <@${r.id}>: **${r.total.toLocaleString()}** xu`).join('\n');
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🏆 BẢNG XẾP HẠNG ĐẠI GIA').setDescription(txt || 'Chưa có dữ liệu')] });
    });
    return;
  }

  if (cmd === 'addmoney') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });
    const target = options.getUser('user'), amt = options.getInteger('sotien');
    await updateBalance(target.id, amt);
    return i.reply(`💵 Đã cộng **${amt.toLocaleString()}** xu cho <@${target.id}>!`);
  }

  if (cmd === 'setmoney') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });
    const target = options.getUser('user'), amt = options.getInteger('sotien');
    db.run(`UPDATE users SET balance = ? WHERE id = ?`, [amt, target.id]);
    return i.reply(`🧹 Đã cài số dư của <@${target.id}> thành **${amt.toLocaleString()}** xu!`);
  }
});

client.login(process.env.DISCORD_TOKEN);
