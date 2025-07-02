require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { Manager } = require("erela.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const prefix = process.env.PREFIX || "thh!";

client.manager = new Manager({
  nodes: [
    {
      host: process.env.LAVALINK_HOST,
      port: parseInt(process.env.LAVALINK_PORT),
      password: process.env.LAVALINK_PASSWORD,
      secure: process.env.LAVALINK_SECURE === "true"
    }
  ],
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

client.on("ready", () => {
  console.log(`Bot is online as ${client.user.tag}`);
  client.manager.init(client.user.id);
});

client.on("raw", (d) => client.manager.updateVoiceState(d));

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot || !message.content.startsWith(prefix)) return;

  const [cmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const voiceChannel = message.member.voice.channel;

  if (["play", "p"].includes(cmd)) {
    if (!voiceChannel) return message.reply("Join a voice channel first!");
    let player = client.manager.players.get(message.guild.id);
    if (!player) {
      player = client.manager.create({
        guild: message.guild.id,
        voiceChannel: voiceChannel.id,
        textChannel: message.channel.id,
        selfDeafen: true
      });
      player.connect();
    }
    const search = args.join(" ");
    if (!search) return message.reply("Provide a song name or link.");
    const res = await client.manager.search(search, message.author);
    if (res.loadType === "NO_MATCHES") return message.reply("No results.");
    player.queue.add(res.tracks[0]);
    if (!player.playing && !player.paused) player.play();
    message.reply(`🎶 Queued: **${res.tracks[0].title}**`);
  }

  if (cmd === "skip") {
    const player = client.manager.players.get(message.guild.id);
    if (!player) return message.reply("Nothing is playing.");
    player.stop();
    message.reply("⏭️ Skipped.");
  }

  if (cmd === "pause") {
    const player = client.manager.players.get(message.guild.id);
    if (!player || player.paused) return message.reply("Nothing to pause.");
    player.pause(true);
    message.reply("⏸️ Paused.");
  }

  if (cmd === "resume") {
    const player = client.manager.players.get(message.guild.id);
    if (!player || !player.paused) return message.reply("Nothing to resume.");
    player.pause(false);
    message.reply("▶️ Resumed.");
  }

  if (cmd === "leave") {
    const player = client.manager.players.get(message.guild.id);
    if (!player) return message.reply("Bot is not in a voice channel.");
    player.destroy();
    message.reply("👋 Left the channel and cleared queue.");
  }

  if (cmd === "queue") {
    const player = client.manager.players.get(message.guild.id);
    if (!player || !player.queue.length) return message.reply("The queue is empty.");
    const queue = player.queue.map((track, i) => `${i + 1}. ${track.title}`).join("\n");
    message.reply(`🎵 **Queue:**\n${queue}`);
  }

  if (cmd === "help") {
    message.reply(`🎧 **Music Commands**:
\`${prefix}play <song>\` - Play music
\`${prefix}skip\` - Skip current song
\`${prefix}pause\` - Pause
\`${prefix}resume\` - Resume
\`${prefix}leave\` - Leave VC
\`${prefix}queue\` - Show queue`);
  }
});

client.login(process.env.TOKEN);
