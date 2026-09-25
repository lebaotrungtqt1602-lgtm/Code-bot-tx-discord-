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
  res.write("Bot Casino Slash Command 24/7 dang hoat dong!");
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

// 3. Khởi tạo CSDL SQLite
const db = new sqlite3.Database('./casino.db');

db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 1000,
  last_daily INTEGER DEFAULT 0,
  is_vip INTEGER DEFAULT 0
)`);

// Các hàm bổ trợ CSDL
const getUser = (id) => new Promise((resolve) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (id, balance, is_vip) VALUES (?, 1000, 0)`, [id]);
      resolve({ id, balance: 1000, last_daily: 0, is_vip: 0 });
    } else {
      resolve(row);
    }
  });
});

const updateBalance = (id, amount) => {
  return new Promise((resolve) => {
    db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, id], resolve);
  });
};

const setVipStatus = (id, status) => {
  return new Promise((resolve) => {
    db.run(`UPDATE users SET is_vip = ? WHERE id = ?`, [status, id], resolve);
  });
};

// 4. Định nghĩa danh sách các lệnh Slash Command
const commands = [
  new SlashCommandBuilder()
    .setName('sodu')
    .setDescription('Xem số dư tài khoản của bạn'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Nhận thưởng điểm danh hằng ngày'),

  new SlashCommandBuilder()
    .setName('taixiu')
    .setDescription('Chơi cược Tài Xỉu')
    .addStringOption(option =>
      option.setName('luachon')
        .setDescription('Chọn Tài hoặc Xỉu')
        .setRequired(true)
        .addChoices(
          { name: 'Tài (11 - 17)', value: 'tai' },
          { name: 'Xỉu (3 - 10)', value: 'xiu' }
        )
    )
    .addIntegerOption(option =>
      option.setName('tiencuoc')
        .setDescription('Số tiền xu muốn cược')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setvip')
    .setDescription('Cấp quyền VIP cho thành viên (Chỉ Owner)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Người dùng muốn nâng VIP')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('removevip')
    .setDescription('Gỡ quyền VIP của thành viên (Chỉ Owner)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Người dùng muốn gỡ VIP')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('lixi')
    .setDescription('Phát Lì Xì toàn server (Chỉ VIP & Owner)')
    .addIntegerOption(option =>
      option.setName('tongtien')
        .setDescription('Tổng số xu phát lì xì')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('sobao')
        .setDescription('Tổng số bao lì xì (số người nhận)')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// 5. Đăng ký Slash Command tự động với Discord REST API
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
  console.log(`🚀 Bot đã online thành công dưới tên: ${client.user.tag}`);
  
  try {
    console.log('🔄 Đang tiến hành đăng ký danh sách Slash Commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Đã đăng ký thành công tất cả lệnh Slash Command!');
  } catch (error) {
    console.error('❌ Lỗi khi đăng ký Slash Commands:', error);
  }
});

// 6. Lắng nghe và Xử lý Lệnh Slash Command
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;
  const userId = user.id;
  const ownerId = process.env.OWNER_ID;

  // LỆNH /sodu
  if (commandName === 'sodu') {
    const userData = await getUser(userId);
    const vipStatus = (userId === ownerId || userData.is_vip) ? '👑 [VIP]' : '👤 [Thường]';
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('💰 SỐ DƯ TÀI KHOẢN')
      .setDescription(`Xin chào **${user.username}** ${vipStatus}\nBạn đang có: **${userData.balance.toLocaleString()}** xu!`);
    return interaction.reply({ embeds: [embed] });
  }

  // LỆNH /daily
  if (commandName === 'daily') {
    const userData = await getUser(userId);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (now - userData.last_daily < cooldown) {
      const remainingHours = Math.ceil((cooldown - (now - userData.last_daily)) / (1000 * 60 * 60));
      return interaction.reply({ content: `⏳ Bạn đã nhận thưởng hôm nay rồi! Vui lòng quay lại sau **${remainingHours} giờ** nữa.`, ephemeral: true });
    }

    const reward = (userId === ownerId || userData.is_vip) ? 10000 : 5000;
    db.run(`UPDATE users SET balance = balance + ?, last_daily = ? WHERE id = ?`, [reward, now, userId]);
    return interaction.reply({ content: `🎉 Bạn đã nhận thành công **${reward.toLocaleString()}** xu điểm danh hằng ngày!` });
  }

  // LỆNH /taixiu
  if (commandName === 'taixiu') {
    const choice = interaction.options.getString('luachon');
    const bet = interaction.options.getInteger('tiencuoc');

    if (bet <= 0) {
      return interaction.reply({ content: "⚠️ Số tiền cược phải lớn hơn 0 xu!", ephemeral: true });
    }

    const userData = await getUser(userId);
    if (userData.balance < bet) {
      return interaction.reply({ content: "❌ Bạn không có đủ xu để đặt cược số tiền này!", ephemeral: true });
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const d3 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2 + d3;
    const result = total >= 11 ? 'tai' : 'xiu';

    let resultText = `🎲 **Kết quả:** ${d1} - ${d2} - ${d3} ➡️ **Tổng: ${total}** (${result.toUpperCase()})\n`;

    if (choice === result) {
      await updateBalance(userId, bet);
      resultText += `🎉 **CHÚC MỪNG!** Bạn đoán đúng và nhận được **+${bet.toLocaleString()}** xu!`;
    } else {
      await updateBalance(userId, -bet);
      resultText += `💸 **RẤT TIẾC!** Bạn đoán sai và mất **-${bet.toLocaleString()}** xu!`;
    }

    const embed = new EmbedBuilder()
      .setColor(choice === result ? '#00FF00' : '#FF0000')
      .setTitle('🎲 GAME TÀI XỈU')
      .setDescription(resultText);

    return interaction.reply({ embeds: [embed] });
  }

  // LỆNH /setvip
  if (commandName === 'setvip') {
    if (userId !== ownerId) {
      return interaction.reply({ content: "❌ Chỉ **Chủ Bot** mới có quyền sử dụng lệnh này!", ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    await getUser(targetUser.id);
    await setVipStatus(targetUser.id, 1);
    return interaction.reply({ content: `🎉 Đã nâng cấp trạng thái **VIP** thành công cho <@${targetUser.id}>!` });
  }

  // LỆNH /removevip
  if (commandName === 'removevip') {
    if (userId !== ownerId) {
      return interaction.reply({ content: "❌ Chỉ **Chủ Bot** mới có quyền sử dụng lệnh này!", ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    await setVipStatus(targetUser.id, 0);
    return interaction.reply({ content: `🔨 Đã tước quyền VIP của <@${targetUser.id}>!` });
  }

  // LỆNH /lixi
  if (commandName === 'lixi') {
    const userData = await getUser(userId);

    if (userId !== ownerId && !userData.is_vip) {
      return interaction.reply({ content: "🔒 Bạn cần có trạng thái **VIP** hoặc là **Chủ Bot** để phát Lì Xì!", ephemeral: true });
    }

    const totalMoney = interaction.options.getInteger('tongtien');
    const totalSlots = interaction.options.getInteger('sobao');

    if (totalMoney <= 0 || totalSlots <= 0) {
      return interaction.reply({ content: "⚠️ Số tiền và số bao phải lớn hơn 0!", ephemeral: true });
    }

    if (userData.balance < totalMoney) {
      return interaction.reply({ content: "❌ Số dư của bạn không đủ để phát lì xì này!", ephemeral: true });
    }

    await updateBalance(userId, -totalMoney);

    let remainingMoney = totalMoney;
    let remainingSlots = totalSlots;
    const claimedUsers = new Set();

    const lixiEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🧧 LÌ XÌ TẾT TOÀN SERVER 🧧')
      .setDescription(
        `Người phát: <@${userId}>\n` +
        `💰 **Tổng xu:** ${totalMoney.toLocaleString()}\n` +
        `🎁 **Số bao:** ${totalSlots}\n\n` +
        `👉 Nhanh tay bấm nút **"Giật Lì Xì"** bên dưới để nhận xu ngẫu nhiên!`
      );

    const btn = new ButtonBuilder()
      .setCustomId('claim_lixi')
      .setLabel('🧧 Giật Lì Xì')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(btn);

    const replyMsg = await interaction.reply({ embeds: [lixiEmbed], components: [row], fetchReply: true });

    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000 
    });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.customId === 'claim_lixi') {
        const claimerId = btnInteraction.user.id;

        if (claimedUsers.has(claimerId)) {
          return btnInteraction.reply({ content: '❌ Bạn đã giật lì xì này rồi!', ephemeral: true });
        }

        if (remainingSlots <= 0 || remainingMoney <= 0) {
          return btnInteraction.reply({ content: '💸 Lì xì này đã hết mất rồi!', ephemeral: true });
        }

        let claimAmount;
        if (remainingSlots === 1) {
          claimAmount = remainingMoney;
        } else {
          const maxAmount = Math.floor((remainingMoney / remainingSlots) * 2);
          claimAmount = Math.floor(Math.random() * (maxAmount - 1)) + 1;
        }

        remainingMoney -= claimAmount;
        remainingSlots -= 1;
        claimedUsers.add(claimerId);

        await getUser(claimerId);
        await updateBalance(claimerId, claimAmount);

        await btnInteraction.reply({
          content: `🎉 Bạn giật được **+${claimAmount.toLocaleString()}** xu từ lì xì của <@${userId}>!`,
          ephemeral: true
        });

        if (remainingSlots === 0) {
          collector.stop('FULL');
        }
      }
    });

    collector.on('end', () => {
      const disabledBtn = new ButtonBuilder()
        .setCustomId('claim_lixi')
        .setLabel('🧧 Lì Xì Đã Hết')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const endRow = new ActionRowBuilder().addComponents(disabledBtn);

      lixiEmbed.setDescription(
        `🧧 **LÌ XÌ ĐÃ KẾT THÚC** 🧧\n` +
        `Người phát: <@${userId}>\n` +
        `💰 **Tổng xu:** ${totalMoney.toLocaleString()}\n` +
        `👥 **Đã nhận:** ${claimedUsers.size}/${totalSlots}`
      );

      interaction.editReply({ embeds: [lixiEmbed], components: [endRow] }).catch(() => {});
    });
  }
});

// 7. Đăng nhập Bot
client.login(process.env.DISCORD_TOKEN);
