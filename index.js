require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');

// 🌐 1. SERVER KEEP-ALIVE CHO RENDER (Giúp Bot chạy 24/7)
http.createServer((req, res) => {
  res.write("Bot Discord dang hoat dong 24/7!");
  res.end();
}).listen(process.env.PORT || 3000);

// ⚙️ 2. CẤU HÌNH BOT
const CONFIG = {
  BOT_TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  OWNER_ID: process.env.OWNER_ID,
};

const db = new sqlite3.Database('taixiu.db');

const dbRun = (sql, params = []) => new Promise((res) => db.run(sql, params, function(err) { if (err) console.error('⚠️ [Err Run]:', err.message); res(this); }));
const dbGet = (sql, params = []) => new Promise((res) => db.get(sql, params, (err, row) => { if (err) console.error('⚠️ [Err Get]:', err.message); res(row); }));
const dbAll = (sql, params = []) => new Promise((res) => db.all(sql, params, (err, rows) => { if (err) console.error('⚠️ [Err All]:', err.message); res(rows || []); }));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS server_users (
    user_id TEXT, guild_id TEXT, balance INTEGER DEFAULT 1000, bank INTEGER DEFAULT 0, debt INTEGER DEFAULT 0, 
    last_interest INTEGER DEFAULT 0, title TEXT DEFAULT 'Tập sự', partner_id TEXT DEFAULT NULL, last_daily INTEGER DEFAULT 0, 
    last_rob INTEGER DEFAULT 0, last_work INTEGER DEFAULT 0, last_crime INTEGER DEFAULT 0, is_banned INTEGER DEFAULT 0, 
    is_staff INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0, item_shield INTEGER DEFAULT 0, item_scope INTEGER DEFAULT 0, 
    item_x2bank INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id))`);
  
  db.run(`CREATE TABLE IF NOT EXISTS server_jackpots (guild_id TEXT PRIMARY KEY, jackpot_amount INTEGER DEFAULT 10000)`);

  const cols = [
    ['bank', 'INTEGER DEFAULT 0'], ['debt', 'INTEGER DEFAULT 0'], ['last_interest', 'INTEGER DEFAULT 0'],
    ['title', "TEXT DEFAULT 'Tập sự'"], ['partner_id', 'TEXT DEFAULT NULL'], ['last_daily', 'INTEGER DEFAULT 0'],
    ['last_rob', 'INTEGER DEFAULT 0'], ['last_work', 'INTEGER DEFAULT 0'], ['last_crime', 'INTEGER DEFAULT 0'],
    ['is_banned', 'INTEGER DEFAULT 0'], ['is_staff', 'INTEGER DEFAULT 0'], ['is_vip', 'INTEGER DEFAULT 0'],
    ['item_shield', 'INTEGER DEFAULT 0'], ['item_scope', 'INTEGER DEFAULT 0'], ['item_x2bank', 'INTEGER DEFAULT 0']
  ];
  cols.forEach(([col, def]) => db.run(`ALTER TABLE server_users ADD COLUMN ${col} ${def}`, () => {}));
});

const getUser = async (u, g) => {
  let user = await dbGet('SELECT * FROM server_users WHERE user_id = ? AND guild_id = ?', [u, g]);
  if (!user) {
    user = { 
      user_id: u, guild_id: g, balance: 1000, bank: 0, debt: 0, last_interest: 0, title: 'Tập sự', partner_id: null, 
      last_daily: 0, last_rob: 0, last_work: 0, last_crime: 0, is_banned: 0, is_staff: 0, is_vip: 0,
      item_shield: 0, item_scope: 0, item_x2bank: 0 
    };
    await dbRun('INSERT OR IGNORE INTO server_users (user_id, guild_id, balance) VALUES (?, ?, 1000)', [u, g]);
  }
  return user;
};

const setField = (u, g, field, val) => dbRun(`UPDATE server_users SET ${field} = ? WHERE user_id = ? AND guild_id = ?`, [val, u, g]);
const getJackpot = async (g) => (await dbGet('SELECT jackpot_amount FROM server_jackpots WHERE guild_id = ?', [g]))?.jackpot_amount || (await dbRun('INSERT INTO server_jackpots (guild_id, jackpot_amount) VALUES (?, 10000)', [g]), 10000);

const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Xem danh sách tất cả các lệnh của Bot'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví, ngân hàng, vật phẩm và danh hiệu'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận quà điểm danh daily 500 xu mỗi ngày'),
  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền vào tài khoản ngân hàng').addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền gửi').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền từ ngân hàng về ví xu').addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền rút').setRequired(true)),
  new SlashCommandBuilder().setName('vay').setDescription('Vay vốn ngân hàng').addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền vay').setRequired(true)),
  new SlashCommandBuilder().setName('tra').setDescription('Thanh toán khoản nợ').addStringOption(opt => opt.setName('sotien_hoac_all').setDescription('Số tiền trả hoặc "all"').setRequired(true)),
  new SlashCommandBuilder().setName('laylai').setDescription('Nhận lãi suất ngân hàng mỗi ngày'),
  new SlashCommandBuilder().setName('pay').setDescription('Chuyển tiền cho người khác').addUserOption(opt => opt.setName('nguoinhan').setDescription('Người nhận').setRequired(true)).addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('rob').setDescription('Cướp xu từ người chơi khác').addUserOption(opt => opt.setName('nan_nhan').setDescription('Nạn nhân').setRequired(true)),
  new SlashCommandBuilder().setName('tx').setDescription('Đặt cược Tài Xỉu').addStringOption(opt => opt.setName('luachon').setDescription('Tài hoặc Xỉu').setRequired(true).addChoices({ name: 'Tài', value: 'tai' }, { name: 'Xỉu', value: 'xiu' })).addIntegerOption(opt => opt.setName('cuoc').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('cl').setDescription('Đặt cược Chẵn Lẻ').addStringOption(opt => opt.setName('luachon').setDescription('Chẵn hoặc Lẻ').setRequired(true).addChoices({ name: 'Chẵn', value: 'chan' }, { name: 'Lẻ', value: 'le' })).addIntegerOption(opt => opt.setName('cuoc').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('hu').setDescription('Kiểm tra giá trị hũ Jackpot'),
  new SlashCommandBuilder().setName('shop').setDescription('Xem cửa hàng danh hiệu'),
  new SlashCommandBuilder().setName('buy').setDescription('Mua danh hiệu').addIntegerOption(opt => opt.setName('id').setDescription('ID danh hiệu').setRequired(true)),
  new SlashCommandBuilder().setName('viplist').setDescription('Xem danh sách VIP'),
  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng 5 đại gia'),
  new SlashCommandBuilder().setName('marry').setDescription('Cầu hôn ai đó (10,000 xu)').addUserOption(opt => opt.setName('doi_phuong').setDescription('Chọn người muốn kết hôn').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn'),
  new SlashCommandBuilder().setName('work').setDescription('Làm việc nhận xu (30 phút/lần)'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm phi vụ mạo hiểm'),
  new SlashCommandBuilder().setName('itemshop').setDescription('Xem danh sách vật phẩm'),
  new SlashCommandBuilder().setName('buyitem').setDescription('Mua vật phẩm').addStringOption(opt => opt.setName('loai').setDescription('Chọn vật phẩm').setRequired(true).addChoices({ name: '🛡️ Khiên Bảo Về', value: 'shield' }, { name: '🕵️ Kính Hiển Vi', value: 'scope' }, { name: '🎟️ Vé X2 Lãi', value: 'x2bank' })),
  new SlashCommandBuilder().setName('inventory').setDescription('Xem túi đồ vật phẩm'),
  new SlashCommandBuilder().setName('broadcast').setDescription('[Owner Only] Thông báo toàn bộ Server').addStringOption(opt => opt.setName('noidung').setDescription('Nội dung').setRequired(true)),
  new SlashCommandBuilder().setName('setvip').setDescription('[Staff/Owner] Cấp/Thu hồi VIP').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addBooleanOption(opt => opt.setName('trangthai').setDescription('Trạng thái VIP').setRequired(true)),
  new SlashCommandBuilder().setName('addmoney').setDescription('[Staff/Owner] Cộng xu').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền').setRequired(true)),
  new SlashCommandBuilder().setName('setmoney').setDescription('[Owner] Đặt số dư').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addIntegerOption(opt => opt.setName('tiien').setDescription('Số tiền mới').setRequired(true)),
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log(`🚀 Bot đã online: ${client.user.tag}`);
  const targetClientId = CONFIG.CLIENT_ID || client.user.id;
  const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(targetClientId), { body: commands });
    console.log('✅ Đã đăng ký thành công tất cả lệnh Slash!');
  } catch (err) {
    console.error('❌ Lỗi đăng ký Slash Commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user: author, guildId: gId } = interaction;
  const uId = author.id;
  
  let user = await getUser(uId, gId);
  const isOwner = uId === CONFIG.OWNER_ID;
  const isStaff = isOwner || user.is_staff === 1;

  if (user.is_banned && !isOwner) return interaction.reply({ content: '⛔ Bạn đã bị cấm sử dụng Bot!', ephemeral: true });

  if (commandName === 'help') {
    const embed = new EmbedBuilder().setTitle('🎲 HỆ THỐNG BOT GAMING MULTI-FUNCTIONAL').setColor('#00FF7F')
      .addFields(
        { name: '🎮 Trò chơi', value: '`/tx` • `/cl` • `/hu`' },
        { name: '⛏️ Cày Cấy & Cướp', value: '`/work` • `/crime` • `/rob` • `/daily`' },
        { name: '💍 Tình Cảm', value: '`/marry` • `/divorce`' },
        { name: '🏦 Ngân Hàng', value: '`/gui` • `/rut` • `/vay` • `/tra` • `/laylai`' },
        { name: '🎒 Vật Phẩm & Shop', value: '`/itemshop` • `/buyitem` • `/inventory` • `/shop` • `/buy`' },
        { name: '📊 Cá Nhân & Xếp Hạng', value: '`/sodu` • `/viplist` • `/top`' }
      );
    if (isStaff) embed.addFields({ name: '⭐ Lệnh Staff', value: '`/addmoney` • `/setvip`' });
    if (isOwner) embed.addFields({ name: '👑 Lệnh Owner', value: '`/setmoney` • `/broadcast`' });
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'broadcast') {
    if (!isOwner) return interaction.reply({ content: '⛔ Lệnh này chỉ dành riêng cho Chủ Bot!', ephemeral: true });
    const content = interaction.options.getString('noidung');
    await interaction.deferReply({ ephemeral: true });
    let successCount = 0, failCount = 0;

    const embedAnnounce = new EmbedBuilder().setTitle('📢 THÔNG BÁO TỪ HỆ THỐNG BOT').setColor('#FF0055').setDescription(content).setFooter({ text: `Gửi bởi Owner: ${author.tag}` }).setTimestamp();

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        let channel = guild.systemChannel || guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
        if (channel) { await channel.send({ embeds: [embedAnnounce] }); successCount++; } else { failCount++; }
      } catch (err) { failCount++; }
    }
    return interaction.editReply(`✅ Đã gửi thông báo thành công đến **${successCount}** server! (Thất bại: **${failCount}**)`);
  }

  if (commandName === 'marry') {
    const target = interaction.options.getUser('doi_phuong');
    if (target.id === uId) return interaction.reply({ content: '❌ Không thể tự kết hôn với chính mình!', ephemeral: true });
    if (user.partner_id) return interaction.reply({ content: '❌ Bạn đã kết hôn rồi!', ephemeral: true });
    if (user.balance < 10000) return interaction.reply({ content: '❌ Cần 10,000 xu để mua nhẫn!', ephemeral: true });
    const tData = await getUser(target.id, gId);
    if (tData.partner_id) return interaction.reply({ content: `❌ ${target} đã có người phối ngẫu rồi!`, ephemeral: true });

    await setField(uId, gId, 'balance', user.balance - 10000);
    await setField(uId, gId, 'partner_id', target.id);
    await setField(target.id, gId, 'partner_id', uId);
    return interaction.reply(`💍 🎉 Chúc mừng ${author} và ${target} đã kết hôn thành công!`);
  }

  if (commandName === 'divorce') {
    if (!user.partner_id) return interaction.reply({ content: '❌ Bạn đang độc thân!', ephemeral: true });
    const exId = user.partner_id;
    await setField(uId, gId, 'partner_id', null);
    await setField(exId, gId, 'partner_id', null);
    return interaction.reply(`💔 ${author} đã ly hôn với <@${exId}>.`);
  }

  if (commandName === 'work') {
    const now = Date.now();
    if (now - user.last_work < 1800000) return interaction.reply({ content: `⏳ Hãy nghỉ ngơi thêm **${Math.ceil((1800000 - (now - user.last_work)) / 60000)} phút**!`, ephemeral: true });
    const earned = Math.floor(Math.random() * 401) + 200;
    await setField(uId, gId, 'balance', user.balance + earned);
    await setField(uId, gId, 'last_work', now);
    return interaction.reply(`⛏️ Bạn đã chăm chỉ làm việc và nhận về **+${earned.toLocaleString()}** xu!`);
  }

  if (commandName === 'crime') {
    const now = Date.now();
    if (now - user.last_crime < 3600000) return interaction.reply({ content: `⏳ Chờ **${Math.ceil((3600000 - (now - user.last_crime)) / 60000)} phút** nữa!`, ephemeral: true });
    await setField(uId, gId, 'last_crime', now);
    if (Math.random() < 0.45) {
      const reward = Math.floor(Math.random() * 2000) + 1500;
      await setField(uId, gId, 'balance', user.balance + reward);
      return interaction.reply(`🕵️ Phi vụ thành công! Bạn nhận được **+${reward.toLocaleString()}** xu!`);
    } else {
      const fine = Math.min(user.balance, 1000);
      await setField(uId, gId, 'balance', user.balance - fine);
      return interaction.reply(`🚓 Thất bại! Bạn bị phạt **-${fine.toLocaleString()}** xu!`);
    }
  }

  if (commandName === 'itemshop') {
    const embed = new EmbedBuilder().setTitle('🛍️ CỬA HÀNG VẬT PHẨM').setColor('#1E90FF')
      .addFields(
        { name: '🛡️ Khiên Bảo Về (2,000 xu)', value: 'Tự động chặn 1 lần bị cướp xu.' },
        { name: '🕵️ Kính Hiển Vi (1,500 xu)', value: '+25% tỷ lệ cướp xu thành công.' },
        { name: '🎟️ Vé X2 Lãi Ngân Hàng (5,000 xu)', value: 'Gấp đôi tiền lãi khi dùng `/laylai`.' }
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'buyitem') {
    const item = interaction.options.getString('loai');
    if (item === 'shield') {
      if (user.balance < 2000) return interaction.reply({ content: '❌ Không đủ 2,000 xu!', ephemeral: true });
      await setField(uId, gId, 'balance', user.balance - 2000);
      await setField(uId, gId, 'item_shield', user.item_shield + 1);
      return interaction.reply('🛡️ Bạn đã mua **1x Khiên Bảo Về**!');
    }
    if (item === 'scope') {
      if (user.balance < 1500) return interaction.reply({ content: '❌ Không đủ 1,500 xu!', ephemeral: true });
      await setField(uId, gId, 'balance', user.balance - 1500);
      await setField(uId, gId, 'item_scope', user.item_scope + 1);
      return interaction.reply('🕵️ Bạn đã mua **1x Kính Hiển Vi**!');
    }
    if (item === 'x2bank') {
      if (user.balance < 5000) return interaction.reply({ content: '❌ Không đủ 5,000 xu!', ephemeral: true });
      await setField(uId, gId, 'balance', user.balance - 5000);
      await setField(uId, gId, 'item_x2bank', user.item_x2bank + 1);
      return interaction.reply('🎟️ Bạn đã mua **1x Vé X2 Lãi Ngân Hàng**!');
    }
  }

  if (commandName === 'inventory') {
    return interaction.reply(`🎒 **TÚI ĐỒ CỦA ${author}**\n🛡️ Khiên: **${user.item_shield}** | 🕵️ Kính: **${user.item_scope}** | 🎟️ Vé X2: **${user.item_x2bank}**`);
  }

  if (commandName === 'rob') {
    const target = interaction.options.getUser('nan_nhan');
    if (target.id === uId) return interaction.reply({ content: '❌ Không thể tự cướp chính mình!', ephemeral: true });
    const now = Date.now();
    if (!isOwner && now - user.last_rob < 3600000) return interaction.reply({ content: '⏳ Chờ 1 tiếng nữa mới được cướp tiếp!', ephemeral: true });
    const tData = await getUser(target.id, gId);
    if (tData.balance < 300) return interaction.reply({ content: '❌ Đối phương quá nghèo!', ephemeral: true });

    if (tData.item_shield > 0) {
      await setField(target.id, gId, 'item_shield', tData.item_shield - 1);
      await setField(uId, gId, 'last_rob', now);
      return interaction.reply(`🛡️ ${target} đã dùng **Khiên Bảo Về** chặn vụ cướp của bạn!`);
    }

    await setField(uId, gId, 'last_rob', now);
    let chance = isOwner ? 1.0 : (user.is_vip ? 0.7 : 0.4);
    if (user.item_scope > 0) { chance += 0.25; await setField(uId, gId, 'item_scope', user.item_scope - 1); }

    if (Math.random() < chance) {
      const stolen = Math.floor(tData.balance * 0.2);
      await setField(uId, gId, 'balance', user.balance + stolen);
      await setField(target.id, gId, 'balance', tData.balance - stolen);
      return interaction.reply(`🥷 Cướp thành công **${stolen.toLocaleString()}** xu từ ${target}!`);
    } else {
      const penalty = Math.min(user.balance, 200);
      await setField(uId, gId, 'balance', user.balance - penalty);
      return interaction.reply(`🚓 Thất bại! Bạn bị phạt **-${penalty}** xu.`);
    }
  }

  if (commandName === 'laylai') {
    if (user.bank <= 0) return interaction.reply({ content: '❌ Ngân hàng không có tiền!', ephemeral: true });
    const now = Date.now();
    if (now - user.last_interest < 86400000) return interaction.reply({ content: '⏳ Bạn đã nhận lãi hôm nay rồi!', ephemeral: true });
    let rate = user.is_vip ? 0.10 : 0.05;
    let isX2 = false;
    if (user.item_x2bank > 0) { rate *= 2; isX2 = true; await setField(uId, gId, 'item_x2bank', user.item_x2bank - 1); }
    const interest = Math.floor(user.bank * rate);
    await setField(uId, gId, 'bank', user.bank + interest);
    await setField(uId, gId, 'last_interest', now);
    return interaction.reply(`📈 Bạn nhận được **+${interest.toLocaleString()}** xu tiền lãi${isX2 ? ' 🎉 (Vé X2)' : ''}!`);
  }

  if (commandName === 'sodu') return interaction.reply(`💰 **[${user.title}]${user.is_vip ? ' [VIP 💎]' : ''}** ${author}\n💞 Phối ngẫu: ${user.partner_id ? `<@${user.partner_id}>` : 'Độc thân'}\n💵 Ví: **${user.balance.toLocaleString()}** xu | 🏦 Bank: **${user.bank.toLocaleString()}** xu${user.debt > 0 ? `\n⚠️ Nợ: **${user.debt.toLocaleString()}** xu` : ''}`);
  if (commandName === 'daily') {
    const now = Date.now();
    if (now - user.last_daily < 86400000) return interaction.reply({ content: '⏳ Mỗi ngày chỉ điểm danh 1 lần!', ephemeral: true });
    await setField(uId, gId, 'balance', user.balance + 500);
    await setField(uId, gId, 'last_daily', now);
    return interaction.reply('🎁 Nhận thành công **+500** xu!');
  }
  if (commandName === 'gui') {
    const amt = interaction.options.getInteger('tiien');
    if (amt <= 0 || amt > user.balance) return interaction.reply({ content: '❌ Xu không đủ!', ephemeral: true });
    await setField(uId, gId, 'balance', user.balance - amt);
    await setField(uId, gId, 'bank', user.bank + amt);
    return interaction.reply(`🏦 Đã gửi **${amt.toLocaleString()}** xu vào bank!`);
  }
  if (commandName === 'rut') {
    const amt = interaction.options.getInteger('tiien');
    if (amt <= 0 || amt > user.bank) return interaction.reply({ content: '❌ Bank không đủ tiền!', ephemeral: true });
    await setField(uId, gId, 'bank', user.bank - amt);
    await setField(uId, gId, 'balance', user.balance + amt);
    return interaction.reply(`💵 Đã rút **${amt.toLocaleString()}** xu!`);
  }
  if (commandName === 'vay') {
    const amt = interaction.options.getInteger('tiien');
    if (user.debt > 0 || user.balance + user.bank >= 100 || amt <= 0 || amt > 50000) return interaction.reply({ content: '❌ Không đủ điều kiện vay!', ephemeral: true });
    await setField(uId, gId, 'balance', user.balance + amt);
    await setField(uId, gId, 'debt', amt);
    return interaction.reply(`🏦 Đã vay **${amt.toLocaleString()}** xu!`);
  }
  if (commandName === 'tra') {
    const val = interaction.options.getString('sotien_hoac_all');
    if (user.debt <= 0) return interaction.reply({ content: '❌ Bạn không có nợ!', ephemeral: true });
    let payAmt = val.toLowerCase() === 'all' ? Math.min(user.balance, user.debt) : parseInt(val) || 0;
    if (payAmt <= 0 || payAmt > user.balance) return interaction.reply({ content: '❌ Tiền không hợp lệ!', ephemeral: true });
    payAmt = Math.min(payAmt, user.debt);
    await setField(uId, gId, 'balance', user.balance - payAmt);
    await setField(uId, gId, 'debt', user.debt - payAmt);
    return interaction.reply(`💳 Đã trả **${payAmt.toLocaleString()}** xu nợ!`);
  }
  if (commandName === 'pay') {
    const target = interaction.options.getUser('nguoinhan');
    const amt = interaction.options.getInteger('tiien');
    if (target.id === uId || amt <= 0 || amt > user.balance) return interaction.reply({ content: '❌ Thao tác sai!', ephemeral: true });
    const tData = await getUser(target.id, gId);
    await setField(uId, gId, 'balance', user.balance - amt);
    await setField(target.id, gId, 'balance', tData.balance + amt);
    return interaction.reply(`💸 Đã chuyển **${amt.toLocaleString()}** xu cho ${target}!`);
  }
  if (['tx', 'cl'].includes(commandName)) {
    const choice = interaction.options.getString('luachon');
    const bet = interaction.options.getInteger('cuoc');
    if (bet <= 0 || bet > user.balance) return interaction.reply({ content: '❌ Cược không hợp lệ!', ephemeral: true });
    const d = [1, 2, 3].map(() => Math.floor(Math.random() * 6) + 1);
    const total = d[0] + d[1] + d[2];
    const res = commandName === 'tx' ? (total >= 11 ? 'tai' : 'xiu') : (total % 2 === 0 ? 'chan' : 'le');
    const win = choice === res;
    await setField(uId, gId, 'balance', win ? user.balance + bet : user.balance - bet);
    return interaction.reply(`🎲 Xúc xắc: **[ ${d.join(' | ')} ]** = **${total}** (${res.toUpperCase()})\n${win ? '🎉 Thắng' : '📉 Thua'} **${bet.toLocaleString()}** xu!`);
  }
  if (commandName === 'hu') return interaction.reply(`🎰 Hũ Jackpot: **${(await getJackpot(gId)).toLocaleString()}** xu!`);
  const shopItems = [{ id: 1, name: 'Dân Chơi', price: 5000 }, { id: 2, name: 'Thần Bài', price: 50000 }, { id: 3, name: 'Trùm Tài Xỉu', price: 200000 }];
  if (commandName === 'shop') return interaction.reply(`🛍️ **SHOP**\n${shopItems.map(i => `ID **${i.id}**: [**${i.name}**] — **${i.price.toLocaleString()}** xu`).join('\n')}`);
  if (commandName === 'buy') {
    const id = interaction.options.getInteger('id');
    const item = shopItems.find(i => i.id === id);
    if (!item || user.balance < item.price) return interaction.reply({ content: '❌ Thất bại!', ephemeral: true });
    await setField(uId, gId, 'balance', user.balance - item.price);
    await setField(uId, gId, 'title', item.name);
    return interaction.reply(`🎉 Mua thành công danh hiệu [**${item.name}**]!`);
  }
  if (commandName === 'viplist') {
    const rows = await dbAll('SELECT user_id FROM server_users WHERE guild_id = ? AND is_vip = 1', [gId]);
    return interaction.reply(`💎 **VIP** 💎\n${rows.map((u, i) => `**#${i + 1}** <@${u.user_id}>`).join('\n') || 'Trống.'}`);
  }
  if (commandName === 'top') {
    const rows = await dbAll('SELECT user_id, balance, bank, title, is_vip FROM server_users WHERE guild_id = ? ORDER BY (balance + bank) DESC LIMIT 5', [gId]);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 BẢNG XẾP HẠNG').setColor('#FFD700').setDescription(rows.map((u, i) => `**#${i + 1}** <@${u.user_id}> — **${(u.balance + u.bank).toLocaleString()}** xu`).join('\n') || 'Trống.')] });
  }
  if (commandName === 'setvip') {
    if (!isStaff) return interaction.reply({ content: '⛔ Không có quyền!', ephemeral: true });
    const target = interaction.options.getUser('user');
    const status = interaction.options.getBoolean('trangthai');
    await getUser(target.id, gId);
    await setField(target.id, gId, 'is_vip', status ? 1 : 0);
    return interaction.reply(`⭐ Đã cập nhật VIP cho ${target}!`);
  }
  if (commandName === 'addmoney') {
    if (!isStaff) return interaction.reply({ content: '⛔ Không có quyền!', ephemeral: true });
    const target = interaction.options.getUser('user');
    const amt = interaction.options.getInteger('tiien');
    const tData = await getUser(target.id, gId);
    await setField(target.id, gId, 'balance', tData.balance + amt);
    return interaction.reply(`⭐ Đã cộng **+${amt.toLocaleString()}** xu cho ${target}!`);
  }
  if (commandName === 'setmoney') {
    if (!isOwner) return interaction.reply({ content: '⛔ Chỉ Owner!', ephemeral: true });
    const target = interaction.options.getUser('user');
    const amt = interaction.options.getInteger('tiien');
    await getUser(target.id, gId);
    await setField(target.id, gId, 'balance', amt);
    return interaction.reply(`👑 Đã cài đặt ví ${target} thành **${amt.toLocaleString()}** xu!`);
  }
});

client.login(CONFIG.BOT_TOKEN);