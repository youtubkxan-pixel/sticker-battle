const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const YT_API_KEY = process.env.YT_API_KEY || '';
const LIVE_VIDEO_ID = process.env.LIVE_VIDEO_ID || '';

// Statik fayllar — index.html ni topadi
app.get('/', (req, res) => {
  const files = ['index.html', 'index (1).html'];
  for (const f of files) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.send('<h1>index.html topilmadi</h1>');
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// YouTube Chat polling
let liveChatId = null;
let nextPageToken = null;

async function getLiveChatId() {
  if (!YT_API_KEY || !LIVE_VIDEO_ID) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${LIVE_VIDEO_ID}&key=${YT_API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    return d.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
  } catch(e) { return null; }
}

async function pollChat() {
  if (!liveChatId) return;
  try {
    let url = `https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&liveChatId=${liveChatId}&maxResults=200&key=${YT_API_KEY}`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;
    const r = await fetch(url);
    const d = await r.json();
    nextPageToken = d.nextPageToken;
    for (const msg of d.items || []) {
      const text = msg.snippet?.displayMessage || '';
      const emoji = extractEmoji(text);
      if (emoji) io.emit('vote', { emoji, text });
    }
    setTimeout(pollChat, Math.max(d.pollingIntervalMillis || 4000, 4000));
  } catch(e) {
    setTimeout(pollChat, 8000);
  }
}

function extractEmoji(text) {
  for (const ch of [...text]) {
    const cp = ch.codePointAt(0);
    if (cp > 127 && (cp >= 0x1F300 || (cp >= 0x2600 && cp <= 0x27BF))) return ch;
  }
  return null;
}

async function start() {
  if (YT_API_KEY && LIVE_VIDEO_ID) {
    liveChatId = await getLiveChatId();
    if (liveChatId) pollChat();
  }
}

io.on('connection', (socket) => {
  console.log('Yangi ulanish');
});

server.listen(PORT, () => {
  console.log(`Server ishga tushdi: ${PORT}`);
  start();
});

process.on('uncaughtException', (e) => console.error('Xato:', e.message));
process.on('unhandledRejection', (e) => console.error('Xato:', e));
