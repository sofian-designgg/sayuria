require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');

// Variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGO_URL = process.env.MONGO_URL;
const CHANNEL_IDS = process.env.CHANNEL_IDS
  ? process.env.CHANNEL_IDS.split(',').map((id) => id.trim())
  : null;

if (!DISCORD_TOKEN || !GEMINI_API_KEY) {
  console.error(
    '❌ Configure .env avec DISCORD_TOKEN et GEMINI_API_KEY (voir .env.example)'
  );
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// Historique en mémoire (fallback si pas de MongoDB)
const conversationHistory = new Map();
const MAX_HISTORY = 10;

async function getHistoryForChannel(channelId) {
  if (MONGO_URL && db.getHistory) {
    return db.getHistory(channelId);
  }
  return conversationHistory.get(channelId) || [];
}

async function setHistoryForChannel(channelId, history) {
  if (MONGO_URL && db.saveHistory) {
    await db.saveHistory(channelId, history);
  } else {
    conversationHistory.set(channelId, history);
  }
}

function getSystemPrompt() {
  return `Tu es Sayuri, une assistante amicale et utile sur un serveur Discord nommé Sayurio.
Tu réponds en français, de façon naturelle et concise.
Tu peux être un peu fun et bienveillante. Évite les réponses trop longues (Discord a une limite de 2000 caractères).`;
}

async function getAIResponse(userMessage, history = []) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: getSystemPrompt(),
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  });
  const geminiHistory = history.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userMessage);
  const response = result.response;

  if (!response || !response.text) return "Désolée, je n'ai pas pu répondre.";
  return response.text().trim();
}

client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  client.user.setActivity('Sayurio | Pose-moi une question !', { type: 4 }); // ActivityType.Custom
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isMention = message.mentions.has(client.user);
  const isReply = message.reference?.messageId;
  const mentionedOrReplied = isMention || (isReply && (await message.channel.messages.fetch(message.reference.messageId))?.author?.id === client.user.id);

  if (!mentionedOrReplied) return;

  // Optionnel : limiter à certains salons
  if (CHANNEL_IDS && CHANNEL_IDS.length && !CHANNEL_IDS.includes(message.channel.id)) return;

  const channelId = message.channel.id;
  const userContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  if (!userContent) {
    await message.reply('Dis-moi quelque chose et je te répondrai ! 😊');
    return;
  }

  await message.channel.sendTyping();

  try {
    let history = await getHistoryForChannel(channelId);
    const reply = await getAIResponse(userContent, history);

    history.push({ role: 'user', content: userContent });
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY * 2) history = history.slice(-MAX_HISTORY * 2);
    await setHistoryForChannel(channelId, history);

    const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    console.error(err);
    const errorMsg =
      err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED')
        ? 'Le quota API Gemini est dépassé. Réessaie plus tard.'
        : 'Une erreur est survenue. Réessaie plus tard.';
    await message.reply(`❌ ${errorMsg}`).catch(() => {});
  }
});

async function start() {
  if (MONGO_URL) {
    try {
      await db.connectDB(MONGO_URL);
    } catch (err) {
      console.warn('⚠️ MongoDB non connecté, historique en mémoire uniquement:', err.message);
    }
  }
  await client.login(DISCORD_TOKEN);
}

start().catch((err) => {
  console.error('Erreur de connexion Discord:', err.message);
  process.exit(1);
});
