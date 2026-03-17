# ⚔️ STICKER BATTLE ROYALE — O'rnatish Qo'llanmasi

## 📁 Fayl Strukturasi

```
loyiha/
├── server.js          ← Node.js server (shu faylni deploy qiling)
├── package.json       ← Kutubxonalar
├── .env               ← Maxfiy kalitlar (GitHub ga YUKLAMANG!)
└── public/
    └── index.html     ← O'yin sahifasi
```

> ⚠️ `index.html` ni `public/` papkasiga ko'chiring!

---

## 1️⃣ YouTube Data API Kaliti Olish (BEPUL)

1. https://console.cloud.google.com ga kiring
2. Yangi loyiha yarating: **"Sticker Battle"**
3. **APIs & Services → Enable APIs** → `YouTube Data API v3` ni yoqing
4. **Credentials → Create Credentials → API Key** bosing
5. Kalit nusxalab oling → `.env` ga qo'ying

---

## 2️⃣ .env Fayli Yaratish

Loyiha papkasida `.env` fayl yarating:

```env
YT_API_KEY=AIzaSy...bu_yerga_kalitingiz
LIVE_VIDEO_ID=dQw4w9WgXcQ
PORT=3000
POLL_MS=4000
```

**Video ID qayerdan topaman?**
YouTube jonli efir boshlaganingizda URL shunday ko'rinadi:
`https://youtube.com/live/dQw4w9WgXcQ` → ID: `dQw4w9WgXcQ`

---

## 3️⃣ Railway.app da Bepul Deploy (TAVSIYA)

### A) GitHub orqali:
1. https://github.com ga kiring → yangi repository yarating
2. Barcha fayllarni upload qiling (`public/` papkasi bilan)
3. https://railway.app ga kiring → **"New Project → Deploy from GitHub"**
4. Repository tanlang → **Variables** bo'limida `.env` qiymatlarini kiriting:
   - `YT_API_KEY` = sizning kalit
   - `LIVE_VIDEO_ID` = video ID
5. Deploy tugmachasini bosing ✅

### B) URL olish:
Deploy tugagach Railway sizga URL beradi:
`https://sticker-battle-xxxx.railway.app`

---

## 4️⃣ OBS da Sozlash

1. OBS ni oching
2. **Sources → Browser Source** qo'shing
3. URL ga servering manzilini kiriting:
   `https://sticker-battle-xxxx.railway.app`
4. Kenglik: **1920**, Balandlik: **1080**
5. ✅ Tayyor! O'yin avtomatik boshlanadi

---

## 5️⃣ YouTube Jonli Efir Boshlash

1. YouTube Studio → **Go Live**
2. Stream dasturi sifatida OBS tanlang
3. Jonli efir boshlang
4. **Video ID** ni `.env` ga qo'ying va serverni qayta ishga tushiring

---

## ❓ Tez-tez So'raladigan Savollar

**Q: YouTube bloklaydimi?**
A: Yo'q. Bu to'liq qonuniy — siz OBS orqali stream qilasiz, tomoshabinlar izohlaydi. Bu oddiy interaktiv o'yin.

**Q: Chat izohlar qachon o'yinga kiradi?**
A: Har 4 soniyada YouTube API yangilanadi. Oz kechikish bo'lishi normal.

**Q: Bepul tarif qancha vaqt ishlaydi?**
A: Railway bepul tifikada oyiga $5 kredit beradi (kichik loyihalar uchun yetarli).

**Q: Video ID o'zgarsa nima qilish kerak?**
A: Railway → Variables → `LIVE_VIDEO_ID` ni yangi ID ga o'zgartiring → **Redeploy**.

---

## 🛡️ YouTube dan Blok Bo'lmaslik Maslahatlari

✅ **Qiling:**
- Har kuni ma'lum vaqtda efir bering (masalan, har kuni soat 20:00)
- Efir boshlashdan oldin tomoshabinlarni xabardor qiling
- Turli xil o'yinlar o'ynating (har efirda yangi format)
- Izohlarga javob bering (ba'zida)

❌ **Qilmang:**
- 24/7 uzluksiz stream qilmang (YouTube shubhalanadi)
- Bir xil loop video o'ynamang
- Bot izohlar yaratmang

---

## 📞 Muammo Bo'lsa

Server loglarini ko'rish: Railway → **Deployments → View Logs**

Health check: `https://sizning-url.railway.app/health`
