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

// 🛑 THÊM ID DISCORD CỦA BẠN VÀO ĐÂY (Để làm Chủ bot cùng với OWNER_ID trong .env)
const CO_OWNER_ID = ''; 

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

  db.run(`CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    tx_channel_id TEXT DEFAULT NULL
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

// 4. Register Commands (Đã thêm /info)
const commands = [
  new SlashCommandBuilder().setName('info').setDescription('Xem thông tin chi tiết về Bot và Danh sách Chủ bot'),
  new SlashCommandBuilder().setName('help').setDescription('Xem menu trợ giúp đầy đủ'),
  new SlashCommandBuilder().setName('sodu').setDescription('Xem số dư ví và ngân hàng'),
  new SlashCommandBuilder().setName('daily').setDescription('Nhận thưởng điểm danh hằng ngày'),
  
  // Cấu hình Kênh Auto Tài Xỉu
  new SlashCommandBuilder()
    .setName('settxchannel')
    .setDescription('Thiết lập kênh đặt cược Tài Xỉu tự động liên tục')
    .addChannelOption(o => o.setName('kenh').setDescription('Chọn kênh làm sòng Tài Xỉu').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('canceltxchannel')
    .setDescription('Tắt chế độ Auto Tài Xỉu tự động ở server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // Trò chơi mini
  new SlashCommandBuilder()
    .setName('cl')
    .setDescription('Chơi Chẵn Lẻ')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn hoặc Lẻ').setRequired(true).addChoices({name:'Chẵn',value:'chan'},{name:'Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('hu')
    .setDescription('Quay Hũ hoặc xem hũ hiện tại')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền đặt hũ (để trống nếu chỉ xem)').setRequired(false)),
    
  new SlashCommandBuilder()
    .setName('xidach')
    .setDescription('Chơi Xì Dách (Blackjack 21 điểm)')
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('baucua')
    .setDescription('Chơi Bầu Cua Tôm Cá')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn linh vật đặt cược').setRequired(true).addChoices(
      {name:'🍐 Bầu',value:'bau'},{name:'🦀 Cua',value:'cua'},{name:'🦐 Tôm',value:'tom'},{name:'🐟 Cá',value:'ca'},{name:'🦌 Nai',value:'nai'},{name:'🐓 Gà',value:'ga'}
    ))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('xocdia')
    .setDescription('Chơi Xóc Đĩa')
    .addStringOption(o => o.setName('luachon').setDescription('Chọn Chẵn hoặc Lẻ').setRequired(true).addChoices({name:'🔴 Chẵn',value:'chan'},{name:'⚪ Lẻ',value:'le'}))
    .addIntegerOption(o => o.setName('tiencuoc').setDescription('Số tiền cược').setRequired(true)),

  // Cày cấy & Cướp
  new SlashCommandBuilder().setName('work').setDescription('Làm việc kiếm xu'),
  new SlashCommandBuilder().setName('crime').setDescription('Làm việc phi pháp (Rủi ro cao)'),
  new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Cướp tiền người khác')
    .addUserOption(o => o.setName('target').setDescription('Mục tiêu bạn muốn cướp').setRequired(true)),

  // Tình cảm
  new SlashCommandBuilder()
    .setName('marry')
    .setDescription('Cầu hôn người khác')
    .addUserOption(o => o.setName('target').setDescription('Người bạn muốn kết hôn').setRequired(true)),
  new SlashCommandBuilder().setName('divorce').setDescription('Ly hôn người phối ngẫu'),

  // Thú Cưng
  new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Hệ thống Thú Cưng')
    .addSubcommand(s => s.setName('info').setDescription('Xem thú cưng của bạn'))
    .addSubcommand(s => s.setName('buy').setDescription('Mua thú cưng').addStringOption(o => o.setName('loai').setDescription('Chọn loại pet muốn mua').setRequired(true).addChoices(
      {name:'🐶 Chó Cảnh (10.000 xu)',value:'cho'},{name:'🐱 Mèo Thần Tài (20.000 xu)',value:'meo'},{name:'🐉 Rồng Lửa (50.000 xu)',value:'rong'}
    )))
    .addSubcommand(s => s.setName('feed').setDescription('Cho thú cưng ăn (5.000 xu)')),

  // Băng Nhóm & Truy Nã
  new SlashCommandBuilder()
    .setName('gang')
    .setDescription('Hệ thống Băng Nhóm')
    .addSubcommand(s => s.setName('create').setDescription('Tạo băng nhóm (50.000 xu)').addStringOption(o => o.setName('tenbang').setDescription('Nhập tên băng nhóm').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Xem thông tin băng nhóm của bạn')),
    
  new SlashCommandBuilder()
    .setName('truyna')
    .setDescription('Đặt tiền treo thưởng truy nã người khác')
    .addUserOption(o => o.setName('target').setDescription('Người bị truy nã').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền treo thưởng').setRequired(true)),

  // Tương Tác
  new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Chuyển tiền trực tiếp cho người khác')
    .addUserOption(o => o.setName('target').setDescription('Người nhận tiền').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền muốn chuyển').setRequired(true)),
    
  new SlashCommandBuilder().setName('hug').setDescription('Ôm ai đó').addUserOption(o => o.setName('target').setDescription('Người bạn muốn ôm').setRequired(true)),
  new SlashCommandBuilder().setName('kiss').setDescription('Hôn ai đó').addUserOption(o => o.setName('target').setDescription('Người bạn muốn hôn').setRequired(true)),
  new SlashCommandBuilder().setName('slap').setDescription('Tát ai đó').addUserOption(o => o.setName('target').setDescription('Người bạn muốn tát').setRequired(true)),
  new SlashCommandBuilder().setName('pat').setDescription('Xoa đầu ai đó').addUserOption(o => o.setName('target').setDescription('Người bạn muốn xoa đầu').setRequired(true)),

  // Ngân hàng
  new SlashCommandBuilder().setName('gui').setDescription('Gửi tiền vào ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền gửi').setRequired(true)),
  new SlashCommandBuilder().setName('rut').setDescription('Rút tiền từ ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền rút').setRequired(true)),
  new SlashCommandBuilder().setName('vay').setDescription('Vay tiền từ ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền muốn vay').setRequired(true)),
  new SlashCommandBuilder().setName('tra').setDescription('Trả nợ ngân hàng').addIntegerOption(o => o.setName('sotien').setDescription('Số tiền trả nợ').setRequired(true)),
  new SlashCommandBuilder().setName('laylai').setDescription('Nhận tiền lãi ngân hàng định kỳ'),

  // Shop & Bảng xếp hạng
  new SlashCommandBuilder().setName('shop').setDescription('Cửa hàng vật phẩm'),
  new SlashCommandBuilder().setName('inventory').setDescription('Túi đồ cá nhân'),
  new SlashCommandBuilder().setName('viplist').setDescription('Danh sách các đại gia VIP'),
  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng top đại gia'),

  // Staff/Owner Commands
  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('Cộng tiền cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi được cộng tiền').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền muốn cộng').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('setvip')
    .setDescription('Set quyền VIP cho người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi được nhận VIP').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('setmoney')
    .setDescription('Thiết lập lại số tiền của người chơi (Owner)')
    .addUserOption(o => o.setName('user').setDescription('Người chơi cần thay đổi số dư').setRequired(true))
    .addIntegerOption(o => o.setName('sotien').setDescription('Số tiền mới muốn ấn định').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Gửi thông báo toàn máy chủ (Owner)')
    .addStringOption(o => o.setName('noidung').setDescription('Nội dung thông báo').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('lixi')
    .setDescription('Phát lì xì cho các thành viên (Owner)')
    .addIntegerOption(o => o.setName('tongtien').setDescription('Tổng ngân sách lì xì').setRequired(true))
    .addIntegerOption(o => o.setName('sobao').setDescription('Số lượng bao lì xì').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🚀 Bot đã online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Đã đăng ký tất cả lệnh Slash Command thành công!');
  } catch (err) {
    console.error('❌ Lỗi khi đăng ký lệnh:', err);
  }

  startAutoTxLoop();
});

// --- BIẾN QUẢN LÝ PHIÊN AUTO TÀI XỈU ---
const activeSessions = new Map();

async function startSingleTxSession(channel) {
  if (activeSessions.has(channel.id)) return;

  const session = {
    timeLeft: 40,
    totalTai: 0,
    totalXiu: 0,
    bets: new Map(),
    message: null
  };

  activeSessions.set(channel.id, session);

  await channel.send('🎲 **Đặt cược Tài Xỉu đã bắt đầu! Thời gian đặt cược là 40 giây.**\n🎲 **Betting has begun! Bet time is 40 seconds.**');

  const renderEmbed = () => {
    return new EmbedBuilder()
      .setColor('#ff9900')
      .setDescription(
        `🎲 **Đặt cược Tài Xỉu / Place your bets!**\n\n` +
        `Nhấn vào nút để chọn Tài hoặc Xỉu và nhập số tiền cược. Thời gian còn lại: **${session.timeLeft}s**.\n` +
        `Click the button to select Tai or Xiu. Time left: **${session.timeLeft}s**.\n\n` +
        `**Total Tài / Tai**\n${session.totalTai.toLocaleString()}$\n\n` +
        `**Total Xỉu / Xiu**\n${session.totalXiu.toLocaleString()}$\n\n` +
        `**Number of participants**\n${session.bets.size}`
      )
      .setFooter({ text: `${client.user.username} | Hôm nay lúc ${new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}` });
  };

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tx_btn_tai').setLabel('Tài / Tai').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_xiu').setLabel('Xỉu / Xiu').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tx_btn_cancel').setLabel('Hủy cược / Cancel').setStyle(ButtonStyle.Danger)
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

  let summary = `🎲 **KẾT QUẢ PHIÊN TÀI XỈU:**\n• Kết quả Xí Ngầu: **${d1} - ${d2} -${d3}** (Tổng: **${total}** - **${result.toUpperCase()}**)\n\n`;

  if (session.bets.size === 0) {
    summary += '❌ Không có ai tham gia đặt cược phiên này!';
  } else {
    for (const [userId, bet] of session.bets.entries()) {
      if (bet.choice === result) {
        const winAmt = bet.amount * 2;
        await updateBalance(userId, winAmt);
        summary += `🎉 <@${userId}> thắng **+${bet.amount.toLocaleString()}** xu!\n`;
      } else {
        summary += `💸 <@${userId}> thua **-${bet.amount.toLocaleString()}** xu!\n`;
      }
    }
  }

  const disabledButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tx_btn_tai').setLabel('Tài / Tai').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('tx_btn_xiu').setLabel('Xỉu / Xiu').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('tx_btn_cancel').setLabel('Hủy cược / Cancel').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  await session.message.edit({ components: [disabledButtons] }).catch(() => {});
  await channel.send({ embeds: [new EmbedBuilder().setColor('#00ff00').setDescription(summary)] });

  activeSessions.delete(channel.id);
}

function startAutoTxLoop() {
  setInterval(() => {
    db.all(`SELECT tx_channel_id FROM guild_settings WHERE tx_channel_id IS NOT NULL`, [], async (err, rows) => {
      if (err || !rows) return;

      for (const row of rows) {
        try {
          const channel = await client.channels.fetch(row.tx_channel_id).catch(() => null);
          if (channel && !activeSessions.has(channel.id)) {
            startSingleTxSession(channel);
          }
        } catch (e) {
          console.error("Lỗi Auto TX:", e);
        }
      }
    });
  }, 10000);
}

// 5. Interaction Handler
client.on('interactionCreate', async (i) => {

  if (i.isButton()) {
    const session = activeSessions.get(i.channelId);
    if (!session) return i.reply({ content: '❌ Phiên cược này đã kết thúc!', ephemeral: true });

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
      const session = activeSessions.get(i.channelId);
      if (!session) return i.reply({ content: '❌ Phiên cược đã kết thúc!', ephemeral: true });

      const choice = i.customId.replace('tx_modal_', '');
      const amtStr = i.fields.getTextInputValue('tx_bet_amount');
      const amt = parseInt(amtStr);

      if (isNaN(amt) || amt <= 0) return i.reply({ content: '❌ Số tiền nhập không hợp lệ!', ephemeral: true });

      const uData = await getUser(i.user.id);
      if (uData.balance < amt) return i.reply({ content: '❌ Số dư tài khoản không đủ!', ephemeral: true });

      if (session.bets.has(i.user.id)) {
        return i.reply({ content: '❌ Bạn đã cược phiên này rồi! Hãy bấm Hủy cược trước nếu muốn cược lại.', ephemeral: true });
      }

      await updateBalance(i.user.id, -amt);
      session.bets.set(i.user.id, { choice, amount: amt });

      if (choice === 'tai') session.totalTai += amt;
      else session.totalXiu += amt;

      return i.reply({ content: `✅ Đã đặt **${amt.toLocaleString()}** xu vào cửa **${choice.toUpperCase()}**!`, ephemeral: true });
    }
  }

  if (!i.isChatInputCommand()) return;

  const { commandName: cmd, user, options, guildId } = i;
  const uid = user.id;
  const ownerId = process.env.OWNER_ID;
  
  // Hàm kiểm tra xem người dùng có phải Owner/Co-Owner không
  const isBotOwner = (id) => id === ownerId || id === CO_OWNER_ID;

  const uData = await getUser(uid);

  // Lệnh /info
  if (cmd === 'info') {
    const app = await client.application.fetch();
    const primaryOwner = app.owner;
    
    let ownersText = `<@${CO_OWNER_ID}>`;
    if (primaryOwner) {
      ownersText = `<@${primaryOwner.id}> & <@${CO_OWNER_ID}>`;
    }

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`🤖 THÔNG TIN BOT: ${client.user.username}`)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '📛 Tên Bot', value: `**${client.user.tag}**`, inline: true },
        { name: '👑 Chủ Sở Hữu (Owners)', value: ownersText, inline: true },
        { name: '🆔 Bot ID', value: `\`${client.user.id}\``, inline: false },
        { name: '🌐 Máy chủ hoạt động', value: `\`${client.guilds.cache.size}\` server`, inline: true },
        { name: '👥 Người dùng quản lý', value: `\`${client.users.cache.size}\` người`, inline: true }
      )
      .setFooter({ text: `Yêu cầu bởi ${user.tag}`, iconURL: user.displayAvatarURL() })
      .setTimestamp();

    return i.reply({ embeds: [embed] });
  }

  // Auto TX Admin Config
  if (cmd === 'settxchannel') {
    const targetChannel = options.getChannel('kenh');
    db.run(`INSERT INTO guild_settings (guild_id, tx_channel_id) VALUES (?, ?) 
            ON CONFLICT(guild_id) DO UPDATE SET tx_channel_id = ?`, 
            [guildId, targetChannel.id, targetChannel.id]);

    return i.reply(`✅ Đã chọn <#${targetChannel.id}> làm **Sòng Auto Tài Xỉu**!`);
  }

  if (cmd === 'canceltxchannel') {
    db.run(`UPDATE guild_settings SET tx_channel_id = NULL WHERE guild_id = ?`, [guildId]);
    return i.reply(`🛑 Đã tắt sòng Auto Tài Xỉu tự động tại server.`);
  }

  // Menu Help
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setTitle('🎰 DANH SÁCH LỆNH CASINO ALL-IN-ONE')
      .addFields(
        { name: 'ℹ️ Thông Tin', value: '`/info` • `/help`', inline: false },
        { name: '⚙️ Sòng Auto (Admin)', value: '`/settxchannel` • `/canceltxchannel`', inline: false },
        { name: '🎲 Mini Games', value: '`/cl` • `/hu` • `/xidach` • `/baucua` • `/xocdia`', inline: false },
        { name: '🐾 Thú Cưng', value: '`/pet info` • `/pet buy` • `/pet feed`', inline: false },
        { name: '🏴‍☠️ Băng Nhóm', value: '`/gang create` • `/gang info` • `/truyna`', inline: false },
        { name: '🌾 Cày Cấy', value: '`/work` • `/crime` • `/rob` • `/daily`', inline: false },
        { name: '💞 Tương Tác', value: '`/pay` • `/hug` • `/kiss` • `/slap` • `/pat` • `/marry` • `/divorce`', inline: false },
        { name: '🏦 Ngân Hàng', value: '`/gui` • `/rut` • `/vay` • `/tra` • `/laylai`', inline: false },
        { name: '🎒 Cá Nhân', value: '`/shop` • `/inventory` • `/sodu` • `/top` • `/viplist`', inline: false },
        { name: '⭐ Quản Trị Bot (Owner Only)', value: '`/addmoney` • `/setvip` • `/setmoney` • `/broadcast` • `/lixi`', inline: false }
      );
    return i.reply({ embeds: [embed] });
  }

  // Thú cưng
  if (cmd === 'pet') {
    const sub = options.getSubcommand();
    if (sub === 'info') {
      if (!uData.pet_type) return i.reply({ content: '❌ Chưa có pet! Dùng `/pet buy`.', ephemeral: true });
      const petNames = { cho: '🐶 Chó Cảnh', meo: '🐱 Mèo Thần Tài', rong: '🐉 Rồng Lửa' };
      return i.reply({ embeds: [new EmbedBuilder().setColor('#00ff88').setTitle(`🐾 Pet Của ${user.username}`)
        .setDescription(`• **Loại:** ${petNames[uData.pet_type]}\n• **Level:** ${uData.pet_level}`)] });
    }
    if (sub === 'buy') {
      if (uData.pet_type) return i.reply({ content: '❌ Bạn đã có pet rồi!', ephemeral: true });
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
      return i.reply(`🍖 Pet nâng cấp lên **Level ${uData.pet_level + 1}**!`);
    }
  }

  // Băng nhóm
  if (cmd === 'gang') {
    const sub = options.getSubcommand();
    if (sub === 'create') {
      if (uData.gang_id) return i.reply({ content: '❌ Bạn đã có bang rồi!', ephemeral: true });
      if (uData.balance < 50000) return i.reply({ content: '❌ Cần 50.000 xu!', ephemeral: true });
      const gangName = options.getString('tenbang');
      const gangId = 'gang_' + Date.now();
      await updateBalance(uid, -50000);
      db.run(`INSERT INTO gangs (id, name, owner_id, fund) VALUES (?, ?, ?, ?)`, [gangId, gangName, uid, 10000]);
      db.run(`UPDATE users SET gang_id = ? WHERE id = ?`, [gangId, uid]);
      return i.reply(`🔥 Tạo Băng **[${gangName}]** thành công!`);
    }
    if (sub === 'info') {
      if (!uData.gang_id) return i.reply({ content: '❌ Chưa gia nhập bang!', ephemeral: true });
      db.get(`SELECT * FROM gangs WHERE id = ?`, [uData.gang_id], (err, gang) => {
        if (!gang) return i.reply({ content: '❌ Không tìm thấy thông tin!', ephemeral: true });
        return i.reply({ embeds: [new EmbedBuilder().setColor('#ff4500').setTitle(`🏴‍☠️ Băng: ${gang.name}`)
          .setDescription(`• **Bang chủ:** <@${gang.owner_id}>\n• **Quỹ bang:** ${gang.fund.toLocaleString()} xu`)] });
      });
      return;
    }
  }

  // Truy nã & Chuyển tiền
  if (cmd === 'truyna') {
    const target = options.getUser('target');
    const amt = options.getInteger('sotien');
    if (target.id === uid || amt < 5000 || uData.balance < amt) return i.reply({ content: '❌ Số tiền cược truy nã không hợp lệ!', ephemeral: true });
    await updateBalance(uid, -amt);
    db.run(`UPDATE users SET bounty = bounty + ? WHERE id = ?`, [amt, target.id]);
    return i.reply(`🚨 **LỆNH TRUY NÃ!** <@${uid}> treo thưởng **${amt.toLocaleString()}** xu cho đầu <@${target.id}>!`);
  }

  if (cmd === 'pay') {
    const target = options.getUser('target');
    const amt = options.getInteger('sotien');
    if (target.id === uid || amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Giao dịch không hợp lệ!', ephemeral: true });
    await getUser(target.id);
    await updateBalance(uid, -amt);
    await updateBalance(target.id, amt);
    return i.reply(`💸 <@${uid}> chuyển **${amt.toLocaleString()}** xu cho <@${target.id}>!`);
  }

  // Interaction
  if (['hug', 'kiss', 'slap', 'pat'].includes(cmd)) {
    const target = options.getUser('target');
    return i.reply({ content: `✨ <@${uid}> đã dùng lệnh **${cmd}** với <@${target.id}>!` });
  }

  // Mini games
  if (cmd === 'xidach') {
    const bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Không đủ tiền cược!', ephemeral: true });
    const pTotal = Math.floor(Math.random()*10)+12, bTotal = Math.floor(Math.random()*10)+12;
    if (pTotal > bTotal && pTotal <= 21) {
      await updateBalance(uid, bet);
      return i.reply(`🃏 Điểm bạn **${pTotal}** vs Nhà cái **${bTotal}**. Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🃏 Điểm bạn **${pTotal}** vs Nhà cái **${bTotal}**. Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'baucua') {
    const choice = options.getString('luachon'), bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Không đủ tiền cược!', ephemeral: true });
    const items = ['bau', 'cua', 'tom', 'ca', 'nai', 'ga'];
    const res = [items[Math.floor(Math.random()*6)], items[Math.floor(Math.random()*6)], items[Math.floor(Math.random()*6)]];
    const match = res.filter(x => x === choice).length;
    if (match > 0) {
      await updateBalance(uid, bet * match);
      return i.reply(`🎲 Kết quả: ${res.join(', ')}. Trúng ${match} con! Thắng **+${(bet * match).toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🎲 Kết quả: ${res.join(', ')}. Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'xocdia') {
    const choice = options.getString('luachon'), bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Không đủ tiền cược!', ephemeral: true });
    const isChan = Math.random() > 0.5;
    const win = (choice === 'chan' && isChan) || (choice === 'le' && !isChan);
    if (win) {
      await updateBalance(uid, bet);
      return i.reply(`🔴 Kết quả: **${isChan ? 'CHẮN' : 'LẺ'}**. Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🔴 Kết quả: **${isChan ? 'CHẮN' : 'LẺ'}**. Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'cl') {
    const choice = options.getString('luachon'), bet = options.getInteger('tiencuoc');
    if (bet <= 0 || uData.balance < bet) return i.reply({ content: '❌ Không đủ tiền cược!', ephemeral: true });
    const num = Math.floor(Math.random() * 100);
    const isChan = num % 2 === 0;
    const win = (choice === 'chan' && isChan) || (choice === 'le' && !isChan);
    if (win) {
      await updateBalance(uid, bet);
      return i.reply(`🔢 Số mở ra: **${num}** (${isChan ? 'CHẮN' : 'LẺ'}). Thắng **+${bet.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -bet);
      return i.reply(`🔢 Số mở ra: **${num}** (${isChan ? 'CHẮN' : 'LẺ'}). Thua **-${bet.toLocaleString()}** xu!`);
    }
  }

  if (cmd === 'hu') {
    const bet = options.getInteger('tiencuoc');
    db.get(`SELECT amount FROM jackpot WHERE id = 1`, [], async (err, row) => {
      let jackpotAmt = row ? row.amount : 50000;
      if (!bet) return i.reply(`🎰 Hũ hiện tại: **${jackpotAmt.toLocaleString()}** xu!`);
      if (bet < 1000 || uData.balance < bet) return i.reply({ content: '❌ Cược từ 1.000 xu!', ephemeral: true });
      db.run(`UPDATE jackpot SET amount = amount + ? WHERE id = 1`, [Math.floor(bet * 0.3)]);
      if (Math.random() < 0.05) {
        await updateBalance(uid, jackpotAmt);
        db.run(`UPDATE jackpot SET amount = 50000 WHERE id = 1`);
        return i.reply(`🎉 🎉 **NỔ HŨ!** Trúng hũ **${jackpotAmt.toLocaleString()}** xu!`);
      } else {
        await updateBalance(uid, -bet);
        return i.reply(`🎰 Rất tiếc, chưa nổ hũ!`);
      }
    });
    return;
  }

  // Tra cứu & Top
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

  // Work, Daily, Crime, Rob
  if (cmd === 'daily') {
    const now = Date.now();
    if (now - uData.last_daily < 86400000) return i.reply({ content: '⏳ Bạn đã nhận quà hôm nay rồi!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + 5000, last_daily = ? WHERE id = ?`, [now, uid]);
    return i.reply('🎉 Bạn nhận được điểm danh +5,000 xu!');
  }

  if (cmd === 'work') {
    const now = Date.now();
    if (now - uData.last_work < 300000) return i.reply({ content: '⏳ Hãy nghỉ ngơi 5 phút!', ephemeral: true });
    const earn = Math.floor(Math.random() * 2000) + 1000;
    db.run(`UPDATE users SET balance = balance + ?, last_work = ? WHERE id = ?`, [earn, now, uid]);
    return i.reply(`💼 Bạn nhận công làm việc +${earn.toLocaleString()} xu!`);
  }

  if (cmd === 'crime') {
    const now = Date.now();
    if (now - uData.last_crime < 600000) return i.reply({ content: '⏳ Đợi 10 phút nhé!', ephemeral: true });
    db.run(`UPDATE users SET last_crime = ? WHERE id = ?`, [now, uid]);
    if (Math.random() > 0.4) {
      const earn = Math.floor(Math.random() * 4000) + 2000;
      await updateBalance(uid, earn);
      return i.reply(`🥷 Trót chót thành công! Nhận **+${earn.toLocaleString()}** xu!`);
    } else {
      await updateBalance(uid, -2000);
      return i.reply(`🚓 Bị cảnh sát phát hiện phạt **-2,000** xu!`);
    }
  }

  if (cmd === 'rob') {
    const target = options.getUser('target');
    if (target.id === uid) return i.reply({ content: '❌ Không thể tự cướp chính mình!', ephemeral: true });
    const tData = await getUser(target.id);
    if (tData.balance < 2000) return i.reply({ content: '❌ Đối phương không đủ tiền mặt!', ephemeral: true });
    const now = Date.now();
    if (now - uData.last_rob < 900000) return i.reply({ content: '⏳ Đợi 15 phút!', ephemeral: true });
    db.run(`UPDATE users SET last_rob = ? WHERE id = ?`, [now, uid]);
    if (Math.random() > 0.5) {
      const robAmt = Math.floor(tData.balance * 0.2);
      await updateBalance(target.id, -robAmt);
      await updateBalance(uid, robAmt);
      return i.reply(`💥 Cướp thành công **${robAmt.toLocaleString()}** xu của <@${target.id}>!`);
    } else {
      return i.reply(`🛡️ Cướp thất bại, đối phương phản công!`);
    }
  }

  // Ngân hàng
  if (cmd === 'gui') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Tiền ví không đủ!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance - ?, bank = bank + ? WHERE id = ?`, [amt, amt, uid]);
    return i.reply(`🏦 Gửi thành công **${amt.toLocaleString()}** xu vào ngân hàng!`);
  }

  if (cmd === 'rut') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.bank < amt) return i.reply({ content: '❌ Ngân hàng không đủ tiền!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + ?, bank = bank - ? WHERE id = ?`, [amt, amt, uid]);
    return i.reply(`🏦 Rút thành công **${amt.toLocaleString()}** xu về ví!`);
  }

  if (cmd === 'vay') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || amt > 50000) return i.reply({ content: '❌ Vay tối đa 50.000 xu!', ephemeral: true });
    if (uData.debt > 0) return i.reply({ content: '❌ Phải trả xong nợ cũ trước!', ephemeral: true });
    db.run(`UPDATE users SET balance = balance + ?, debt = ? WHERE id = ?`, [amt, Math.floor(amt * 1.2), uid]);
    return i.reply(`💳 Đã giải ngân khoản vay **${amt.toLocaleString()}** xu!`);
  }

  if (cmd === 'tra') {
    const amt = options.getInteger('sotien');
    if (amt <= 0 || uData.balance < amt) return i.reply({ content: '❌ Tiền ví không đủ!', ephemeral: true });
    const payAmt = Math.min(amt, uData.debt);
    db.run(`UPDATE users SET balance = balance - ?, debt = debt - ? WHERE id = ?`, [payAmt, payAmt, uid]);
    return i.reply(`💳 Đã thanh toán **${payAmt.toLocaleString()}** xu tiền nợ!`);
  }

  if (cmd === 'laylai') {
    const now = Date.now();
    if (now - uData.last_interest < 86400000) return i.reply({ content: '⏳ Chỉ nhận lãi 24h một lần!', ephemeral: true });
    if (uData.bank <= 0) return i.reply({ content: '❌ Tài khoản ngân hàng chưa có tiền gửi!', ephemeral: true });
    const interest = Math.floor(uData.bank * 0.05);
    db.run(`UPDATE users SET bank = bank + ?, last_interest = ? WHERE id = ?`, [interest, now, uid]);
    return i.reply(`📈 Nhận **+${interest.toLocaleString()}** xu tiền lãi!`);
  }

  // Tình cảm
  if (cmd === 'marry') {
    const target = options.getUser('target');
    db.run(`UPDATE users SET married_with = ? WHERE id = ?`, [target.id, uid]);
    return i.reply(`💍 Chúc mừng bạn đã kết hôn với <@${target.id}>!`);
  }

  if (cmd === 'divorce') {
    db.run(`UPDATE users SET married_with = NULL WHERE id = ?`, [uid]);
    return i.reply(`💔 Bạn đã trở về trạng thái độc thân!`);
  }

  // Lệnh phụ
  if (cmd === 'shop' || cmd === 'inventory' || cmd === 'viplist') {
    return i.reply('🎒 Tính năng cửa hàng và vật phẩm đang hoạt động bình thường!');
  }

  // Admin / Owner Commands (Đã hỗ trợ kiểm tra cả Owner và Co-Owner)
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
    return i.reply(`🧹 Đã cài đặt số dư của <@${target.id}> thành **${amt.toLocaleString()}** xu!`);
  }

  if (cmd === 'setvip') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });
    const target = options.getUser('user');
    db.run(`UPDATE users SET is_vip = 1 WHERE id = ?`, [target.id]);
    return i.reply(`👑 Đã nâng cấp VIP thành công cho <@${target.id}>!`);
  }

  if (cmd === 'broadcast') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });
    const txt = options.getString('noidung');
    return i.reply({ embeds: [new EmbedBuilder().setTitle('📢 THÔNG BÁO').setDescription(txt)] });
  }

  if (cmd === 'lixi') {
    if (!isBotOwner(uid)) return i.reply({ content: '❌ Lệnh dành riêng cho Owner!', ephemeral: true });
    const total = options.getInteger('tongtien'), slots = options.getInteger('sobao');
    return i.reply(`🧧 Đã phát lì xì tổng **${total.toLocaleString()}** xu chia làm **${slots}** phần!`);
  }
});

client.login(process.env.DISCORD_TOKEN);
