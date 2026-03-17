/**
 * ╔══════════════════════════════════════════════════════╗
 * ║    STICKER BATTLE ROYALE — YouTube Live Server      ║
 * ║    Faqat emoji/stiker ovozlarini o'tkazadi          ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * SOZLASH:
 *   1. npm install
 *   2. .env faylini yarating: VIDEO_ID=<YouTube Live Video ID>
 *   3. node server.js
 */

'use strict';

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const PORT     = process.env.PORT || 3000;
const VIDEO_ID = process.env.VIDEO_ID || '';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ═══════════════════════════════════
   EMOJI DETECTOR
   Faqat emoji borligini tekshir
═══════════════════════════════════ */
function hasEmoji(text) {
  if(!text) return false;
  // Unicode emoji range tekshirish
  const emojiRanges = /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]/u;
  return emojiRanges.test(text);
}

/* ═══════════════════════════════════
   YOUTUBE LIVE CHAT
═══════════════════════════════════ */
let isConnected = false;
let seenIds     = new Set();
let totalSent   = 0;
let Innertube   = null;

async function loadInnertube() {
  if(Innertube) return Innertube;
  try {
    const mod = await import('youtubei.js');
    Innertube = mod.Innertube || mod.default?.Innertube || mod.default;
    return Innertube;
  } catch(e) {
    console.error('[YouTube] youtubei.js yuklanmadi:', e.message);
    return null;
  }
}

async function startChat(videoId) {
  if(!videoId) {
    console.warn('[YouTube] VIDEO_ID berilmagan!');
    broadcast('yt_status', { status: 'NO_VIDEO_ID' });
    return;
  }

  console.log(`[YouTube] Video: ${videoId} — ulanish...`);
  broadcast('yt_status', { status: 'CONNECTING' });

  try {
    const IT = await loadInnertube();
    if(!IT) { broadcast('yt_status',{status:'ERROR'}); return; }

    const yt   = await IT.create();
    const info = await yt.getInfo(videoId);

    if(!info.livechat) {
      console.warn('[YouTube] Live chat topilmadi — 30s da qayta urinadi');
      broadcast('yt_status',{status:'NOT_LIVE'});
      setTimeout(()=>startChat(videoId), 30000);
      return;
    }

    const chat = info.livechat;
    isConnected = true;
    broadcast('yt_status',{status:'CONNECTED'});
    console.log('[YouTube] ✅ Live chat ulandi!');

    chat.on('chat-update', (action) => {
      try { handleAction(action); } catch(e){}
    });
    chat.on('error', (err) => {
      console.error('[YouTube] Xato:', err.message);
      isConnected = false;
      broadcast('yt_status',{status:'ERROR'});
      setTimeout(()=>startChat(videoId), 10000);
    });
    chat.on('end', () => {
      isConnected = false;
      broadcast('yt_status',{status:'STREAM_ENDED'});
    });

    await chat.start();

  } catch(err) {
    console.error('[YouTube] Ulanish xatosi:', err.message);
    isConnected = false;
    broadcast('yt_status',{status:'ERROR'});
    setTimeout(()=>startChat(videoId), 15000);
  }
}

function handleAction(action) {
  const items = [];
  if(action?.addChatItemAction?.item) items.push(action.addChatItemAction.item);
  if(action?.addLiveChatTickerItemAction?.item) items.push(action.addLiveChatTickerItemAction.item);
  if(Array.isArray(action)) items.push(...action);
  items.forEach(processItem);
}

function processItem(item) {
  if(!item) return;
  const r = item.liveChatTextMessageRenderer
         || item.liveChatPaidMessageRenderer
         || item.liveChatMembershipItemRenderer
         || item.liveChatSuperStickerItemRenderer
         || item;
  if(!r) return;

  // Takroriy xabar filtri
  const id = r.id || r.clientId || (Math.random()*1e9).toString(36);
  if(seenIds.has(id)) return;
  seenIds.add(id);
  if(seenIds.size > 600) {
    const arr = [...seenIds];
    seenIds = new Set(arr.slice(arr.length - 200));
  }

  // Super Sticker → emoji sifatida yuborish
  if(r.sticker) {
    const emoji = stickerToEmoji(r.sticker);
    if(emoji) {
      sendVote(emoji, r.authorName?.simpleText || 'Viewer');
    }
    return;
  }

  // Matndan emoji ajratish
  let text = '';
  if(r.message) {
    if(typeof r.message === 'string') text = r.message;
    else if(r.message.runs) text = r.message.runs.map(x=>x.text||(x.emoji?.emojiId?x.emoji.emojiId:'')||'').join('');
    else if(r.message.simpleText) text = r.message.simpleText;
  }

  if(text && hasEmoji(text)) {
    const author = r.authorName?.simpleText || r.authorName || 'Viewer';
    sendVote(text, author);
  }
}

function sendVote(text, author) {
  totalSent++;
  const payload = { text, author };
  // Barcha event nomlarida yuborish
  io.emit('vote',    payload);
  io.emit('chat',    payload);
  io.emit('comment', payload);
  if(totalSent % 100 === 0) console.log(`[Chat] ${totalSent} ta ovoz yuborildi`);
}

function stickerToEmoji(sticker) {
  const id = (sticker?.stickerId || sticker?.id || '').toLowerCase();
  const map = {
    'fire':'🔥','star':'⭐','heart':'❤️','100':'💯','crown':'👑',
    'skull':'💀','ghost':'👻','robot':'🤖','alien':'👽','unicorn':'🦄',
    'dragon':'🐉','lion':'🦁','wolf':'🐺','rocket':'🚀','diamond':'💎',
  };
  for(const [k,v] of Object.entries(map)){
    if(id.includes(k)) return v;
  }
  return null;
}

function broadcast(event, data) {
  io.emit(event, data);
}

/* ═══════════════════════════════════
   SOCKET.IO
═══════════════════════════════════ */
let clients = 0;
io.on('connection', (socket) => {
  clients++;
  console.log(`[Socket] +1 client (jami: ${clients})`);
  socket.emit('yt_status', {
    status: isConnected ? 'CONNECTED' : 'CONNECTING',
    videoId: VIDEO_ID || null,
    totalSent
  });
  socket.on('disconnect', ()=>{ clients--; console.log(`[Socket] -1 client (jami: ${clients})`); });
});

/* ═══════════════════════════════════
   START
═══════════════════════════════════ */
server.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   STICKER BATTLE ROYALE SERVER v2   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📺 VIDEO_ID: ${VIDEO_ID || '⚠️  .env ga qo\'shing'}\n`);
  if(VIDEO_ID) setTimeout(()=>startChat(VIDEO_ID), 1500);
  else console.log('  👉 .env fayliga VIDEO_ID=<id> qo\'shing\n');
});

process.on('SIGTERM', ()=>server.close(()=>process.exit(0)));
process.on('SIGINT',  ()=>server.close(()=>process.exit(0)));
