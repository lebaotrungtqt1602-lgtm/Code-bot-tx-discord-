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
const sqlite3 = require('sqlite3').verbose();

// ID Chủ Bot (Owner)
const CO_OWNER_ID = 'ĐIỀN_ID_DISCORD_CỦA_BẠN_VÀO_ĐÂY'; 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// CSDL SQLite
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
  db.run(`CREATE TABLE IF NOT EXISTS jackpot (id INTEGER PRIMARY KEY, amount INTEGER DEFAULT 50000)`);
  db.run(`CREATE TABLE IF NOT EXISTS gangs (id TEXT PRIMARY KEY, name TEXT, owner_id TEXT, fund INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, tx_channel_id TEXT DEFAULT NULL, lottery_channel_id TEXT DEFAULT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS lottery_tickets (user_id TEXT, number INTEGER)`);
  db.run(`INSERT OR IGNORE INTO jackpot (id, amount) VALUES (1, 50000)`);
});

const getUser = (id) => new Promise((resolve) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (id) VALUES (?)`, [id], () => resolve({ 
        id, balance: 1000, bank: 0, debt: 0, last_daily: 0, last_work: 0, last_crime: 0, last_rob: 0, last_interest: 0, 
        is_vip: 0, married_with: null, pet_type: null, pet_level: 1, bounty: 0, gang_id: null, exp: 0, 
        insurance_until: 0, quest_work: 0, quest_gamble: 0, quest_done: 0, last_quest_reset: 0 
      }));
    } else resolve(row);
  });
});

const getGang = (gangId) => new Promise(resolve => db.get(`SELECT * FROM gangs WHERE id = ?`, [gangId], (err, row) => resolve(row)));
const updateBalance = (id, amount) => new Promise(resolve => db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, id], resolve));
const addEXP = (id, expGain) => new Promise(resolve => db.run(`UPDATE users SET exp = exp + ? WHERE id = ?`, [expGain, id], resolve));

const checkResetQuest = (uData) => {
  const now = Date.now();
  if (now - uData.last_quest_reset > 86400000) {
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

// Khai báo toàn bộ danh sách lệnh Slash Commands đầy đủ
const commands = [
  new SlashCommandBuilder().setName('info').setDescription('Xem thông tin chi tiết về Bot'),
  new SlashCommandBuilder().setName('help').setDescription('Xem menu trợ giúp đầy đủ'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví và ngân hàng'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng điểm danh hằng ngày'),
  new SlashCommandBuilder().setName('rank').setDescription('Xem cấp độ, EXP và danh hiệu cá nhân'),
  new SlashCommandBuilder().setName('quest').setDescription('Xem và nhận thưởng nhiệm vụ hàng ngày'),
  new SlashCommandBuilder().setName('baohiem').setDescription('Mua bảo hiểm chống cướp tiền mặt (10.000 xu / 24h)'),
  new SlashCommandBuilder().setName('veso').setDescription('Hệ thống vé số quay thưởng 18:30 hàng ngày')
    .addSubcommand(s => s.setName('buy').setDescription('Mua vé số (5.000 xu / vé)').addIntegerOption(o => o.setName('sonchon').setDescription('Chọn số từ 0 đến 99').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand(s => s.setName('list').setDescription('Xem các con số bạn đã mua')),
  new SlashCommandBuilder().setName('setlotterychannel').setDescription('Chọn kênh thông báo vé số (Admin)').addChannelOption(o => o.setName('kenh').setDescription('Chọn kênh').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('settxchannel').setDescription('Thiết lập kênh đặt cược Tài Xỉu tự động').addChannelOption(o => o.setName('kenh').setDescription('Chọn kênh').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('canceltxchannel').setDescription('Tắt Auto Tài Xỉu').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('cl').setDescription('Chơi Chẵn Lẻ').addStringOption(o => o.setName('luachon').setDescription('Chẵn/Lẻ').setRequired(true).addChoices({name:'Chẵn',value:'chan'},{name:'Lẻ',value:'le'})).addIntegerOption(o => o.setName('tiencuoc').setDescription('Tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('work').setDescription('Làm việc kiếm xu'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm việc phi pháp rủi ro cao'),
  new SlashCommandBuilder().setName('rob').setDescription('Cướp tiền người khác').addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
  new SlashCommandBuilder().setName('marry').setDescription('Cầu hôn').addUserOption(o => o.setName('target').setDescription('Người phối ngẫu').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn'),
  new SlashCommandBuilder().setName('gang').setDescription('Hệ thống Băng Nhóm')
    .addSubcommand(s => s.setName('create').setDescription('Tạo bang').addStringOption(o => o.setName('tenbang').setDescription('Tên bang').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Xem bang')),
  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền vào ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng đại gia'),
  new SlashCommandBuilder().setName('addmoney').setDescription('Cộng tiền (Owner)').addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)).addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('setexp').setDescription('Cài đặt EXP (Owner)').addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)).addIntegerOption(o => o.setName('exp').setDescription('Số điểm EXP').setRequired(true)),
  new SlashCommandBuilder().setName('setmoney').setDescription('Cài đặt số tiền (Owner)').addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)).addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const activeSessions = new Map();

client.once('ready', async () => {
  console.log(`🚀 Bot đã online hoàn tất: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Đã đăng ký tất cả lệnh Slash Command với Discord!');
  } catch (err) { console.error('❌ Lỗi đăng ký lệnh:', err); }
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
          const embed = new EmbedBuilder().setTitle('🎟️ KẾT QUẢ VÉ SỐ').setColor('#ff0055').setDescription(`🎲 Số may mắn: **[ ${luckyNum} ]**\n\n${winnerText}`);
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

async function startSingleTxSession(channel) {
  if (activeSessions.has(channel.id)) return;
  const session = { timeLeft: 40, totalTai: 0, totalXiu: 0, bets: new Map(), message: null };
  activeSessions.set(channel.id, session);
  const renderEmbed = () => new EmbedBuilder().setColor('#ff9900').setDescription(`🎲 **Đặt cược Tài Xỉu!**\nThời gian: **${session.timeLeft}s**.\n**Tổng Tài:** ${session.totalTai}$\n**Tổng Xỉu:** ${session.totalXiu}$`);
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
  const total = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  const result = total >= 11 ? 'tai' : 'xiu';
  let summary = `🎲 **KẾT QUẢ:** Tổng **${total}** - **${result.toUpperCase()}**\n\n`;
  if (session.bets.size === 0) summary += '❌ Không có ai tham gia đặt cược!';
  else {
    for (const [userId, bet] of session.bets.entries()) {
      if (bet.choice === result) {
        await updateBalance(userId, bet.amount * 2);
        summary += `🎉 <@${userId}> thắng **+${bet.amount}** xu!\n`;
      } else summary += `💸 <@${userId}> thua **-${bet.amount}** xu!\n`;
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

client.on('interactionCreate', async (i) => {
  if (i.isButton() && (i.customId.startsWith('marry_accept_') || i.customId.startsWith('marry_deny_'))) {
    const [, action, proposerId, targetId] = i.customId.split('_');
    if (i.user.id !== targetId) return i.reply({ content: '❌ Lời cầu hôn này không dành cho bạn!', ephemeral: true });
    if (action === 'deny') return i.update({ content: `💔 <@${targetId}> đã từ chối!`, components: [] });
    db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [targetId, proposerId]);
    db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [proposerId, targetId]);
    return i.update({ content: `🎉 **CHÚC MỪNG HẠNH PHÚC!** <@${proposerId}> và <@${targetId}> đã kết hôn! 👩‍❤️‍👨`, components: [] });
  }

  if (i.isButton() && i.customId.startsWith('tx_btn_')) {
    const session = activeSessions.get(i.channelId);
    if (!session) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });
    if (i.customId === 'tx_btn_cancel') {
      const userBet = session.bets.get(i.user.id);
      if (!userBet) return i.reply({ content: '❌ Bạn chưa đặt cược!', ephemeral: true });
      await updateBalance(i.user.id, userBet.amount);
      if (userBet.choice === 'tai') session.totalTai -= userBet.amount; else session.totalXiu -= userBet.amount;
      session.bets.delete(i.user.id);
      return i.reply({ content: `✅ Đã hủy cược thành công!`, ephemeral: true });
    }
    const choice = i.customId === 'tx_btn_tai' ? 'tai' : 'xiu';
    const modal = new ModalBuilder().setCustomId(`tx_modal_${choice}`).setTitle(`Cược ${choice.toUpperCase()}`);
    const input = new TextInputBuilder().setCustomId('tx_bet_amount').setLabel('Nhập số tiền cược:').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return i.showModal(modal);
  }

  if (i.isModalSubmit() && i.customId.startsWith('tx_modal_')) {
    const session = activeSessions.get(i.channelId);
    if (!session) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });
    const choice = i.customId.replace('tx_modal_', '');
    const amt = parseInt(i.fields.getTextInputValue('tx_bet_amount'));
    const uData = await getUser(i.user.id);
    if (isNaN(amt) || amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Số dư không đủ hoặc sai định dạng!', ephemeral: true });
    if (session.bets.has(i.user.id)) return i.reply({ content: '❌ Bạn đã cược phiên này rồi!', ephemeral: true });
    await updateBalance(i.user.id, -amt);
    session.bets.set(i.user.id, { choice, amount: amt });
    if (choice === 'tai') session.totalTai += amt; else session.totalXiu += amt;
    return i.reply({ content: `✅ Đã cược **${amt.toLocaleString()}** xu vào **${choice.toUpperCase()}**!`, ephemeral: true });
  }

  if (!i.isChatInputCommand()) return;
  await i.deferReply();

  const { commandName: cmd, user, options } = i;
  const uid = user.id;
  const isBotOwner = (id) => id === process.env.OWNER_ID || id === CO_OWNER_ID;
  const uData = await getUser(uid);
  checkResetQuest(uData);

  if (cmd === 'help') return i.editReply('📜 **Menu trợ giúp:** Sử dụng các lệnh như `/sodu`, `/work`, `/daily`, `/cl`, `/gang`, `/marry`, `/veso`, v.v.');
  
  if (cmd === 'sodu') return i.editReply(`💰 Số dư ví: **${uData.balance.toLocaleString()}** xu | Ngân hàng: **${uData.bank.toLocaleString()}** xu`);
  
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - uData.last_daily < 86400000) return i.editReply('⏳ Bạn đã nhận quà điểm danh hôm nay rồi!');
    db.run(`UPDATE users SET balance = balance + 5000, last_daily = ? WHERE id = ?`, [now, uid]);
    return i.editReply('🎉 Bạn nhận được **+5,000 xu** điểm danh hàng ngày!');
  }

  if (cmd === 'work') {
    const now = Date.now();
    if (now - uData.last_work < 300000) return i.editReply('⏳ Bạn cần nghỉ ngơi, hãy đợi 5 phút nữa!');
    const earn = Math.floor(Math.random() * 2000) + 1000;
    db.run(`UPDATE users SET balance = balance + ?, last_work = ? WHERE id = ?`, [earn, now, uid]);
    await addEXP(uid, 10);
    return i.editReply(`💼 Bạn đi làm kiếm được **+${earn.toLocaleString()}** xu và nhận +10 EXP!`);
  }

  if (cmd === 'cl') {
    const choice = options.getString('luachon'), bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.editReply('❌ Số tiền cược không hợp lệ hoặc không đủ tiền!');
    const num = Math.floor(Math.random() * 100);
    const isChan = num % 2 === 0;
    const win = (choice === 'chan' && isChan) || (choice === 'le' && !isChan);
    if (win) {
      await updateBalance(uid, bet); await addEXP(uid, 10);
      return i.editReply(`🔢 Số ra: **${num}** (${isChan ? 'CHẴN' : 'LẺ'}). Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet); await addEXP(uid, 3);
      return i.editReply(`🔢 Số ra: **${num}** (${isChan ? 'CHẴN' : 'LẺ'}). Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'marry') {
    const target = options.getUser('target');
    if (target.id === uid || target.bot || uData.married_with) return i.editReply('❌ Không thể cầu hôn người này!');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`marry_accept_${uid}_${target.id}`).setLabel('Đồng Ý 💕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`marry_deny_${uid}_${target.id}`).setLabel('Từ Chối 💔').setStyle(ButtonStyle.Danger)
    );
    return i.editReply({ content: `💍 <@${target.id}> ơi! <@${uid}> muốn cầu hôn bạn.`, components: [row] });
  }

  if (cmd === 'divorce') {
    if (!uData.married_with) return i.editReply('❌ Bạn đang độc thân!');
    db.run(`UPDATE users SET married_with = NULL WHERE id = ? OR id = ?`, [uid, uData.married_with]);
    return i.editReply(`💔 Đã ly hôn thành công!`);
  }

  if (cmd === 'gui') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.balance < amt) return i.editReply('❌ Số tiền gửi không hợp lệ!');
    db.run(`UPDATE users SET balance = balance - ?, bank = bank + ? WHERE id = ?`, [amt, amt, uid]);
    return i.editReply(`🏦 Đã gửi **${amt.toLocaleString()}** xu vào ngân hàng.`);
  }

  if (cmd === 'rut') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.bank < amt) return i.editReply('❌ Số tiền rút không hợp lệ hoặc vượt quá số dư ngân hàng!');
    db.run(`UPDATE users SET balance = balance + ?, bank = bank - ? WHERE id = ?`, [amt, amt, uid]);
    return i.editReply(`💵 Đã rút **${amt.toLocaleString()}** xu về ví.`);
  }

  if (cmd === 'gang') {
    const sub = options.getSubcommand();
    if (sub === 'create') {
      if (uData.gang_id || uData.balance < 50000) return i.editReply('❌ Bạn cần ít nhất 50.000 xu và chưa gia nhập bang nào để tạo bang!');
      const gangName = options.getString('tenbang'), gangId = `gang_${Date.now()}`;
      await updateBalance(uid, -50000);
      db.run(`INSERT INTO gangs (id, name, owner_id) VALUES (?, ?, ?)`, [gangId, gangName, uid]);
      db.run(`UPDATE users SET gang_id = ? WHERE id = ?`, [gangId, uid]);
      return i.editReply(`🏴‍☠️ Thành lập băng nhóm **${gangName}** thành công!`);
    }
    if (sub === 'info') {
      if (!uData.gang_id) return i.editReply('❌ Bạn chưa tham gia băng nhóm nào!');
      const gang = await getGang(uData.gang_id);
      return i.editReply(`🏴‍☠️ Băng nhóm: **${gang.name}** | Bang Chủ: <@${gang.owner_id}>`);
    }
  }

  if (cmd === 'top') {
    db.all(`SELECT id, balance + bank as total FROM users ORDER BY total DESC LIMIT 5`, [], (err, rows) => {
      let txt = rows ? rows.map((r, idx) => `**#${idx + 1}** <@${r.id}>: **${r.total.toLocaleString()}** xu`).join('\n') : 'Trống';
      return i.editReply({ embeds: [new EmbedBuilder().setTitle('🏆 BẢNG XẾP HẠNG ĐẠI GIA').setDescription(txt)] });
    });
    return;
  }

  if (cmd === 'setexp') {
    if (!isBotOwner(uid)) return i.editReply('❌ Lệnh này chỉ dành cho chủ bot!');
    const target = options.getUser('user');
    const expAmount = options.getInteger('exp');
    await getUser(target.id);
    await addEXP(target.id, expAmount);
    const updatedData = await getUser(target.id);
    return i.editReply(`⚡ Đã cập nhật EXP cho <@${target.id}>. Tổng EXP hiện tại: **${updatedData.exp}**`);
  }

  if (cmd === 'addmoney') {
    if (!isBotOwner(uid)) return i.editReply('❌ Lệnh này chỉ dành cho chủ bot!');
    await updateBalance(options.getUser('user').id, options.getInteger('sotien'));
    return i.editReply(`💵 Đã cộng tiền thành công cho người chơi!`);
  }

  if (cmd === 'setmoney') {
    if (!isBotOwner(uid)) return i.editReply('❌ Lệnh này chỉ dành cho chủ bot!');
    db.run(`UPDATE users SET balance = ? WHERE id = ?`, [options.getInteger('sotien'), options.getUser('user').id]);
    return i.editReply(`💵 Đã đặt lại số dư mới cho người chơi!`);
  }

  if (cmd === 'info') return i.editReply(`🤖 Bot Casino hoạt động đầy đủ tính năng ổn định trên Render.`);
  
  if (cmd === 'rank') {
    const { lvl, title } = getTitle(uData.exp);
    return i.editReply(`📊 Cấp độ: **Lvl ${lvl}** | Danh hiệu: **${title}** | EXP: **${uData.exp}**`);
  }
});

client.login(process.env.DISCORD_TOKEN);
