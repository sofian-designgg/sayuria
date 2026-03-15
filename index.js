require('dotenv').config();
const { Client, GatewayIntentBits, Partials, AttachmentBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
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

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Mots-clés pour déclencher la génération d'image
const IMAGE_TRIGGERS = ['image', 'dessine', 'génère une image', 'genere une image', 'crée une image', 'cree une image', 'draw', 'img'];

function wantsImage(text) {
  const lower = text.toLowerCase().trim();
  for (const trigger of IMAGE_TRIGGERS) {
    if (lower === trigger || lower.startsWith(trigger + ' ') || lower.startsWith(trigger + ',')) return true;
  }
  return false;
}

function getImagePrompt(text) {
  const lower = text.toLowerCase().trim();
  for (const trigger of IMAGE_TRIGGERS) {
    if (lower.startsWith(trigger + ' ')) return text.slice(trigger.length).trim();
    if (lower.startsWith(trigger + ',')) return text.slice(trigger.length + 1).trim();
    if (lower === trigger) return '';
  }
  return text;
}

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
Tu peux être un peu fun et bienveillante. Évite les réponses trop longues (Discord a une limite de 2000 caractères).
Tu as accès à la recherche Google : utilise-la pour la météo, l'actualité, les infos en temps réel, ou tout ce qui nécessite des données à jour. Ne dis jamais que tu ne peux pas chercher sur le web.`;
}

// Outil Google Search pour infos en temps réel (météo, actualités, etc.)
const GROUNDING_TOOL = { googleSearch: {} };

async function getAIResponse(userMessage, history = []) {
  const geminiHistory = history.slice(-MAX_HISTORY).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const contents = [
    ...geminiHistory,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: getSystemPrompt(),
      tools: [GROUNDING_TOOL],
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  });

  let text = typeof response?.text === 'function' ? response.text() : response?.text;
  if (!text && response?.candidates?.[0]?.content?.parts?.length) {
    text = response.candidates[0].content.parts.map((p) => p.text).filter(Boolean).join('\n');
  }
  if (!text || !String(text).trim()) return "Désolée, je n'ai pas pu répondre.";
  return String(text).trim();
}

/** Génère une image via Gemini (Nano Banana) et retourne un Buffer ou null. */
async function generateImage(prompt) {
  const imagePrompt = (prompt && prompt.trim()) || 'Une scène agréable et colorée.';
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: imagePrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
    const candidates = response.candidates;
    if (!candidates?.length) return null;
    const parts = candidates[0].content?.parts;
    if (!parts?.length) return null;
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64');
      }
    }
    return null;
  } catch (err) {
    console.error('Erreur génération image:', err.message);
    return null;
  }
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
    // Génération d'image si la demande commence par image / dessine / etc.
    if (wantsImage(userContent)) {
      const imagePrompt = getImagePrompt(userContent);
      const imageBuffer = await generateImage(imagePrompt);
      if (imageBuffer && imageBuffer.length > 0) {
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'sayuri-image.png' });
        await message.reply({
          content: imagePrompt ? `Voici une image pour : *${imagePrompt.slice(0, 100)}${imagePrompt.length > 100 ? '…' : ''}*` : 'Voici une image pour toi.',
          files: [attachment],
        });
      } else {
        await message.reply("❌ Je n'ai pas pu générer l'image. Réessaie avec une autre description (ex. : `image un chat kawaii`).");
      }
      return;
    }

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
