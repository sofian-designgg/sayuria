const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

const Conversation = mongoose.model('Conversation', conversationSchema);

const MAX_HISTORY = 10;

async function connectDB(mongoUrl) {
  if (!mongoUrl) return null;
  await mongoose.connect(mongoUrl);
  console.log('✅ MongoDB connecté');
  return true;
}

async function getHistory(channelId) {
  const doc = await Conversation.findOne({ channelId }).lean();
  if (!doc || !doc.messages?.length) return [];
  return doc.messages.slice(-MAX_HISTORY * 2).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

async function saveHistory(channelId, messages) {
  await Conversation.findOneAndUpdate(
    { channelId },
    { messages: messages.slice(-MAX_HISTORY * 2) },
    { upsert: true }
  );
}

module.exports = { connectDB, getHistory, saveHistory };
