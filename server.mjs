import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8787;
const MIN_CREDITS = parseInt(process.env.DECART_MIN_CREDITS || '40', 10);

// Xavfsizlik sozlamalari
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2kb' }));

// Kalitlar navbati va monitoringi
const primaryKey = process.env.DECART_API_KEY ? process.env.DECART_API_KEY.trim() : '';
const backupKeys = (process.env.DECART_API_KEYS_BACKUP || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const allKeys = [primaryKey, ...backupKeys].filter(Boolean);

const keySlots = allKeys.map(k => ({
  key: k,
  credits: 0,
  lastChecked: 0,
  isExhausted: false
}));

let activeSlotIndex = 0;

/**
 * Decart API dan kredit qoldig'ini tekshiradi (30s kesh)
 */
async function checkCredits(slotIndex) {
  const slot = keySlots[slotIndex];
  if (!slot || slot.isExhausted) return 0;

  const now = Date.now();
  if (slot.lastChecked && (now - slot.lastChecked < 30000)) {
    return slot.credits;
  }

  try {
    const res = await fetch('https://api.decart.ai/v1/credits', {
      headers: {
        'x-api-key': slot.key
      }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        slot.credits = 0;
        slot.isExhausted = true;
      }
      slot.lastChecked = now;
      return slot.credits;
    }

    const data = await res.json();
    slot.credits = typeof data.credits === 'number' ? data.credits : 0;
    slot.lastChecked = now;
    if (slot.credits < MIN_CREDITS) {
      slot.isExhausted = true;
    }
    return slot.credits;
  } catch (err) {
    console.error(`Slot #${slotIndex} kreditini tekshirishda xatolik:`, err.message);
    return slot.credits;
  }
}

/**
 * Faol va yetarli kreditga ega slotni topadi
 */
async function getActiveAvailableSlot() {
  if (keySlots.length === 0) return null;

  for (let i = 0; i < keySlots.length; i++) {
    const idx = (activeSlotIndex + i) % keySlots.length;
    const slot = keySlots[idx];
    if (slot.isExhausted) continue;

    const credits = await checkCredits(idx);
    if (credits >= MIN_CREDITS) {
      activeSlotIndex = idx;
      return { index: idx, slot };
    }
  }

  return null;
}

// ==================== API ROUTELAR ====================

/**
 * GET /api/status
 * Kalit bor-yo'qligi, aktiv slot, har slot krediti (kalitning o'zi chiqmaydi)
 */
app.get('/api/status', async (req, res) => {
  // Har bir slot holatini yangilash
  for (let i = 0; i < keySlots.length; i++) {
    await checkCredits(i);
  }

  const active = await getActiveAvailableSlot();

  res.json({
    hasKey: keySlots.length > 0,
    activeSlot: active ? active.index + 1 : null,
    totalSlots: keySlots.length,
    slots: keySlots.map((s, idx) => ({
      slot: idx + 1,
      credits: s.credits,
      isExhausted: s.isExhausted,
      isActive: active ? active.index === idx : false
    })),
    minCreditsRequired: MIN_CREDITS
  });
});

/**
 * POST /api/tokens
 * 300 s lik Decart client token generatsiyasi (Avtomatik navbat bilan barcha zaxira kalitlarga o'tish)
 */
app.post('/api/tokens', async (req, res) => {
  if (keySlots.length === 0) {
    return res.status(500).json({ error: 'Serverda Decart kalitlari sozlanmagan' });
  }

  // Barcha mavjud slotlarni aylanib chiqish
  for (let attempt = 0; attempt < keySlots.length; attempt++) {
    const slotIndex = (activeSlotIndex + attempt) % keySlots.length;
    const currentSlot = keySlots[slotIndex];

    if (currentSlot.isExhausted) continue;

    const credits = await checkCredits(slotIndex);
    if (credits < MIN_CREDITS) {
      currentSlot.isExhausted = true;
      console.warn(`[FAILOVER] Slot #${slotIndex + 1} da kredit yetarli emas (${credits}). Keyingisiga o'tilmoqda...`);
      continue;
    }

    try {
      const decartRes = await fetch('https://api.decart.ai/v1/client/tokens', {
        method: 'POST',
        headers: {
          'x-api-key': currentSlot.key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiresIn: 300,
          allowedModels: ['lucy-vton-latest', 'lucy-vton-3.6']
        })
      });

      if (!decartRes.ok) {
        const errText = await decartRes.text();
        console.warn(`[WARN] Slot #${slotIndex + 1} token xatosi (${decartRes.status}): ${errText}`);

        if (decartRes.status === 402 || decartRes.status === 401) {
          currentSlot.isExhausted = true;
          currentSlot.credits = 0;
          console.warn(`[FAILOVER] Slot #${slotIndex + 1} kredit tugadi. Keyingisiga o'tilmoqda...`);
          continue; // Keyingi slotga o'tish!
        }
        continue;
      }

      const tokenData = await decartRes.json();
      activeSlotIndex = slotIndex; // Muvaffaqiyatli slotni saqlash

      console.log(`[SUCCESS] Slot #${slotIndex + 1} dan token olindi (Qoldiq: ${currentSlot.credits} kredit)`);
      return res.json({
        token: tokenData.token || tokenData.apiKey,
        apiKey: tokenData.apiKey || tokenData.token,
        expiresAt: tokenData.expiresAt,
        slot: slotIndex + 1,
        credits: currentSlot.credits,
        totalSlots: keySlots.length
      });
    } catch (err) {
      console.error(`Slot #${slotIndex + 1} ulanish xatosi:`, err.message);
    }
  }

  // Barcha slotlar tekshirildi va tugagan
  return res.status(402).json({
    error: 'Barcha Decart kalitlarida kredit tugadi',
    code: 'insufficient_credits',
    totalSlots: keySlots.length
  });
});

/**
 * POST /api/key-exhausted
 * Klient "kredit tugadi" desa — slotni 0 qilib keyingisiga o'tadi
 */
app.post('/api/key-exhausted', (req, res) => {
  const { slot } = req.body || {};
  const slotIdx = typeof slot === 'number' ? slot - 1 : activeSlotIndex;

  if (keySlots[slotIdx]) {
    keySlots[slotIdx].isExhausted = true;
    keySlots[slotIdx].credits = 0;
    console.warn(`[WARN] Slot #${slotIdx + 1} kredit tugagan deb belgilandi.`);
  }

  // Keyingi slotga o'tishga harakat qilish
  activeSlotIndex = (activeSlotIndex + 1) % (keySlots.length || 1);

  res.json({
    success: true,
    message: 'Slot almashtirildi',
    nextSlot: activeSlotIndex + 1
  });
});

/**
 * GET /img?u=
 * CORS proksi, faqat https + ruxsat etilgan hostlar
 */
const ALLOWED_HOSTS = [
  'fra1.digitaloceanspaces.com',
  'cdn.kingsman.boutique'
];

app.get('/img', async (req, res) => {
  const targetUrl = req.query.u;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Parametr `u` kiritilishi shart');
  }

  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') {
      return res.status(403).send('Faqat https protokoli ruxsat etilgan');
    }

    const hostAllowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    if (!hostAllowed) {
      return res.status(403).send('Ushbu hostdan rasm yuklash taqiqlangan');
    }

    const imgRes = await fetch(targetUrl);
    if (!imgRes.ok) {
      return res.status(imgRes.status).send('Rasm yuklab olinmadi');
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const arrayBuffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('CORS proksi xatosi:', err.message);
    res.status(500).send('Rasm proksi xatosi');
  }
});

// Statik fayllar: dist/ va public/
const distDir = path.resolve(__dirname, 'dist');
const publicDir = path.resolve(__dirname, 'public');

app.use(express.static(publicDir));
app.use(express.static(distDir));

// SPA Fallback
app.get('*', (req, res) => {
  const indexHtml = path.join(distDir, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`  Kingsman Virtual Try-On Server ishga tushdi!  `);
  console.log(`  URL: http://localhost:${PORT}                 `);
  console.log(`  Jami Decart kalit slotlari: ${keySlots.length}`);
  console.log(`=================================================\n`);
});
