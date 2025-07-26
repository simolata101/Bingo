const { Client, GatewayIntentBits, AttachmentBuilder, PermissionsBitField } = require("discord.js");
const express = require("express");
const PImage = require("pureimage");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"],
});

const TOKEN = process.env.TOKEN;

const app = express();
app.get("/", (req, res) => res.send("Bingo Bot is running"));
app.listen(3000, () => console.log("Uptime Robot running on port 3000"));

const fontPath = path.join(__dirname, "assets", "fonts", "DejaVuSans.ttf");
const font = PImage.registerFont(fontPath, "DejaVuSans");
font.loadSync();

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

let players = new Map();
let currentGame = {
  active: false,
  mode: "line",
  calledNumbers: [],
  interval: null,
};

function generateCard() {
  const card = [];

  // Define ranges for B I N G O
  const ranges = [
    [1, 15],    // B
    [16, 30],   // I
    [31, 45],   // N
    [46, 60],   // G
    [61, 75],   // O
  ];

  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const nums = [];

    // Get 5 unique random numbers in column's range
    while (nums.length < 5) {
      const n = Math.floor(Math.random() * (max - min + 1)) + min;
      if (!nums.includes(n)) nums.push(n);
    }

    // Place them in the column of the card
    for (let row = 0; row < 5; row++) {
      if (!card[row]) card[row] = [];
      card[row][col] = nums[row];
    }
  }

  // Set the middle cell to "FREE"
  card[2][2] = "FREE";

  return card;
}

function drawCard(numbers = [], marked = []) {
  const width = 350,
    height = 420;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");

  ctx.fillStyle = "#fff0f5";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ff69b4";
  ctx.font = "32pt DejaVuSans";
  const title = "★ B I N G O ★";
  const titleWidth = ctx.measureText(title).width;
  ctx.fillText(title, (width - titleWidth) / 2, 50);

  const letters = ["B", "I", "N", "G", "O"];
  ctx.font = "20pt DejaVuSans";
  ctx.fillStyle = "#222";
  for (let i = 0; i < 5; i++) {
    ctx.fillText(letters[i], i * 60 + 50, 80);
  }

  ctx.font = "18pt DejaVuSans";
  for (let i = 0; i < 25; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = col * 60 + 30;
    const y = row * 60 + 100;
    const num = numbers[i];

    if (row === 2 && col === 2) {
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(x, y, 40, 40);
      ctx.fillStyle = "#fff";
      ctx.fillText("FREE", x + 2, y + 25);
    } else {
      const txt = num !== undefined ? num.toString().padStart(2, "0") : "?";
      ctx.fillStyle = marked.includes(num) ? "#e91e63" : "#333";
      ctx.fillText(txt, x + 10, y + 25);
    }

    ctx.strokeStyle = "#ffb6c1";
    ctx.strokeRect(x, y, 40, 40);
  }

  return new Promise((resolve, reject) => {
    const tmpPath = "card.png";
    const stream = fs.createWriteStream(tmpPath);
    PImage.encodePNGToStream(img, stream)
      .then(() => resolve(fs.readFileSync(tmpPath)))
      .catch(reject);
  });
}

function checkPattern(card, marked, mode) {
  const isMarked = (n) => n === null || marked.includes(n);

  if (mode === "line") {
    for (let i = 0; i < 5; i++) {
      const row = card.slice(i * 5, i * 5 + 5);
      if (row.every(isMarked)) return true;
    }
  } else if (mode === "block") {
    return card.every(isMarked);
  }

  return false;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();

  const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

  if (content === "!bn help") {
    return message.channel.send(`📋 **Bingo Commands:**
!bn create – Start new game (admin only)
!bn join – Join the game
!bn mode line/block – Set pattern mode (admin only)
!bn mark <number> – Mark a called number
!bn stop – Stop the current game (admin only)
bingo! – Declare Bingo if you completed the pattern`);
  }

  if (content === "!bn create") {
    if (!isAdmin) return message.channel.send("🚫 You don’t have permission to start a Bingo game.");
    if (currentGame.active)
      return message.channel.send("⛔ A game is already running.");
    currentGame.active = true;
    currentGame.calledNumbers = [];
    players = new Map();
    message.channel.send(
      "🎲 Bingo game started! Type `!bn join` to join. Game starts in 15 seconds."
    );

    setTimeout(() => {
      if (players.size === 0) {
        message.channel.send("⚠️ No players joined. Game cancelled.");
        currentGame.active = false;
        return;
      }

      currentGame.interval = setInterval(() => {
        if (currentGame.calledNumbers.length >= 75) {
          clearInterval(currentGame.interval);
          message.channel.send("❗ All 75 balls have been called. No more numbers will be drawn, but you can still call `bingo!`.");
          return;
        }

        let n;
        do {
          n = Math.floor(Math.random() * 75) + 1;
        } while (currentGame.calledNumbers.includes(n));

        currentGame.calledNumbers.push(n);
        message.channel.send(`🎱 **Number called: ${n}**`);

        for (const [id, p] of players) {
          drawCard(p.card, p.marked).then((buffer) => {
            const attachment = new AttachmentBuilder(buffer, {
              name: "card.png",
            });
            client.users.send(id, {
              content: `Number ${n} called!`,
              files: [attachment],
            }).catch(console.error);
          });
        }
      }, 15000);
    }, 15000);
  }

  if (content === "!bn stop") {
    if (!isAdmin) return message.channel.send("🚫 You don’t have permission to stop the game.");
    if (!currentGame.active)
      return message.channel.send("⚠️ No game is currently active.");
    clearInterval(currentGame.interval);
    currentGame.active = false;
    players = new Map();
    message.channel.send("🚓 Game has been stopped manually.");
  }

  if (content === "!bn join") {
    if (!currentGame.active)
      return message.channel.send("🎮 No active game. Use `!bn create` first.");
    if (players.has(message.author.id))
      return message.channel.send("🎮 You already joined!");
    const card = generateCard();
    drawCard(card).then((buffer) => {
      const attachment = new AttachmentBuilder(buffer, { name: "card.png" });
      players.set(message.author.id, { card, marked: [], cooldown: 0 });
      message.author.send({
        content: "🎴 Here is your Bingo card!",
        files: [attachment],
      });
      message.channel.send(`${message.author.username} has joined the game.`);
    });
  }

  if (content.startsWith("!bn mode")) {
    if (!isAdmin) return message.channel.send("🚫 You don’t have permission to change the game mode.");
    if (!currentGame.active)
      return message.channel.send("⛔ Start a game first.");

    const mode = content.split(" ")[2];
    if (mode !== "line" && mode !== "block")
      return message.channel.send("❗ Invalid mode. Use `line` or `block`.");

    currentGame.mode = mode;
    message.channel.send(`🔁 Game mode set to **${mode}**.`);
  }

  if (content.startsWith("!bn mark")) {
    const args = content.split(" ");
    if (args.length !== 3 || isNaN(args[2])) {
      return message.channel.send("❗ Usage: `!bn mark <number>` (e.g. `!bn mark 27`)");
    }

    const numToMark = parseInt(args[2]);
    const player = players.get(message.author.id);
    if (!player) return message.channel.send("🙅 You're not in the game.");
    if (!currentGame.calledNumbers.includes(numToMark)) {
      return message.channel.send(`❌ Number ${numToMark} hasn't been called yet.`);
    }
    if (!player.card.includes(numToMark)) {
      return message.channel.send(`❌ Number ${numToMark} is not on your card.`);
    }
    if (player.marked.includes(numToMark)) {
      return message.channel.send(`⚠️ Number ${numToMark} is already marked.`);
    }

    player.marked.push(numToMark);
    message.channel.send(`✅ You have marked number ${numToMark}.`);
    drawCard(player.card, player.marked).then((buffer) => {
      const attachment = new AttachmentBuilder(buffer, { name: "card.png" });
      message.author.send({
        content: `🆕 Here's your updated card with ${numToMark} marked:`,
        files: [attachment],
      });
    });
  }

  if (content === "bingo!") {
    const now = Date.now();
    const player = players.get(message.author.id);
    if (!player) return;
    if (now < (player.cooldown || 0)) {
      return message.channel.send("🕒 You're on cooldown. Try again soon.");
    }
    if (checkPattern(player.card, player.marked, currentGame.mode)) {
      clearInterval(currentGame.interval);
      currentGame.active = false;
      message.channel.send(
        `🎉 ${message.author.username} wins BINGO in **${currentGame.mode}** mode!`
      );
    } else {
      player.cooldown = now + 5000;
      message.channel.send("❌ Incorrect Bingo! 5s cooldown applied.");
    }
  }
});

client.login(TOKEN);
