/**
 * STICKER BATTLE ROYALE — Server
 * YouTube Live Chat API + Socket.IO
 * Bepul deploy: Railway.app yoki Render.com
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

/* ════════════════════════════════
   MUHIT O'ZGARUVCHILARI (.env)
   ════════════════════════════════ */
const PORT = process.env.PORT || 3000;
const YT_API_KEY = process.env.YT_API_KEY || '';        // YouTube Data API v3 key
const LIVE_VIDEO_ID = process.env.LIVE_VIDEO_ID || '';  // Jonli efir video ID
const POLL_MS = parseInt(process.env.POLL_MS || '4000'); // Har necha ms yangilash

/* ════════════════════════════════
   STATIK FAYLLAR
   index.html shu serverdan xizmat qiladi
   ════════════════════════════════ */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ════════════════════════════════
   YouTube Live Chat o'quvchi
   ════════════════════════════════ */
const youtube = google.youtube({ version: 'v3', auth: YT_API_KEY });

let liveChatId = null;
let nextPageToken = null;
let pollingActive = false;
let pollingTimer = null;

// Video ID dan liveChatId olish
async function getLiveChatId(videoId) {
  try {
    const res = await youtube.videos.list({
      part: ['liveStreamingDetails'],
      id: [videoId]
    });
    const items = res.data.items;
    if (!items || items.length === 0) {
      console.error('❌ Video topilmadi:', videoId);
      return null;
    }
    const chatId = items[0]?.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) {
      console.error('❌ Jonli efir topilmadi. Stream boshlangan bo\'lishi kerak!');
      return null;
    }
    console.log('✅ Live Chat ID:', chatId);
    return chatId;
  } catch (err) {
    console.error('❌ getLiveChatId xatosi:', err.message);
    return null;
  }
}

// Izohlarni o'qish va ovozlarni yuborish
async function pollChat() {
  if (!liveChatId || !pollingActive) return;

  try {
    const params = {
      part: ['snippet', 'authorDetails'],
      liveChatId: liveChatId,
      maxResults: 200
    };
    if (nextPageToken) params.pageToken = nextPageToken;

    const res = await youtube.liveChatMessages.list(params);
    const data = res.data;

    nextPageToken = data.nextPageToken;

    const messages = data.items || [];
    let voteCount = 0;

    for (const msg of messages) {
      const text = msg.snippet?.displayMessage || '';
      const author = msg.authorDetails?.displayName || 'Noma\'lum';

      if (!text.trim()) continue;

      // Emoji topish — har qanday emoji ovoz sifatida qabul qilinadi
      const emoji = extractFirstEmoji(text);
      if (emoji) {
        io.emit('vote', {
          emoji: emoji,
          text: text,
          author: author
        });
        voteCount++;
      }
    }

    if (voteCount > 0) {
      console.log(`📨 ${voteCount} ta ovoz yuborildi`);
    }

    // Tomoshabinlar sonini yuborish
    try {
      const statsRes = await youtube.videos.list({
        part: ['liveStreamingDetails'],
        id: [LIVE_VIDEO_ID]
      });
      const concurrent = statsRes.data.items?.[0]?.liveStreamingDetails?.concurrentViewers;
      if (concurrent) io.emit('viewers', concurrent);
    } catch(_){}

    // Keyingi polling
    const delay = data.pollingIntervalMillis || POLL_MS;
    pollingTimer = setTimeout(pollChat, Math.max(delay, POLL_MS));

  } catch (err) {
    console.error('⚠️ pollChat xatosi:', err.message);
    // Xato bo'lsa ham davom etish
    pollingTimer = setTimeout(pollChat, POLL_MS * 2);
  }
}

// Polling boshlash
async function startPolling() {
  if (!YT_API_KEY) {
    console.warn('⚠️ YT_API_KEY yo\'q — chat o\'qilmaydi. .env faylini tekshiring!');
    return;
  }
  if (!LIVE_VIDEO_ID) {
    console.warn('⚠️ LIVE_VIDEO_ID yo\'q — .env faylida video ID ni kiriting!');
    return;
  }

  console.log('🔍 Live Chat ID qidirilmoqda...');
  liveChatId = await getLiveChatId(LIVE_VIDEO_ID);

  if (!liveChatId) {
    console.log('⏳ 30 soniyadan keyin qayta urinaman...');
    setTimeout(startPolling, 30000);
    return;
  }

  pollingActive = true;
  console.log('▶️  Chat polling boshlandi!');
  pollChat();
}

/* ════════════════════════════════
   EMOJI ANIQLASH
   ════════════════════════════════ */
function extractFirstEmoji(text) {
  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter([], { granularity: 'grapheme' })
    : null;

  const chars = segmenter
    ? [...segmenter.segment(text)].map(x => x.segment)
    : [...text];

  for (const ch of chars) {
    const cp = ch.codePointAt(0);
    if (!cp || cp <= 127) continue;
    if (cp >= 0x1F300 || (cp >= 0x2600 && cp <= 0x27BF) || cp === 0x263A || cp === 0x2639) {
      return ch;
    }
  }
  return null;
}

/* ════════════════════════════════
   SOCKET.IO ULANISHLAR
   ════════════════════════════════ */
let connectedClients = 0;

io.on('connection', (socket) => {
  connectedClients++;
  console.log(`🟢 Yangi ulanish | Jami: ${connectedClients}`);

  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`🔴 Uzildi | Jami: ${connectedClients}`);
  });
});

/* ════════════════════════════════
   HEALTH CHECK — Railway/Render uchun
   Bu endpoint serverning tirik ekanligini tasdiqlaydi
   ════════════════════════════════ */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    liveChatId: liveChatId ? 'connected' : 'disconnected',
    clients: connectedClients,
    polling: pollingActive,
    timestamp: new Date().toISOString()
  });
});

/* ════════════════════════════════
   SERVER ISHGA TUSHIRISH
   ════════════════════════════════ */
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   STICKER BATTLE ROYALE SERVER     ║
║   Port: ${PORT}                        ║
╚════════════════════════════════════╝
  `);
  startPolling();
});

// Kutilmagan xatolarni ushlab olish — server to'xtamasin
process.on('uncaughtException', (err) => {
  console.error('⚠️ Kutilmagan xato (server davom etadi):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled rejection (server davom etadi):', reason);
});
