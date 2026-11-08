import { createDecartClient, models } from '@decartai/sdk';
import { LocalTryOnEngine } from './local-tryon.js';
import { generatePrompt } from './prompt.js';

// DOM elementlari
const cameraVideo = document.getElementById('camera-video');
const remoteVideo = document.getElementById('remote-video');
const tryonCanvas = document.getElementById('tryon-canvas');
const cameraPromptBox = document.getElementById('camera-prompt-box');
const startCamBtn = document.getElementById('start-cam-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const snapshotBtn = document.getElementById('snapshot-btn');
const clearGarmentBtn = document.getElementById('clear-garment-btn');
const modeAiBtn = document.getElementById('mode-ai-btn');
const modeLocalBtn = document.getElementById('mode-local-btn');
const currentModeTag = document.getElementById('current-mode-tag');
const fpsTag = document.getElementById('fps-tag');
const promptPreviewText = document.getElementById('prompt-preview-text');
const productsGrid = document.getElementById('products-grid');
const categoryChips = document.getElementById('category-chips');
const searchInput = document.getElementById('search-input');
const aiStatusText = document.getElementById('ai-status-text');
const statusDot = document.getElementById('status-dot');
const creditsPill = document.getElementById('credits-pill');
const sessionTimerText = document.getElementById('session-timer-text');

// State
let localStream = null;
let currentMode = 'ai'; // STANDART REJIM: AI
let currentGarment = null;
let catalog = [];
let localEngine = null;
let decartClient = null;
let realtimeSession = null;
let sessionSeconds = 0;
let sessionInterval = null;
let inactivityTimeout = null;
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000; // 5 daqiqa

/**
 * 1. Server holatini tekshirish
 */
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Status olib bo\'lmadi');
    const data = await res.json();

    if (data.hasKey && data.activeSlot) {
      const active = data.slots.find(s => s.slot === data.activeSlot);
      const credits = active ? active.credits : 0;
      aiStatusText.textContent = `Decart AI (Slot ${data.activeSlot}/${data.totalSlots})`;
      creditsPill.textContent = `${credits} kredit`;
      statusDot.classList.remove('offline');
    } else {
      aiStatusText.textContent = 'Decart kalit ulanmagan';
      creditsPill.textContent = '0 kredit';
      statusDot.classList.add('offline');
    }
  } catch (err) {
    console.warn('Server status xatosi:', err.message);
  }
}

/**
 * 2. Kamerani ishga tushirish
 */
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });

    cameraVideo.srcObject = localStream;
    await cameraVideo.play();

    cameraPromptBox.style.display = 'none';
    toggleCamBtn.textContent = '📷 Kamerani to\'xtatish';

    // Dvigatellarni sozlash
    if (!localEngine) {
      localEngine = new LocalTryOnEngine(cameraVideo, tryonCanvas);
      localEngine.onFpsUpdate = (fps) => {
        if (currentMode === 'local') {
          fpsTag.textContent = `FPS: ${fps}`;
        }
      };
    }

    if (currentMode === 'local') {
      localEngine.start();
      if (currentGarment) localEngine.setGarment(currentGarment);
    } else if (currentGarment) {
      await applyGarmentAI();
    }

    startSessionTimer();
    resetInactivityTimer();
  } catch (err) {
    console.error('Kamera xatosi:', err);
    alert('Kameraga ulanishda xatolik yuz berdi. Iltimos brauzer ruxsatini bering.');
  }
}

function stopCamera() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (localEngine) {
    localEngine.stop();
  }
  disconnectDecartAI();
  stopSessionTimer();

  cameraPromptBox.style.display = 'flex';
  toggleCamBtn.textContent = '📷 Kamerani yoqish';
}

/**
 * 3. Rejim almashtirish (AI vs Lokal)
 */
function switchMode(newMode) {
  currentMode = newMode;
  if (newMode === 'ai') {
    modeAiBtn.classList.add('active');
    modeLocalBtn.classList.remove('active');
    currentModeTag.textContent = '✨ AI Rejim (Decart lucy-vton)';
    fpsTag.style.display = 'none';
    tryonCanvas.style.display = 'none';

    if (localEngine) localEngine.stop();
    if (localStream && currentGarment) {
      applyGarmentAI();
    } else {
      cameraVideo.style.display = 'block';
      remoteVideo.style.display = 'none';
    }
  } else {
    modeLocalBtn.classList.add('active');
    modeAiBtn.classList.remove('active');
    currentModeTag.textContent = '⚡ Tez Rejim (Lokal MediaPipe)';
    fpsTag.style.display = 'block';
    tryonCanvas.style.display = 'block';
    cameraVideo.style.display = 'block';
    remoteVideo.style.display = 'none';

    disconnectDecartAI();
    if (localEngine && localStream) {
      localEngine.start();
      if (currentGarment) localEngine.setGarment(currentGarment);
    }
  }
}

/**
 * 4. Decart AI ulanish va kiyimni ustingizga kiyintirish
 */
async function applyGarmentAI() {
  if (!localStream || !currentGarment) return;

  const promptObj = generatePrompt(currentGarment);
  promptPreviewText.textContent = `✨ [Decart AI Ulanmoqda...] ${currentGarment.name}`;

  // Agar mavjud sessiya bo'lsa, kiyimni set() bilan bir zumda o'zgartirish
  if (realtimeSession) {
    try {
      await realtimeSession.set({
        prompt: promptObj.prompt,
        enhance: false,
        image: currentGarment.image
      });
      promptPreviewText.textContent = `✨ [AI Faol] ${promptObj.prompt}`;
      console.log('Decart kiyim almashtirildi:', currentGarment.name);
      return;
    } catch (e) {
      console.warn('Decart session.set xatosi, qayta ulaniladi:', e);
      disconnectDecartAI();
    }
  }

  // Yangi WebRTC ulanish ochish
  try {
    const tokenRes = await fetch('/api/tokens', { method: 'POST' });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error || 'Token olishda xatolik');
    }
    const tokenData = await tokenRes.json();

    decartClient = createDecartClient({
      apiKey: tokenData.apiKey || tokenData.token
    });

    const modelDef = models.realtime('lucy-vton-latest');

    realtimeSession = await decartClient.realtime.connect(localStream, {
      model: modelDef,
      mirror: 'auto',
      speed: 'fast',
      initialState: {
        prompt: {
          text: promptObj.prompt,
          enhance: false
        },
        image: currentGarment.image
      },
      onRemoteStream: (stream) => {
        remoteVideo.srcObject = stream;
        remoteVideo.style.display = 'block';
        cameraVideo.style.display = 'none';
        tryonCanvas.style.display = 'none';
        promptPreviewText.textContent = `✨ [Jonli AI Video Faol] ${promptObj.prompt}`;
        console.log('Decart jonli AI try-on videosi ulandi!');
      },
      onConnectionChange: (state) => {
        console.log('Decart holati:', state);
        if (state === 'generating' || state === 'connected') {
          promptPreviewText.textContent = `✨ [Jonli AI] Kiyim muvaffaqiyatli kiyildi!`;
        }
      }
    });

    await checkServerStatus();
  } catch (err) {
    console.error('Decart AI ulanish xatosi:', err);
    promptPreviewText.textContent = `AI xatosi: ${err.message || 'Qayta urinilmoqda'}`;
    cameraVideo.style.display = 'block';
    remoteVideo.style.display = 'none';
  }
}

function disconnectDecartAI() {
  if (realtimeSession) {
    try {
      realtimeSession.disconnect?.();
    } catch (e) {}
    realtimeSession = null;
  }
  remoteVideo.srcObject = null;
  remoteVideo.style.display = 'none';
  cameraVideo.style.display = 'block';
}

/**
 * 5. Mahsulotni tanlash (Kiyib ko'rish)
 */
async function selectGarment(product) {
  currentGarment = product;
  resetInactivityTimer();

  // Kartochka belgilanishi
  document.querySelectorAll('.product-card').forEach(card => {
    if (card.dataset.id === String(product.id)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const promptInfo = generatePrompt(product);
  promptPreviewText.textContent = `[${promptInfo.region.toUpperCase()}] ${product.name}`;

  // Kamera yoqilmagan bo'lsa darhol yoqish
  if (!localStream) {
    await startCamera();
  }

  // AI rejimda Decart AI ga yuborish
  if (currentMode === 'ai') {
    await applyGarmentAI();
  } else {
    if (localEngine) {
      if (['Loufer', 'Barsofka', 'Krasofka', 'Tufli'].includes(product.subcategory)) {
        alert('Eslatma: Oyoq kiyimlar lokal rejimda ko\'rsatilmaydi. Iltimos AI rejimga o\'ting.');
      }
      await localEngine.setGarment(product);
    }
  }
}

function clearCurrentGarment() {
  currentGarment = null;
  document.querySelectorAll('.product-card').forEach(card => card.classList.remove('selected'));
  promptPreviewText.textContent = 'Hali kiyim tanlanmadi';

  if (localEngine) localEngine.clearGarment();
  disconnectDecartAI();
}

/**
 * 6. Taymer va Kredit tejash
 */
function startSessionTimer() {
  stopSessionTimer();
  sessionSeconds = 0;
  sessionInterval = setInterval(() => {
    sessionSeconds++;
    const mins = String(Math.floor(sessionSeconds / 60)).padStart(2, '0');
    const secs = String(sessionSeconds % 60).padStart(2, '0');
    sessionTimerText.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopSessionTimer() {
  if (sessionInterval) clearInterval(sessionInterval);
  sessionInterval = null;
  sessionTimerText.textContent = '00:00';
}

function resetInactivityTimer() {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    console.warn('5 daqiqa kiyim tanlanmadi: kredit tejash maqsadida AI sessiya to\'xtatildi.');
    disconnectDecartAI();
    promptPreviewText.textContent = 'AI sessiya kredit tejash uchun to\'xtatildi. Kiyim tanlang.';
  }, INACTIVITY_LIMIT_MS);
}

/**
 * 7. Snapshot (PNG saqlash)
 */
function takeSnapshot() {
  const canvas = document.createElement('canvas');
  const sourceVideo = (currentMode === 'ai' && remoteVideo.style.display !== 'none' && remoteVideo.srcObject) 
    ? remoteVideo 
    : cameraVideo;

  if (!sourceVideo || sourceVideo.readyState < 2) {
    alert('Kamera kadrini olib bo\'lmadi');
    return;
  }

  canvas.width = sourceVideo.videoWidth || 1280;
  canvas.height = sourceVideo.videoHeight || 720;
  const ctx = canvas.getContext('2d');

  if (currentMode === 'ai') {
    ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(tryonCanvas, 0, 0, canvas.width, canvas.height);
  }

  const link = document.createElement('a');
  link.download = `kingsman-tryon-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * 8. Katalogni yuklash va render qilish
 */
async function loadCatalog() {
  try {
    const res = await fetch('/catalog.json');
    if (!res.ok) throw new Error('catalog.json topilmadi');
    catalog = await res.json();

    renderCategoryChips();
    renderProducts();
  } catch (err) {
    console.error('Katalogni yuklashda xatolik:', err);
  }
}

function renderCategoryChips() {
  const counts = {};
  catalog.forEach(p => {
    counts[p.subcategory] = (counts[p.subcategory] || 0) + 1;
  });

  const sortedSubcats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  let html = `<button class="chip active" data-subcat="all">Barchasi (${catalog.length})</button>`;
  sortedSubcats.forEach(sub => {
    html += `<button class="chip" data-subcat="${sub}">${sub} (${counts[sub]})</button>`;
  });

  categoryChips.innerHTML = html;

  categoryChips.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderProducts();
    });
  });
}

function renderProducts() {
  const activeSubcat = categoryChips.querySelector('.chip.active')?.dataset.subcat || 'all';
  const query = (searchInput.value || '').trim().toLowerCase();

  const filtered = catalog.filter(p => {
    const matchSubcat = activeSubcat === 'all' || p.subcategory === activeSubcat;
    const matchQuery = !query || p.name.toLowerCase().includes(query) || (p.unique_id && p.unique_id.toLowerCase().includes(query));
    return matchSubcat && matchQuery;
  });

  productsGrid.innerHTML = filtered.map(p => {
    const formattedPrice = new Intl.NumberFormat('uz-UZ').format(p.price) + ' so\'m';
    const isSelected = currentGarment && currentGarment.id === p.id;
    const directImg = p.image;
    const proxyImg = `/img?u=${encodeURIComponent(p.image)}`;

    return `
      <div class="product-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
        <div class="card-img-wrapper">
          <img class="card-img" src="${directImg}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='${proxyImg}';" />
        </div>
        <div class="card-body">
          <div class="card-cat">${p.subcategory}</div>
          <div class="card-title" title="${p.name}">${p.name}</div>
          <div class="card-footer">
            <div class="card-price">${formattedPrice}</div>
            <button class="try-btn">Kiyib ko'rish</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Hodisalarni ulash
  productsGrid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const prodId = Number(card.dataset.id);
      const product = catalog.find(p => p.id === prodId);
      if (product) selectGarment(product);
    });
  });
}

// ==================== EVENT LISTENERS ====================
startCamBtn.addEventListener('click', startCamera);
toggleCamBtn.addEventListener('click', () => {
  if (localStream) stopCamera();
  else startCamera();
});

snapshotBtn.addEventListener('click', takeSnapshot);
clearGarmentBtn.addEventListener('click', clearCurrentGarment);

modeAiBtn.addEventListener('click', () => switchMode('ai'));
modeLocalBtn.addEventListener('click', () => switchMode('local'));

searchInput.addEventListener('input', () => renderProducts());

// Boshlang'ich initsializatsiya
checkServerStatus();
loadCatalog();
