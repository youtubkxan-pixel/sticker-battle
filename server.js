/**
 * STICKER BATTLE ROYALE — Server
 * Video ID ni o'zi topadi, hech narsa qilish shart emas!
 */
'use strict';

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const PORT = process.env.PORT || 3000;

// === VIDEO ID — har efirda shu qatorni yangilang ===
const VIDEO_ID = process.env.VIDEO_ID || 'FMUrZhYgh6Y';
// ===================================================

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ═══════════════════════════════════
   STATE
═══════════════════════════════════ */
let isConnected = false;
let seenIds     = new Set();
let totalSent   = 0;
let Innertube   = null;
let chatInst    = null;

/* ═══════════════════════════════════
   LOAD YOUTUBEI.JS
═══════════════════════════════════ */
async function loadInnertube() {
  if(Innertube) return Innertube;
  try {
    const mod = await import('youtubei.js');
    Innertube = mod.Innertube || mod.default?.Innertube || mod.default;
    return Innertube;
  } catch(e) {
    console.error('[YouTube] yuklanmadi:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════
   CHAT GA ULANISH
═══════════════════════════════════ */
async function startChat(videoId) {
  console.log(`[YouTube] Ulanish: ${videoId}`);
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

    chatInst    = info.livechat;
    isConnected = true;
    broadcast('yt_status',{status:'CONNECTED'});
    console.log('[YouTube] ✅ Chat ulandi!');

    chatInst.on('chat-update', (action) => {
      try { handleAction(action); } catch(e){}
    });
    chatInst.on('error', (err) => {
      console.error('[YouTube] Xato:', err.message);
      isConnected = false;
      broadcast('yt_status',{status:'ERROR'});
      setTimeout(()=>startChat(videoId), 10000);
    });
    chatInst.on('end', () => {
      console.log('[YouTube] Efir tugadi');
      isConnected = false;
      broadcast('yt_status',{status:'STREAM_ENDED'});
    });

    await chatInst.start();

  } catch(err) {
    console.error('[YouTube] Xato:', err.message);
    isConnected = false;
    broadcast('yt_status',{status:'ERROR'});
    setTimeout(()=>startChat(videoId), 15000);
  }
}

/* ═══════════════════════════════════
   CHAT HANDLER
═══════════════════════════════════ */
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

  const id = r.id || r.clientId || (Math.random()*1e9).toString(36);
  if(seenIds.has(id)) return;
  seenIds.add(id);
  if(seenIds.size > 600) {
    const arr = [...seenIds];
    seenIds = new Set(arr.slice(arr.length - 200));
  }

  if(r.sticker) {
    const emoji = stickerToEmoji(r.sticker);
    if(emoji) sendVote(emoji, r.authorName?.simpleText || 'Viewer');
    return;
  }

  let text = '';
  if(r.message) {
    if(typeof r.message === 'string') text = r.message;
    else if(r.message.runs) text = r.message.runs.map(x=>x.text||(x.emoji?.emojiId||'')).join('');
    else if(r.message.simpleText) text = r.message.simpleText;
  }
  if(text) sendVote(text, r.authorName?.simpleText || 'Viewer');
}

function sendVote(text, author) {
  totalSent++;
  const payload = { text, author };
  io.emit('vote',    payload);
  io.emit('chat',    payload);
  io.emit('comment', payload);
  if(totalSent % 50 === 0) console.log(`[Chat] ${totalSent} ovoz`);
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
  socket.emit('yt_status', {
    status: isConnected ? 'CONNECTED' : 'CONNECTING',
    totalSent
  });
  socket.on('disconnect', ()=>{ clients--; });
});

/* ═══════════════════════════════════
   START
═══════════════════════════════════ */
server.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   STICKER BATTLE ROYALE SERVER      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  🌐 Port: ${PORT}`);
  console.log(`  📺 Video ID: ${VIDEO_ID}\n`);
  setTimeout(()=>startChat(VIDEO_ID), 2000);
});

process.on('SIGTERM', ()=>server.close(()=>process.exit(0)));
process.on('SIGINT',  ()=>server.close(()=>process.exit(0)));
