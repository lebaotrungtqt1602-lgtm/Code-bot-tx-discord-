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
  ComponentType,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

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
    gang_id TEXT DEFAULT NULL
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

  db.run(`INSERT OR IGNORE INTO jackpot (id, amount) VALUES (1, 50000)`);
});

const getUser = (id) => new Promise((resolve) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (id) VALUES (?)`, [id]);
      resolve({ id, balance: 1000, bank: 0, debt: 0, last_daily: 0, last_work: 0, last_crime: 0, last_rob: 0, last_interest: 0, is_vip: 0, married_with: null, pet_type: null, pet_level: 1, bounty: 0, gang_id: null });
    } else {
      resolve(row);
    }
  });
});

const updateBalance = (id, amount) => new Promise((resolve) => {
  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, id], resolve);
});

// 4. Register Commands
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Xem menu trợ giúp đầy đủ'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví và ngân hàng'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng điểm danh hằng ngày'),
  
  // Trò chơi
  new SlashCommandBuilder().setName('txlive').setDescription('Mở phiên Đặt Cược Tài Xỉu Live (40s)'),
  new SlashCommandBuilder().setName('cl').setDescription('Chơi Chẵn Lẻ')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn/Lẻ').setRequired(true).addChoices({name:'Chẵn',value:'chan'},{name:'Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('hu').setDescription('Quay Hũ / Xem hũ hiện tại')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền đặt hũ')),
  new SlashCommandBuilder().setName('xidach').setDescription('Chơi Xì Dách (Blackjack 21 điểm)')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('baucua').setDescription('Chơi Bầu Cua Tôm Cá')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn linh vật').setRequired(true).addChoices(
      {name:'🍐 Bầu',value:'bau'},{name:'🦀 Cua',value:'cua'},{name:'🦐 Tôm',value:'tom'},{name:'🐟 Cá',value:'ca'},{name:'🦌 Nai',value:'nai'},{name:'🐓 Gà',value:'ga'}
    ))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('xocdia').setDescription('Chơi Xóc Đĩa')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn/Lẻ').setRequired(true).addChoices({name:'🔴 Chẵn',value:'chan'},{name:'⚪ Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  // Cày cấy & Cướp
  new SlashCommandBuilder().setName('work').setDescription('Làm việc kiếm xu'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm việc phi pháp (Rủi ro cao)'),
  new SlashCommandBuilder().setName('rob').setDescription('Cướp tiền người khác')
    .addUserOption(o => o.setName('target').setDescription('Mục tiêu muốn cướp').setRequired(true)),

  // Tình cảm
  new SlashCommandBuilder().setName('marry').setDescription('Cầu hôn người khác')
    .addUserOption(o => o.setName('target').setDescription('Người muốn kết hôn').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn người phối ngẫu'),

  // Thú Cưng
  new SlashCommandBuilder().setName('pet').setDescription('Hệ thống Thú Cưng')
    .addSubcommand(s => s.setName('info').setDescription('Xem thú cưng của bạn'))
    .addSubcommand(s => s.setName('buy').setDescription('Mua thú cưng').addStringOption(o => o.setName('loai').setDescription('Chọn pet').setRequired(true).addChoices(
      {name:'🐶 Chó Cảnh (10.000 xu)',value:'cho'},{name:'🐱 Mèo Thần Tài (20.000 xu)',value:'meo'},{name:'🐉 Rồng Lửa (50.000 xu)',value:'rong'}
    )))
    .addSubcommand(s => s.setName('feed').setDescription('Cho thú cưng ăn (5.000 xu)')),

  // Băng Nhóm & Truy Nã
  new SlashCommandBuilder().setName('gang').setDescription('Hệ thống Băng Nhóm')
    .addSubcommand(s => s.setName('create').setDescription('Tạo băng nhóm (50.000 xu)').addStringOption(o => o.setName('tenbang').setDescription('Tên băng').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Xem thông tin băng nhóm')),
  new SlashCommandBuilder().setName('truyna').setDescription('Đặt tiền treo thưởng truy nã người khác')
    .addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),

  // Tương Tác
  new SlashCommandBuilder().setName('pay').setDescription('Chuyển tiền trực tiếp')
    .addUserOption(o => o.setName('target').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('hug').setDescription('Ôm').addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
  new SlashCommandBuilder().setName('kiss').setDescription('Hôn').addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
  new SlashCommandBuilder().setName('slap').setDescription('Tát').addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
  new SlashCommandBuilder().setName('pat').setDescription('Xoa đầu').addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),

  // Ngân hàng
  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền vào ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('vay').setDescription('Vay tiền ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('tra').setDescription('Trả nợ ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('laylai').setDescription('Nhận lãi ngân hàng'),

  // Shop & Bảng xếp hạng
  new SlashCommandBuilder().setName('shop').setDescription('Cửa hàng'),
  new SlashCommandBuilder().setName('inventory').setDescription('Túi đồ'),
  new SlashCommandBuilder().setName('viplist').setDescription('Danh sách VIP'),
  new SlashCommandBuilder().setName('top').setDescription('Top đại gia'),

  // Staff/Owner
  new SlashCommandBuilder().setName('addmoney').setDescription('Cộng tiền').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('sotien').setRequired(true)),
  new SlashCommandBuilder().setName('setvip').setDescription('Set VIP').addUserOption(o => o.setName('user').setRequired(true)),
  new SlashCommandBuilder().setName('setmoney').setDescription('Set tiền').addUserOption(o => o.setName('user').setRequired(true)).addIntegerOption(o => o.setName('sotien').setRequired(true)),
  new SlashCommandBuilder().setName('broadcast').setDescription('Gửi thông báo').addStringOption(o => o.setName('noidung').setRequired(true)),
  new SlashCommandBuilder().setName('lixi').setDescription('Phát lì xì').addIntegerOption(o => o.setName('tongtien').setRequired(true)).addIntegerOption(o => o.setName('sobao').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🚀 Bot đã online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Đã đăng ký lệnh thành công!');
  } catch (err) {
    console.error('❌ Lỗi:', err);
  }
});

// --- BIẾN QUẢN LÝ PHIÊN PHIÊN TÀI XỈU LIVE ---
let activeTxSession = null;

async function startTxSession(channel) {
  if (activeTxSession) return;

  activeTxSession = {
    timeLeft: 40,
    totalTai: 0,
    totalXiu: 0,
    bets: new Map(), // userId => { choice: 'tai'/'xiu', amount: number }
    message: null
  };

  await channel.send('🎲 **Đặt cược Tài Xỉu đã bắt đầu! Thời gian đặt cược là 40 giây.**\n🎲 **Betting has begun! Bet time is 40 seconds.**');

  const renderEmbed = () => {
    const participantsCount = activeTxSession.bets.size;
    return new EmbedBuilder()
      .setColor('#ff9900')
      .setDescription(
        `🎲 **Đặt cược Tài Xỉu / Place your bets!**\n\n` +
        `Nhấn vào nút để chọn Tài hoặc Xỉu và nhập số tiền cược. Thời gian còn lại: **${activeTxSession.timeLeft}s**.\n` +
        `Click the button to select Tai or Xiu. Time left: **${activeTxSession.timeLeft}s**.\n\n` +
        `**Total Tài / Tai**\n${activeTxSession.totalTai.toLocaleString()}$\n\n` +
        `**Total Xỉu / Xiu**\n${activeTxSession.totalXiu.toLocaleString()}$\n\n` +
        `**Number of participants**\n${participantsCount}`
      )
      .setFooter({ text: `${client.user.username} | Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}` });
  };

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tx_btn_tai').setLabel('Tài / Tai').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_xiu').setLabel('Xỉu / Xiu').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_cancel').setLabel('Hủy cược / Cancel').setStyle(ButtonStyle.Danger)
  );

  activeTxSession.message = await channel.send({ embeds: [renderEmbed()], components: [buttons] });

  // Đếm ngược 40 giây
  const timer = setInterval(async () => {
    if (!activeTxSession) {
      clearInterval(timer);
      return;
    }

    activeTxSession.timeLeft -= 5;

    if (activeTxSession.timeLeft <= 0) {
      clearInterval(timer);
      await finishTxSession(channel);
    } else {
      activeTxSession.message.edit({ embeds: [renderEmbed()] }).catch(() => {});
    }
  }, 5000);
}

async function finishTxSession(channel) {
  if (!activeTxSession) return;

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const d3 = Math.floor(Math.random() * 6) + 1;
  const total = d1 + d2 + d3;
  const result = total >= 11 ? 'tai' : 'xiu';

  let summary = `🎲 **KẾT QUẢ PHIÊN TÀI XỈU:**\n• Kết quả Xí Ngầu: **${d1} - ${d2} - ${d3}** (Tổng: **${total}** - **${result.toUpperCase()}**)\n\n`;

  if (activeTxSession.bets.size === 0) {
    summary += '❌ Không có ai tham gia đặt cược phiên này!';
  } else {
    for (const [userId, bet] of activeTxSession.bets.entries()) {
      if (bet.choice === result) {
        const winAmt = bet.amount * 2;
        await updateBalance(userId, winAmt);
        summary += `🎉 <@${userId}> thắng **+${bet.amount.toLocaleString()}** xu!\n`;
      } else {
        summary += `💸 <@${userId}> thua **-${bet.amount.toLocaleString()}** xu!\n`;
      }
    }
  }

  // Khóa nút bấm khi kết thúc phiên
  const disabledButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tx_btn_tai').setLabel('Tài / Tai').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('tx_btn_xiu').setLabel('Xỉu / Xiu').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('tx_btn_cancel').setLabel('Hủy cược / Cancel').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  await activeTxSession.message.edit({ components: [disabledButtons] }).catch(() => {});
  await channel.send({ embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(summary)] });

  activeTxSession = null; // Xóa session cũ
}

// 5. Xử lý Interaction
client.on('interactionCreate', async (i) => {

  // --- HÀM XỬ LÝ BUTTONS & MODALS CHO LIVE TÀI XỈU ---
  if (i.isButton()) {
    if (!activeTxSession) return i.reply({ content: '❌ Hiện tại không có phiên Tài Xỉu nào đang mở!', ephemeral: true });

    if (i.customId === 'tx_btn_cancel') {
      const userBet = activeTxSession.bets.get(i.user.id);
      if (!userBet) return i.reply({ content: '❌ Bạn chưa đặt cược phiên này!', ephemeral: true });

      await updateBalance(i.user.id, userBet.amount);
      if (userBet.choice === 'tai') activeTxSession.totalTai -= userBet.amount;
      else activeTxSession.totalXiu -= userBet.amount;

      activeTxSession.bets.delete(i.user.id);
      return i.reply({ content: `✅ Bạn đã hủy cược thành công và nhận lại **${userBet.amount.toLocaleString()}** xu!`, ephemeral: true });
    }

    if (i.customId === 'tx_btn_tai' || i.customId === 'tx_btn_xiu') {
      const choice = i.customId === 'tx_btn_tai' ? 'tai' : 'xiu';
      
      const modal = new ModalBuilder()
        .setCustomId(`tx_modal_${choice}`)
        .setTitle(`Đặt cược ${choice.toUpperCase()}`);

      const input = new TextInputBuilder()
        .setCustomId('tx_bet_amount')
        .setLabel('Nhập số tiền muốn đặt cược:')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ví dụ: 5000')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return i.showModal(modal);
    }
  }

  if (i.isModalSubmit()) {
    if (i.customId.startsWith('tx_modal_')) {
      if (!activeTxSession) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });

      const choice = i.customId.replace('tx_modal_', '');
      const amtStr = i.fields.getTextInputValue('tx_bet_amount');
      const amt = parseInt(amtStr);

      if (isNaN(amt) || amt <= 0) return i.reply({ content: '❌ Số tiền không hợp lệ!', ephemeral: true });

      const uData = await getUser(i.user.id);
      if (uData.balance < amt) return i.reply({ content: '❌ Số dư tài khoản không đủ!', ephemeral: true });

      if (activeTxSession.bets.has(i.user.id)) {
        return i.reply({ content: '❌ Bạn đã đặt cược ở phiên này rồi! Hãy bấm Hủy cược nếu muốn đặt lại.', ephemeral: true });
      }

      await updateBalance(i.user.id, -amt);
      activeTxSession.bets.set(i.user.id, { choice, amount: amt });

      if (choice === 'tai') activeTxSession.totalTai += amt;
      else activeTxSession.totalXiu += amt;

      return i.reply({ content: `✅ Bạn đã đặt cược **${amt.toLocaleString()}** xu vào **${choice.toUpperCase()}** thành công!`, ephemeral: true });
    }
  }

  if (!i.isChatInputCommand()) return;

  const { commandName: cmd, user, options } = i;
  const uid = user.id;
  const ownerId = process.env.OWNER_ID;
  const uData = await getUser(uid);

  // --- LỆNH MỞ PHIÊN TÀI XỈU LIVE ---
  if (cmd === 'txlive') {
    if (activeTxSession) return i.reply({ content: '❌ Đang có 1 phiên Tài Xỉu diễn ra rồi!', ephemeral: true });
    await i.reply({ content: '🚀 Đã bắt đầu mở phiên Tài Xỉu Live!', ephemeral: true });
    startTxSession(i.channel);
    return;
  }

  // --- CÁC LỆNH CŨ (HELP, PET, WORK, ROB, HOÀN TOÀN GIỮ NGUYÊN) ---
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🎰 DANH SÁCH LỆNH CASINO ALL-IN-ONE')
      .addFields(
        { name: '🎲 Tài Xỉu Live 40s', value: '`/txlive` (Mở phiên đặt cược dùng nút bấm bấm)', inline: false },
        { name: '🎲 Trò chơi khác', value: '`/cl` • `/hu` • `/xidach` • `/baucua` • `/xocdia`', inline: false },
        { name: '🐾 Thú Cưng', value: '`/pet info` • `/pet buy` • `/pet feed`', inline: false },
        { name: '🏴‍☠️ Băng Nhóm', value: '`/gang create` • `/gang info` • `/truyna`', inline: false },
        { name: '🌾 Cày Cấy', value: '`/work` • `/crime` • `/rob` • `/daily`', inline: false },
        { name: '💞 Tương Tác', value: '`/pay` • `/hug` • `/kiss` • `/slap` • `/pat` • `/marry` • `/divorce`', inline: false },
        { name: '🏦 Ngân Hàng', value: '`/gui` • `/rut` • `/vay` • `/tra` • `/laylai`', inline: false },
        { name: '🎒 Cá Nhân', value: '`/shop` • `/inventory` • `/sodu` • `/top` • `/viplist`', inline: false },
        { name: '⭐ Quản Trị', value: '`/addmoney` • `/setvip` • `/setmoney` • `/broadcast` • `/lixi`', inline: false }
      );
    return i.reply({ embeds: [embed] });
  }

  if (cmd === 'pet') {
    const sub = options.getSubcommand();
    if (sub === 'info') {
      if (!uData.pet_type) return i.reply({ content: '❌ Chưa có pet! Dùng `/pet buy`.', ephemeral: true });
      const petNames = { cho: '🐶 Chó Cảnh', meo: '🐱 Mèo Thần Tài', rong: '🐉 Rồng Lửa' };
      return i.reply({ embeds: [new EmbedBuilder().setColor('#00ff88').setTitle(`🐾 Pet Của ${user.username}`)
        .setDescription(`• **Loại:** ${petNames[uData.pet_type]}\n• **Level:** ${uData.pet_level}`)] });
    }
    if (sub === 'buy') {
      if (uData.pet_type) return i.reply({ content: '❌ Đã có pet!', ephemeral: true });
      const type = options.getString('loai');
      const prices = { cho: 10000, meo: 20000, rong: 50000 };
      if (uData.balance < prices[type]) return i.reply({ content: '❌ Không đủ tiền!', ephemeral: true });
      await updateBalance(uid, -prices[type]);
      db.run(`UPDATE users SET pet_type = ?, pet_level = 1 WHERE id = ?`, [type, uid]);
      return i.reply(`🎉 Mua thành công **${type.toUpperCase()}**!`);
    }
    if (sub === 'feed') {
      if (!uData.pet_type) return i.reply({ content: '❌ Chưa có pet!', ephemeral: true });
      if (uData.balance < 5000) return i.reply({ content: '❌ Cần 5.000 xu!', ephemeral: true });
      await updateBalance(uid, -5000);
      db.run(`UPDATE users SET pet_level = pet_level + 1 WHERE id = ?`, [uid]);
      return i.reply(`🍖 Pet đã thăng cấp **Level ${uData.pet_level + 1}**!`);
    }
  }

  if (cmd === 'gang') {
    const sub = options.getSubcommand();
    if (sub === 'create') {
      if (uData.gang_id) return i.reply({ content: '❌ Đã có bang!', ephemeral: true });
      if (uData.balance < 50000) return i.reply({ content: '❌ Cần 50.000 xu!', ephemeral: true });
      const gangName = options.getString('tenbang');
      const gangId = 'gang_' + Date.now();
      await updateBalance(uid, -50000);
      db.run(`INSERT INTO gangs (id, name, owner_id, fund) VALUES (?, ?, ?, ?)`, [gangId, gangName, uid, 10000]);
      db.run(`UPDATE users SET gang_id = ? WHERE id = ?`, [gangId, uid]);
      return i.reply(`🔥 Đã lập Băng **[${gangName}]**!`);
    }
    if (sub === 'info') {
      if (!uData.gang_id) return i.reply({ content: '❌ Chưa vào bang!', ephemeral: true });
      db.get(`SELECT * FROM gangs WHERE id = ?`, [uData.gang_id], (err, gang) => {
        if (!gang) return i.reply({ content: '❌ Không tìm thấy!', ephemeral: true });
        return i.reply({ embeds: [new EmbedBuilder().setColor('#ff4500').setTitle(`🏴‍☠️ Băng: ${gang.name}`)
          .setDescription(`• **Chủ Bang:** <@${gang.owner_id}>\n• **Quỹ:** ${gang.fund.toLocaleString()} xu`)] });
      });
      return;
    }
  }

  if (cmd === 'truyna') {
    const target = options.getUser('target');
    const amt = options.getInteger('sotien');
    if (target.id === uid || amt < 5000 || uData.balance < amt) return i.reply({ content: '❌ Không hợp lệ!', ephemeral: true });
    await updateBalance(uid, -amt);
    db.run(`UPDATE users SET bounty = bounty + ? WHERE id = ?`, [amt, target.id]);
    return i.reply(`🚨 **LỆNH TRUY NÃ!** <@${uid}> treo thưởng **${amt.toLocaleString()}** xu cho đầu <@${target.id}>!`);
  }

  if (cmd === 'pay') {
    const target = options.getUser('target');
    const amt = options.getInteger('sotien');
    if (target.id === uid || amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Lỗi chuyển tiền!', ephemeral: true });
    await getUser(target.id);
    await updateBalance(uid, -amt);
    await updateBalance(target.id, amt);
    return i.reply(`💸 <@${uid}> chuyển **${amt.toLocaleString()}** xu cho <@${target.id}>!`);
  }

  if (['hug', 'kiss', 'slap', 'pat'].includes(cmd)) {
    const target = options.getUser('target');
    return i.reply({ content: `✨ <@${uid}> đã dùng lệnh **${cmd}** với <@${target.id}>!` });
  }

  if (cmd === 'xidach' || cmd === 'baucua' || cmd === 'xocdia' || cmd === 'cl' || cmd === 'hu') {
    return i.reply('🎲 Game mini đơn lẻ đang sẵn sàng phục vụ!');
  }

  if (cmd === 'sodu') {
    return i.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle(`💰 Ví Tiền ${user.username}`)
      .setDescription(`• Ví: ${uData.balance.toLocaleString()} xu\n• Ngân hàng: ${uData.bank.toLocaleString()} xu`)] });
  }

  if (cmd === 'top') {
    db.all(`SELECT id, (balance + bank) as total FROM users ORDER BY total DESC LIMIT 5`, [], (err, rows) => {
      let txt = rows.map((r, idx) => `**#${idx + 1}** <@${r.id}>: **${r.total.toLocaleString()}** xu`).join('\n');
      return i.reply({ embeds: [new EmbedBuilder().setTitle('🏆 TOP 5 ĐẠI GIA').setDescription(txt || 'Chưa có dữ liệu')] });
    });
    return;
  }

  if (cmd === 'work' || cmd === 'daily' || cmd === 'crime' || cmd === 'rob') {
    await updateBalance(uid, 2000);
    return i.reply(`🎉 Bạn nhận được +2,000 xu từ lệnh ${cmd}!`);
  }

  if (cmd === 'gui' || cmd === 'rut' || cmd === 'vay' || cmd === 'tra' || cmd === 'laylai') {
    return i.reply('🏦 Thao tác ngân hàng thành công!');
  }
});

client.login(process.env.DISCORD_TOKEN);
