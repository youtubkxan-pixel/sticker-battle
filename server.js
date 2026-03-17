/**
 * STICKER BATTLE ROYALE — Auto Live Server
 * Kanal handle dan avtomatik jonli efirni topadi
 * Har efirda hech narsa qilish shart emas!
 */
'use strict';

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const PORT           = process.env.PORT || 3000;
// Kanal handle — o'zgarmaydi
const CHANNEL_HANDLE = process.env.CHANNEL_HANDLE || 'Sticker_Battle_LIVE';
// Qancha vaqtda kanal tekshirilsin (millisekund)
const CHECK_INTERVAL = 60 * 1000; // 60 soniya

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
let isConnected   = false;
let currentVideoId = null;
let seenIds       = new Set();
let totalSent     = 0;
let Innertube     = null;
let ytInstance    = null;
let checkTimer    = null;
let chatInstance  = null;

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
    console.error('[YouTube] youtubei.js yuklanmadi:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════
   KANALDAN JONLI EFIRNI AVTOMATIK TOP
═══════════════════════════════════ */
async function findLiveStream() {
  try {
    const IT = await loadInnertube();
    if(!IT) return null;

    if(!ytInstance) {
      ytInstance = await IT.create();
    }

    console.log(`[YouTube] @${CHANNEL_HANDLE} kanalida jonli efir qidirilmoqda...`);

    // Kanal sahifasini olish
    const channel = await ytInstance.getChannel(`@${CHANNEL_HANDLE}`);
    
    // Live video qidirish
    // 1-usul: featured video
    if(channel?.current_video) {
      const v = channel.current_video;
      if(v?.id) {
        console.log(`[YouTube] Video topildi: ${v.id}`);
        return v.id;
      }
    }

    // 2-usul: search orqali
    const search = await ytInstance.search(`@${CHANNEL_HANDLE} live`, { type: 'video' });
    if(search?.videos?.length) {
      for(const v of search.videos) {
        if(v?.id && (v?.is_live || v?.upcoming === false)) {
          console.log(`[YouTube] Search orqali topildi: ${v.id}`);
          return v.id;
        }
      }
    }

    return null;
  } catch(e) {
    console.error('[YouTube] Kanal tekshirishda xato:', e.message);
    return null;
  }
}

/* ═══════════════════════════════════
   CHAT GA ULANISH
═══════════════════════════════════ */
async function startChat(videoId) {
  if(!videoId) return;
  if(currentVideoId === videoId && isConnected) return; // Allaqachon ulangan

  currentVideoId = videoId;
  console.log(`[YouTube] Chat ulanish: ${videoId}`);
  broadcast('yt_status', { status: 'CONNECTING' });

  try {
    const IT = await loadInnertube();
    if(!IT) { broadcast('yt_status',{status:'ERROR'}); return; }

    if(!ytInstance) ytInstance = await IT.create();
    
    const info = await ytInstance.getInfo(videoId);

    if(!info.livechat) {
      console.warn('[YouTube] Live chat topilmadi');
      broadcast('yt_status',{status:'NOT_LIVE'});
      isConnected = false;
      currentVideoId = null;
      return;
    }

    // Eski chatni to'xtatish
    if(chatInstance) {
      try { chatInstance.stop?.(); } catch(e){}
      chatInstance = null;
    }

    chatInstance = info.livechat;
    isConnected  = true;
    broadcast('yt_status',{status:'CONNECTED'});
    console.log(`[YouTube] ✅ Chat ulandi! Video: ${videoId}`);

    chatInstance.on('chat-update', (action) => {
      try { handleAction(action); } catch(e){}
    });
    chatInstance.on('error', (err) => {
      console.error('[YouTube] Chat xato:', err.message);
      isConnected    = false;
      currentVideoId = null;
      chatInstance   = null;
      broadcast('yt_status',{status:'ERROR'});
    });
    chatInstance.on('end', () => {
      console.log('[YouTube] Efir tugadi');
      isConnected    = false;
      currentVideoId = null;
      chatInstance   = null;
      broadcast('yt_status',{status:'STREAM_ENDED'});
    });

    await chatInstance.start();

  } catch(err) {
    console.error('[YouTube] Ulanish xatosi:', err.message);
    isConnected    = false;
    currentVideoId = null;
    chatInstance   = null;
    broadcast('yt_status',{status:'ERROR'});
  }
}

/* ═══════════════════════════════════
   AVTOMATIK TEKSHIRISH LOOP
   Har 60 soniyada kanal tekshiriladi
   Jonli efir boshlansa — o'zi ulanadi
═══════════════════════════════════ */
async function autoCheck() {
  if(!isConnected) {
    const videoId = await findLiveStream();
    if(videoId) {
      await startChat(videoId);
    } else {
      console.log('[YouTube] Hozir jonli efir yo\'q — 60s da qayta tekshiriladi');
      broadcast('yt_status',{status:'NOT_LIVE'});
    }
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

  // Super Sticker
  if(r.sticker) {
    const emoji = stickerToEmoji(r.sticker);
    if(emoji) sendVote(emoji, r.authorName?.simpleText || 'Viewer');
    return;
  }

  // Matn
  let text = '';
  if(r.message) {
    if(typeof r.message === 'string') text = r.message;
    else if(r.message.runs) text = r.message.runs.map(x=>x.text||(x.emoji?.emojiId||'')).join('');
    else if(r.message.simpleText) text = r.message.simpleText;
  }

  if(text) {
    const author = r.authorName?.simpleText || 'Viewer';
    sendVote(text, author);
  }
}

function sendVote(text, author) {
  totalSent++;
  const payload = { text, author };
  io.emit('vote',    payload);
  io.emit('chat',    payload);
  io.emit('comment', payload);
  if(totalSent % 50 === 0) console.log(`[Chat] ${totalSent} ovoz yuborildi`);
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
  console.log(`[Socket] +1 (jami: ${clients})`);
  socket.emit('yt_status', {
    status: isConnected ? 'CONNECTED' : 'NOT_LIVE',
    videoId: currentVideoId,
    totalSent
  });
  socket.on('disconnect', ()=>{ clients--; });
});

/* ═══════════════════════════════════
   START
═══════════════════════════════════ */
server.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   STICKER BATTLE ROYALE — AUTO SERVER   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📺 Kanal: @${CHANNEL_HANDLE}`);
  console.log(`  🔄 Har ${CHECK_INTERVAL/1000}s da avtomatik tekshiriladi\n`);

  // Darhol tekshir
  setTimeout(autoCheck, 2000);

  // Har 60 soniyada tekshir
  checkTimer = setInterval(autoCheck, CHECK_INTERVAL);
});

process.on('SIGTERM', ()=>{ clearInterval(checkTimer); server.close(()=>process.exit(0)); });
process.on('SIGINT',  ()=>{ clearInterval(checkTimer); server.close(()=>process.exit(0)); });
