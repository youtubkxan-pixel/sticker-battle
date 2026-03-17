/**
 * STICKER BATTLE ROYALE — Server v3
 */
'use strict';

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const PORT     = process.env.PORT || 3000;
const VIDEO_ID = process.env.VIDEO_ID || 'Gpbjl2rXy9s';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let isConnected = false;
let seenIds     = new Set();
let totalSent   = 0;

async function startChat(videoId) {
  console.log(`[YouTube] Ulanish: ${videoId}`);
  broadcast('yt_status', { status: 'CONNECTING' });

  try {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({
      cache: new Map(),
      generate_session_locally: true
    });

    const info = await yt.getInfo(videoId);

    if(!info?.livechat) {
      console.warn('[YouTube] Live chat topilmadi — 30s da qayta urinadi');
      broadcast('yt_status', { status: 'NOT_LIVE' });
      setTimeout(() => startChat(videoId), 30000);
      return;
    }

    const liveChat = info.livechat;

    liveChat.on('chat-update', (action) => {
      try {
        const actions = Array.isArray(action) ? action : [action];
        for(const act of actions) {
          const item = act?.addChatItemAction?.item || act?.item || act;
          if(item) processItem(item);
        }
      } catch(e) {}
    });

    liveChat.on('error', (err) => {
      console.error('[YouTube] Xato:', err?.message || err);
      isConnected = false;
      broadcast('yt_status', { status: 'ERROR' });
      setTimeout(() => startChat(videoId), 15000);
    });

    liveChat.on('end', () => {
      console.log('[YouTube] Efir tugadi');
      isConnected = false;
      broadcast('yt_status', { status: 'STREAM_ENDED' });
    });

    isConnected = true;
    broadcast('yt_status', { status: 'CONNECTED' });
    console.log('[YouTube] ✅ Chat ulandi!');

    await liveChat.start();

  } catch(err) {
    console.error('[YouTube] Xato:', err?.message || err);
    isConnected = false;
    broadcast('yt_status', { status: 'ERROR' });
    setTimeout(() => startChat(videoId), 15000);
  }
}

function processItem(item) {
  if(!item) return;
  const r = item.liveChatTextMessageRenderer
         || item.liveChatPaidMessageRenderer
         || item.liveChatMembershipItemRenderer
         || item.liveChatSuperStickerItemRenderer
         || item;
  if(!r) return;

  const id = r.id || r.clientId || String(Math.random());
  if(seenIds.has(id)) return;
  seenIds.add(id);
  if(seenIds.size > 500) {
    const arr = [...seenIds];
    seenIds = new Set(arr.slice(-200));
  }

  if(r.sticker) {
    const emoji = stickerToEmoji(r.sticker);
    if(emoji) { sendVote(emoji); return; }
  }

  let text = '';
  if(r.message) {
    if(typeof r.message === 'string') text = r.message;
    else if(r.message.runs) text = r.message.runs.map(x => x.text || (x.emoji?.emojiId || '')).join('');
    else if(r.message.simpleText) text = r.message.simpleText;
  }
  if(!text && r.rawMessage) text = r.rawMessage;
  if(!text && r.content) text = r.content;

  if(text) sendVote(text);
}

function sendVote(text) {
  totalSent++;
  const payload = { text };
  io.emit('vote',    payload);
  io.emit('chat',    payload);
  io.emit('comment', payload);
  if(totalSent <= 10 || totalSent % 50 === 0) {
    console.log(`[Chat] #${totalSent}: ${text.substring(0,30)}`);
  }
}

function stickerToEmoji(sticker) {
  const id = (sticker?.stickerId || sticker?.id || '').toLowerCase();
  const map = {
    'fire':'🔥','star':'⭐','heart':'❤️','100':'💯','crown':'👑',
    'skull':'💀','ghost':'👻','robot':'🤖','alien':'👽','unicorn':'🦄',
    'dragon':'🐉','lion':'🦁','wolf':'🐺','rocket':'🚀','diamond':'💎',
  };
  for(const [k,v] of Object.entries(map)) if(id.includes(k)) return v;
  return null;
}

function broadcast(event, data) { io.emit(event, data); }

io.on('connection', (socket) => {
  socket.emit('yt_status', { status: isConnected ? 'CONNECTED' : 'CONNECTING', totalSent });
});

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   STICKER BATTLE ROYALE v3          ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  🌐 Port: ${PORT}`);
  console.log(`  📺 Video: ${VIDEO_ID}\n`);
  setTimeout(() => startChat(VIDEO_ID), 2000);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
