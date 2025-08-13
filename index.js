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

// Track daily create attempts per user
let createAttempts = new Map();
let lastResetDate = new Date().toDateString();

// Reset create attempts daily
function resetCreateAttemptsIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    createAttempts.clear();
    lastResetDate = today;
  }
}


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

const LETTER_PATTERNS = {
  B: [0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 19, 20, 21, 22, 23, 24],
  I: [0, 1, 2, 3, 4, 7, 12, 17, 20, 21, 22, 23, 24],
  N: [0, 4, 5, 6, 9, 10, 12, 14, 15, 18, 19, 20, 24],
  G: [0, 1, 2, 3, 4, 5, 10, 13, 14, 15, 19, 20, 21, 22, 23, 24],
  O: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]
};

// Generate a 5x5 Bingo card with FREE space at center
function generateCard() {
  const columns = [];
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const nums = [];
    while (nums.length < 5) {
      const n = Math.floor(Math.random() * (max - min + 1)) + min;
      if (!nums.includes(n)) nums.push(n);
    }
    columns.push(nums);
  }

  const card = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      card.push(row === 2 && col === 2 ? null : columns[col][row]);
    }
  }

  return card;
}

// Draw the Bingo card to PNG using PureImage
function drawCard(numbers = [], marked = []) {
  const width = 350, height = 420;
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
      const text = num !== undefined ? num.toString().padStart(2, "0") : "?";
      ctx.fillStyle = marked.includes(num) ? "#e91e63" : "#333";
      ctx.fillText(text, x + 10, y + 25);
    }

    ctx.strokeStyle = "#ffb6c1";
    ctx.strokeRect(x, y, 40, 40);
  }

  return new Promise((resolve, reject) => {
    const tmpPath = `card-${Date.now()}.png`;
    const stream = fs.createWriteStream(tmpPath);
    PImage.encodePNGToStream(img, stream)
      .then(() => {
        const buffer = fs.readFileSync(tmpPath);
        fs.unlinkSync(tmpPath);
        resolve(buffer);
      })
      .catch(reject);
  });
}

// Check if a card meets a specific pattern mode
function checkPattern(card, marked, mode) {
  const isMarked = (n) => n === null || marked.includes(n);

  if (mode === "line") {
    for (let i = 0; i < 5; i++) {
      const row = card.slice(i * 5, i * 5 + 5);
      if (row.every(isMarked)) return true;
    }
  }

  else if (mode === "vertical") {
    for (let col = 0; col < 5; col++) {
      let allMarked = true;
      for (let row = 0; row < 5; row++) {
        const index = row * 5 + col;
        if (!isMarked(card[index])) {
          allMarked = false;
          break;
        }
      }
      if (allMarked) return true;
    }
  }

  else if (mode === "diagonal") {
    const diag1 = [0, 6, 12, 18, 24];
    const diag2 = [4, 8, 12, 16, 20];
    if (diag1.every(i => isMarked(card[i])) || diag2.every(i => isMarked(card[i]))) return true;
  }

  else if (mode === "block") {
    return card.every(isMarked);
  }

  else if (mode === "corners") {
    const cornerIndexes = [0, 4, 20, 24];
    return cornerIndexes.every(i => isMarked(card[i]));
  }

  else if (["B", "I", "N", "G", "O"].includes(mode)) {
    return LETTER_PATTERNS[mode].every(i => isMarked(card[i]));
  }

  return false;
}


client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();
  const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

  if (content === "!bn help") {
  return message.channel.send(`📋 **Bingo Commands:**
  > 🎮 **Game Commands**
  • \`!bn create\` – Start a new game *(admin only)*
  • \`!bn join\` – Join the game
  • \`!bn mark <number>\` – Mark a called number
  • \`bingo!\` – Declare Bingo if you completed the pattern
  • \`!bn stop\` – Stop the current game *(admin only)*
  
  > 🎯 **Pattern Mode Commands**
  • \`!bn mode line\` – Horizontal line
  • \`!bn mode vertical\` – Vertical line
  • \`!bn mode diagonal\` – Diagonal
  • \`!bn mode corners\` – Four corners
  • \`!bn mode block\` – Full blackout
  • \`!bn mode B/I/N/G/O\` – Letter-shaped pattern (e.g., \`!bn mode B\`)
  
  🔤 **Note:** Letter patterns follow a 5x5 grid shape forming the letter visually.`);
  }

  if (content === "!bn create") {
  // For members: limit to 3 per day
  if (!isAdmin) {
    const attempts = createAttempts.get(message.author.id) || 0;
    if (attempts >= 3) {
      return message.channel.send(`🚫 You've reached your **3 game creation limit** for today.`);
    }
    createAttempts.set(message.author.id, attempts + 1);
    const remaining = 3 - (attempts + 1);
    message.channel.send(`✅ Game creation attempt **${attempts + 1}/3** for today. ${remaining > 0 ? `You have **${remaining}** left.` : "That was your last one!"}`);
  }

  if (currentGame.active) return message.channel.send("⛔ A game is already running.");

  currentGame.active = true;
  currentGame.calledNumbers = [];
  players = new Map();
  message.channel.send(`🎲 Bingo game started by **${message.author.username}**! Type \`!bn join\` to join. Game starts in 1 minute.`);

  setTimeout(() => {
    if (players.size === 0) {
      message.channel.send("⚠️ No players joined. Game cancelled.");
      currentGame.active = false;
      return;
    }

    currentGame.interval = setInterval(() => {
      if (currentGame.calledNumbers.length >= 75) {
        clearInterval(currentGame.interval);
        message.channel.send("❗ All 75 balls have been called. You can still call \`bingo!\`.");
        return;
      }

      let n;
      do {
        n = Math.floor(Math.random() * 75) + 1;
      } while (currentGame.calledNumbers.includes(n));

      currentGame.calledNumbers.push(n);
      message.channel.send(`🎱 **Number called: ${n}**`);

      let delay = 0;
      for (const [id] of players) {
        setTimeout(() => {
          client.users.send(id, {
            content: `🎱 Number **${n}** has been called!`,
          }).catch(console.error);
        }, delay);
        delay += 1000;
      }
    }, 20000);
  }, 60000);
}


  if (content === "!bn stop") {
    if (!isAdmin) return message.channel.send("🚫 You don’t have permission to stop the game.");
    if (!currentGame.active) return message.channel.send("⚠️ No game is currently active.");
    clearInterval(currentGame.interval);
    currentGame.active = false;
    players = new Map();
    message.channel.send("🚓 Game has been stopped manually.");
  }

  if (content === "!bn join") {
    if (!currentGame.active) return message.channel.send("🎮 No active game. Use `!bn create` first.");
    if (players.has(message.author.id)) return message.channel.send("🎮 You already joined!");

    const card = generateCard();
    players.set(message.author.id, { card, marked: [], cooldown: 0 });

    drawCard(card).then((buffer) => {
      const attachment = new AttachmentBuilder(buffer, { name: "card.png" });
      message.author.send({
        content: "🎴 Here is your Bingo card!",
        files: [attachment],
      }).catch(() => {
        message.channel.send(`❗ Couldn't DM ${message.author}. Please enable DMs.`);
      });
    });

    message.channel.send(`${message.author.username} has joined the game.`);
  }

  if (content.startsWith("!bn mode")) {
    if (!isAdmin) return message.channel.send("🚫 You don’t have permission to change the game mode.");
    if (!currentGame.active) return message.channel.send("⛔ Start a game first.");
    const mode = content.split(" ")[2];
    if (mode !== "line" 
        && mode !== "block" 
        && mode !== "vertical" 
        && mode !== "diagonal" 
        && mode !== "corners" 
        && mode !== "B" 
        && mode !== "I" 
        && mode !== "N" 
        && mode !== "G" 
        && mode !== "O") return message.channel.send("❗ Invalid mode. Use `line` or `block`.");
    currentGame.mode = mode;
    message.channel.send(`🔁 Game mode set to **${mode}**.`);
  }

  if (content.startsWith("!bn players")) {
  if (!currentGame.active) {
    return message.channel.send("⚠️ No active game. Use `!bn create` to start one.");
  }

  if (players.size === 0) {
    return message.channel.send("📭 No players have joined the game yet.");
  }

  const playerList = [...players.keys()]
    .map(id => {
      const user = client.users.cache.get(id);
      return user ? `• ${user.username}` : `• Unknown (${id})`;
    })
    .join("\n");

  message.channel.send(`👥 **Players in Game (${players.size}):**\n${playerList}`);
}

  if (content.startsWith("!bn mark")) {
    const args = content.split(" ");
    if (args.length !== 3 || isNaN(args[2])) {
      return message.channel.send("❗ Usage: `!bn mark <number>` (e.g. `!bn mark 27`)");
    }
    const numToMark = parseInt(args[2]);
    const player = players.get(message.author.id);
    if (!player) return message.channel.send("🙅 You're not in the game.");
    if (!currentGame.calledNumbers.includes(numToMark)) return message.channel.send(`❌ Number ${numToMark} hasn't been called yet.`);
    if (!player.card.includes(numToMark)) return message.channel.send(`❌ Number ${numToMark} is not on your card.`);
    if (player.marked.includes(numToMark)) return message.channel.send(`⚠️ Number ${numToMark} is already marked.`);

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
						   
  if (!message.guild) {
						
    return message.channel.send("❌ You can't call `bingo!` in DMs. Use it in the server channel.");
																	 
										  
								 
																										  
			
								   
																		
	 
  }
   

  const now = Date.now();
  const player = players.get(message.author.id);
  if (!player) return;
  if (now < (player.cooldown || 0)) return message.channel.send("🕒 You're on cooldown. Try again soon.");
  if (checkPattern(player.card, player.marked, currentGame.mode)) {
    clearInterval(currentGame.interval);
    currentGame.active = false;
    message.channel.send(`🎉 ${message.author.username} wins BINGO in **${currentGame.mode}** mode!`);
  } else {
    player.cooldown = now + 5000;
    message.channel.send("❌ Incorrect Bingo! 5s cooldown applied.");
  }
}
});

client.login(TOKEN);
