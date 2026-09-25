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
  ComponentType 
} = require('discord.js');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

// 1. HTTP Server giữ Render luôn hoạt động
http.createServer((req, res) => {
  res.write("Bot Casino Complete System 24/7");
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

// 3. CSDL SQLite & Khởi tạo các Bảng
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
    married_with TEXT DEFAULT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS jackpot (
    id INTEGER PRIMARY KEY,
    amount INTEGER DEFAULT 50000
  )`);

  db.run(`INSERT OR IGNORE INTO jackpot (id, amount) VALUES (1, 50000)`);
});

// Các hàm CSDL bổ trợ
const getUser = (id) => new Promise((resolve) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (id) VALUES (?)`, [id]);
      resolve({ id, balance: 1000, bank: 0, debt: 0, last_daily: 0, last_work: 0, last_crime: 0, last_rob: 0, last_interest: 0, is_vip: 0, married_with: null });
    } else {
      resolve(row);
    }
  });
});

const updateBalance = (id, amount) => new Promise((resolve) => {
  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, id], resolve);
});

// 4. Danh sách đầy đủ các Slash Commands
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Xem menu trợ giúp đầy đủ'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví và ngân hàng'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng điểm danh hằng ngày'),
  
  // Trò chơi
  new SlashCommandBuilder().setName('tx').setDescription('Chơi Tài Xỉu')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Tài/Xỉu').setRequired(true).addChoices({name:'Tài (11-17)',value:'tai'},{name:'Xỉu (3-10)',value:'xiu'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('cl').setDescription('Chơi Chẵn Lẻ')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn/Lẻ').setRequired(true).addChoices({name:'Chẵn',value:'chan'},{name:'Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
  new SlashCommandBuilder().setName('hu').setDescription('Quay Hũ / Xem hũ hiện tại')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền đặt hũ ( Bỏ trống để xem hũ )')),

  // Cày cấy & Cướp
  new SlashCommandBuilder().setName('work').setDescription('Làm việc kiếm xu'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm việc phi pháp (Rủi ro cao)'),
  new SlashCommandBuilder().setName('rob').setDescription('Cướp tiền người khác')
    .addUserOption(o => o.setName('target').setDescription('Mục tiêu muốn cướp').setRequired(true)),

  // Tình cảm
  new SlashCommandBuilder().setName('marry').setDescription('Cầu hôn người khác')
    .addUserOption(o => o.setName('target').setDescription('Người muốn kết hôn').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn người phối ngẫu'),

  // Ngân hàng
  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền vào ngân hàng')
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền gửi').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền từ ngân hàng')
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền rút').setRequired(true)),
  new SlashCommandBuilder().setName('vay').setDescription('Vay tiền ngân hàng')
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền vay').setRequired(true)),
  new SlashCommandBuilder().setName('tra').setDescription('Trả nợ ngân hàng')
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền trả').setRequired(true)),
  new SlashCommandBuilder().setName('laylai').setDescription('Nhận lãi ngân hàng hằng ngày'),

  // Shop & Vật phẩm
  new SlashCommandBuilder().setName('shop').setDescription('Xem cửa hàng chung'),
  new SlashCommandBuilder().setName('buy').setDescription('Mua đồ shop chung')
    .addStringOption(o => o.setName('item').setDescription('Tên món đồ').setRequired(true)),
  new SlashCommandBuilder().setName('itemshop').setDescription('Cửa hàng vật phẩm đặc biệt'),
  new SlashCommandBuilder().setName('buyitem').setDescription('Mua vật phẩm đặc biệt')
    .addStringOption(o => o.setName('item').setDescription('Tên vật phẩm').setRequired(true)),
  new SlashCommandBuilder().setName('inventory').setDescription('Xem túi đồ cá nhân'),

  // Cá nhân & Bảng xếp hạng
  new SlashCommandBuilder().setName('viplist').setDescription('Xem danh sách thành viên VIP'),
  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng Top đại gia'),

  // Staff & Owner & VIP
  new SlashCommandBuilder().setName('addmoney').setDescription('Cộng tiền cho người chơi (Staff/Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('setvip').setDescription('Set trạng thái VIP (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người nhận VIP').setRequired(true)),
  new SlashCommandBuilder().setName('setmoney').setDescription('Đặt lại tiền cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền set').setRequired(true)),
  new SlashCommandBuilder().setName('broadcast').setDescription('Gửi thông báo toàn server (Owner)')
    .addStringOption(o => o.setName('noidung').setDescription('Nội dung thông báo').setRequired(true)),
  new SlashCommandBuilder().setName('lixi').setDescription('Phát lì xì toàn server (VIP/Owner)')
    .addIntegerOption(o => o.setName('tongtien').setDescription('Tổng tiền').setRequired(true))
    .addIntegerOption(o => o.setName('sobao').setDescription('Số bao').setRequired(true))
].map(c => c.toJSON());

// 5. Đăng ký Slash Command tự động
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🚀 Bot đã online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Đã đăng ký thành công tất cả lệnh!');
  } catch (err) {
    console.error('❌ Lỗi đăng ký lệnh:', err);
  }
});

// 6. Xử lý Interaction
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  const { commandName: cmd, user, options } = i;
  const uid = user.id;
  const ownerId = process.env.OWNER_ID;
  const uData = await getUser(uid);

  // --- /HELP ---
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🌐 HỆ THỐNG BOT TÀI XỈU JangJii')
      .addFields(
        { name: '🎲 Trò chơi', value: '`/tx` • `/cl` • `/hu`', inline: false },
        { name: '🌾 Cày Cấy & Cướp', value: '`/work` • `/crime` • `/rob` • `/daily`', inline: false },
        { name: '💍 Tình Cảm', value: '`/marry` • `/divorce`', inline: false },
        { name: '🏦 Ngân Hàng', value: '`/gui` • `/rut` • `/vay` • `/tra` • `/laylai`', inline: false },
        { name: '🎒 Vật Phẩm & Shop', value: '`/itemshop` • `/buyitem` • `/inventory` • `/shop` • `/buy`', inline: false },
        { name: '📊 Cá Nhân & Xếp Hạng', value: '`/sodu` • `/viplist` • `/top`', inline: false },
        { name: '⭐ Lệnh Staff', value: '`/addmoney` • `/setvip` • `/lixi`', inline: false },
        { name: '👑 Lệnh Owner', value: '`/setmoney` • `/broadcast`', inline: false }
      );
    return i.reply({ embeds: [embed] });
  }

  // --- CÁ NHÂN & XẾP HẠNG ---
  if (cmd === 'sodu') {
    const vipTag = (uid === ownerId || uData.is_vip) ? '👑 [VIP]' : '👤 [Thường]';
    return i.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle(`💰 Ví Tiền ${user.username} ${vipTag}`)
      .setDescription(`• **Tiền mặt:** ${uData.balance.toLocaleString()} xu\n• **Ngân hàng:** ${uData.bank.toLocaleString()} xu\n• **Tiền nợ:** ${uData.debt.toLocaleString()} xu`)] });
  }

  if (cmd === 'top') {
    db.all(`SELECT id, (balance + bank) as total FROM users ORDER BY total DESC LIMIT 5`, [], (err, rows) => {
      let txt = rows.map((r, idx) => `**#${idx + 1}** <@${r.id}>: **${r.total.toLocaleString()}** xu`).join('\n');
      return i.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOP 5 ĐẠI GIA').setDescription(txt || 'Chưa có dữ liệu')] });
    });
    return;
  }

  if (cmd === 'viplist') {
    db.all(`SELECT id FROM users WHERE is_vip = 1`, [], (err, rows) => {
      let txt = rows.map(r => `• <@${r.id}>`).join('\n');
      return i.reply({ embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle('👑 DANH SÁCH VIP').setDescription(txt || 'Chưa có VIP nào!')] });
    });
    return;
  }

  // --- CÀY CẤY & CƯỚP ---
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - uData.last_daily < 86400000) return i.reply({ content: '⏳ Hôm nay bạn đã nhận thưởng rồi!', ephemeral: true });
    const reward = (uid === ownerId || uData.is_vip) ? 10000 : 5000;
    db.run(`UPDATE users SET balance = balance + ?, last_daily = ? WHERE id = ?`, [reward, now, uid]);
    return i.reply(`🎉 Bạn nhận được **+${reward.toLocaleString()}** xu daily!`);
  }

  if (cmd === 'work') {
    const now = Date.now();
    if (now - uData.last_work < 300000) return i.reply({ content: '⏳ Nghơi tay tí nào! Vui lòng đợi 5 phút giữa mỗi lần làm việc.', ephemeral: true });
    const earn = Math.floor(Math.random() * 2000) + 1000;
    db.run(`UPDATE users SET balance = balance + ?, last_work = ? WHERE id = ?`, [earn, now, uid]);
    return i.reply(`💼 Bạn đã chăn bò và kiếm được **+${earn.toLocaleString()}** xu!`);
  }

  if (cmd === 'crime') {
    const now = Date.now();
    if (now - uData.last_crime < 600000) return i.reply({ content: '⏳ Công an đang truy nã, đợi 10 phút nhé!', ephemeral: true });
    const success = Math.random() > 0.4;
    db.run(`UPDATE users SET last_crime = ? WHERE id = ?`, [now, uid]);
    if (success) {
      const earn = Math.floor(Math.random() * 5000) + 3000;
      await updateBalance(uid, earn);
      return i.reply(`🥷 Bạn phi vụ trót lọt và kiếm được **+${earn.toLocaleString()}** xu!`);
    } else {
      const fine = 2000;
      await updateBalance(uid, -fine);
      return i.reply(`🚓 Bạn bị công an bắt và phạt **-${fine.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'rob') {
    const target = options.getUser('target');
    if (target.id === uid) return i.reply({ content: '❌ Không thể tự cướp chính mình!', ephemeral: true });
    const tData = await getUser(target.id);
    if (tData.balance < 2000) return i.reply({ content: '❌ Mục tiêu quá nghèo không đáng cướp!', ephemeral: true });

    const now = Date.now();
    if (now - uData.last_rob < 900000) return i.reply({ content: '⏳ Đợi 15 phút để đi cướp tiếp!', ephemeral: true });

    db.run(`UPDATE users SET last_rob = ? WHERE id = ?`, [now, uid]);
    if (Math.random() > 0.5) {
      const robAmt = Math.floor(tData.balance * 0.2);
      await updateBalance(target.id, -robAmt);
      await updateBalance(uid, robAmt);
      return i.reply(`💥 Bạn đã cướp thành công **${robAmt.toLocaleString()}** xu từ <@${target.id}>!`);
    } else {
      return i.reply(`🛡️ Bạn bị <@${target.id}> vạch mặt và cướp thất bại!`);
    }
  }

  // --- TRÒ CHƠI ---
  if (cmd === 'tx') {
    const choice = options.getString('luachon');
    const bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Số dư không đủ hoặc cược không hợp lệ!', ephemeral: true });

    const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1, d3 = Math.floor(Math.random()*6)+1;
    const total = d1 + d2 + d3;
    const res = total >= 11 ? 'tai' : 'xiu';

    if (choice === res) {
      await updateBalance(uid, bet);
      return i.reply(`🎲 Kết quả: **${d1}-${d2}-${d3}** (${total} - ${res.toUpperCase()})\n🎉 Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🎲 Kết quả: **${d1}-${d2}-${d3}** (${total} - ${res.toUpperCase()})\n💸 Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'cl') {
    const choice = options.getString('luachon');
    const bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Số dư không đủ!', ephemeral: true });

    const num = Math.floor(Math.random() * 100);
    const res = num % 2 === 0 ? 'chan' : 'le';

    if (choice === res) {
      await updateBalance(uid, bet);
      return i.reply(`🔢 Số ra: **${num}** (${res.toUpperCase()})\n🎉 Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🔢 Số ra: **${num}** (${res.toUpperCase()})\n💸 Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'hu') {
    const bet = options.getInteger('tiencuoc');
    db.get(`SELECT amount FROM jackpot WHERE id = 1`, [], async (err, row) => {
      let jackpotAmt = row ? row.amount : 50000;
      if (!bet) return i.reply(`🎰 Hũ hiện tại đang có: **${jackpotAmt.toLocaleString()}** xu!`);

      if (bet < 1000 || uData.balance < bet) return i.reply({ content: '❌ Cược tối thiểu 1.000 xu!', ephemeral: true });

      db.run(`UPDATE jackpot SET amount = amount + ? WHERE id = 1`, [Math.floor(bet * 0.3)]);
      const win = Math.random() < 0.05; // 5% trúng hũ

      if (win) {
        await updateBalance(uid, jackpotAmt);
        db.run(`UPDATE jackpot SET amount = 50000 WHERE id = 1`);
        return i.reply(`🎉🎉 **NỔ HŨ BRRRR!** <@${uid}> đã ăn trọn hũ **${jackpotAmt.toLocaleString()}** xu!`);
      } else {
        await updateBalance(uid, -bet);
        return i.reply(`🎰 Chúc bạn may mắn lần sau! Đã đóng góp vào hũ.`);
      }
    });
    return;
  }

  // --- NGÂN HÀNG ---
  if (cmd === 'gui') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Số tiền không hợp lệ!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance - ?, bank = bank + ? WHERE id = ?`, [amt, amt, uid]);
    return i.reply(`🏦 Đã gửi **${amt.toLocaleString()}** xu vào ngân hàng!`);
  }

  if (cmd === 'rut') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.bank < amt) return i.reply({ content: '❌ Ngân hàng không đủ tiền!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + ?, bank = bank - ? WHERE id = ?`, [amt, amt, uid]);
    return i.reply(`🏦 Đã rút **${amt.toLocaleString()}** xu về ví!`);
  }

  if (cmd === 'vay') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || amt > 50000) return i.reply({ content: '❌ Tối đa vay 50.000 xu!', ephemeral: true });
    if (uData.debt > 0) return i.reply({ content: '❌ Phải trả hết nợ cũ mới được vay tiếp!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + ?, debt = ? WHERE id = ?`, [amt, Math.floor(amt * 1.2), uid]);
    return i.reply(`💳 Đã vay **${amt.toLocaleString()}** xu (Lãi 20%, Cần trả: ${Math.floor(amt * 1.2).toLocaleString()} xu)`);
  }

  if (cmd === 'tra') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Tiền ví không đủ!', ephemeral: true });
    const payAmt = Math.min(amt, uData.debt);
    db.run(`UPDATE users SET balance = balance - ?, debt = debt - ? WHERE id = ?`, [payAmt, payAmt, uid]);
    return i.reply(`💳 Đã trả **${payAmt.toLocaleString()}** xu nợ ngân hàng!`);
  }

  if (cmd === 'laylai') {
    const now = Date.now();
    if (now - uData.last_interest < 86400000) return i.reply({ content: '⏳ Nhận lãi 24h một lần nhé!', ephemeral: true });
    if (uData.bank <= 0) return i.reply({ content: '❌ Không có tiền gửi ngân hàng để nhận lãi!', ephemeral: true });
    const interest = Math.floor(uData.bank * 0.05); // Lãi 5%/ngày
    db.run(`UPDATE users SET bank = bank + ?, last_interest = ? WHERE id = ?`, [interest, now, uid]);
    return i.reply(`📈 Đã nhận **+${interest.toLocaleString()}** xu tiền lãi ngân hàng!`);
  }

  // --- TÌNH CẢM ---
  if (cmd === 'marry') {
    const target = options.getUser('target');
    if (target.id === uid) return i.reply({ content: '❌ Không thể tự cưới chính mình!', ephemeral: true });
    if (uData.married_with) return i.reply({ content: '❌ Bạn đã kết hôn rồi!', ephemeral: true });
    db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [target.id, uid]);
    return i.reply(`💍 <@${uid}> đã cầu hôn thành công <@${target.id}>! Chúc hai bạn hạnh phúc!`);
  }

  if (cmd === 'divorce') {
    if (!uData.married_with) return i.reply({ content: '❌ Bạn đang độc thân!', ephemeral: true });
    db.run(`UPDATE users SET married_with = NULL WHERE id = ?`, [uid]);
    return i.reply(`💔 Bạn đã trở lại cuộc sống độc thân vui tính!`);
  }

  // --- SHOP & TÚI ĐỒ ---
  if (cmd === 'shop' || cmd === 'itemshop') {
    return i.reply({ embeds: [new EmbedBuilder().setTitle('🛍️ SHOP CASINO').setDescription('1. `NhanKimCuong` - 50.000 xu\n2. `TheDoiTen` - 10.000 xu')] });
  }
  if (cmd === 'inventory') {
    return i.reply({ embeds: [new EmbedBuilder().setTitle(`🎒 Túi đồ của ${user.username}`).setDescription('Bạn chưa sở hữu vật phẩm nào.')] });
  }
  if (cmd === 'buy' || cmd === 'buyitem') {
    return i.reply('🛒 Tính năng mua vật phẩm đang được cập nhật!');
  }

  // --- STAFF & OWNER ---
  if (cmd === 'setvip') {
    if (uid !== ownerId) return i.reply({ content: '❌ Chỉ Owner!', ephemeral: true });
    const target = options.getUser('user');
    await getUser(target.id);
    db.run(`UPDATE users SET is_vip = 1 WHERE id = ?`, [target.id]);
    return i.reply(`👑 Đã cấp VIP cho <@${target.id}>!`);
  }

  if (cmd === 'addmoney') {
    if (uid !== ownerId && !uData.is_vip) return i.reply({ content: '❌ Chỉ Staff/Owner!', ephemeral: true });
    const target = options.getUser('user');
    const amt = options.getInteger('sotien');
    await getUser(target.id);
    await updateBalance(target.id, amt);
    return i.reply(`💵 Đã cộng **${amt.toLocaleString()}** xu cho <@${target.id}>!`);
  }

  if (cmd === 'setmoney') {
    if (uid !== ownerId) return i.reply({ content: '❌ Chỉ Owner!', ephemeral: true });
    const target = options.getUser('user');
    const amt = options.getInteger('sotien');
    await getUser(target.id);
    db.run(`UPDATE users SET balance = ? WHERE id = ?`, [amt, target.id]);
    return i.reply(`🧹 Đã chỉnh số dư của <@${target.id}> thành **${amt.toLocaleString()}** xu!`);
  }

  if (cmd === 'broadcast') {
    if (uid !== ownerId) return i.reply({ content: '❌ Chỉ Owner!', ephemeral: true });
    const txt = options.getString('noidung');
    return i.reply({ embeds: [new EmbedBuilder().setColor('#ff0000').setTitle('📢 THÔNG BÁO').setDescription(txt)] });
  }

  // --- LÌ XÌ ---
  if (cmd === 'lixi') {
    if (uid !== ownerId && !uData.is_vip) return i.reply({ content: '❌ Chỉ VIP & Owner!', ephemeral: true });
    const totalMoney = options.getInteger('tongtien');
    const totalSlots = options.getInteger('sobao');

    if (uData.balance < totalMoney) return i.reply({ content: '❌ Không đủ tiền!', ephemeral: true });
    await updateBalance(uid, -totalMoney);

    let remainingMoney = totalMoney, remainingSlots = totalSlots;
    const claimedUsers = new Set();

    const lixiEmbed = new EmbedBuilder().setColor('#FF0000').setTitle('🧧 LÌ XÌ VIP TOÀN SERVER')
      .setDescription(`Người phát: <@${uid}>\n💰 **Tổng:** ${totalMoney.toLocaleString()} xu\n🎁 **Số bao:** ${totalSlots}`);

    const btn = new ButtonBuilder().setCustomId('claim_lixi').setLabel('🧧 Giật Lì Xì').setStyle(ButtonStyle.Success);
    const replyMsg = await i.reply({ embeds: [lixiEmbed], components: [new ActionRowBuilder().addComponents(btn)], fetchReply: true });

    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
    collector.on('collect', async (bI) => {
      if (claimedUsers.has(bI.user.id)) return bI.reply({ content: '❌ Đã giật rồi!', ephemeral: true });
      if (remainingSlots <= 0) return bI.reply({ content: '💸 Đã hết lì xì!', ephemeral: true });

      let claimAmount = remainingSlots === 1 ? remainingMoney : Math.floor(Math.random() * (remainingMoney / remainingSlots * 1.5)) + 1;
      remainingMoney -= claimAmount;
      remainingSlots -= 1;
      claimedUsers.add(bI.user.id);

      await getUser(bI.user.id);
      await updateBalance(bI.user.id, claimAmount);
      await bI.reply({ content: `🎉 Bạn giật được **+${claimAmount.toLocaleString()}** xu!`, ephemeral: true });

      if (remainingSlots === 0) collector.stop();
    });
  }
});

// 7. Login Bot
client.login(process.env.DISCORD_TOKEN);
