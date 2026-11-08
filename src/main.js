import { createDecartClient, models } from '@decartai/sdk';
import { LocalTryOnEngine } from './local-tryon.js';
import { generatePrompt } from './prompt.js';

// DOM Elementlari - Asosiy maydon
const cameraVideo = document.getElementById('camera-video');
const remoteVideo = document.getElementById('remote-video');
const tryonCanvas = document.getElementById('tryon-canvas');
const cameraPromptBox = document.getElementById('camera-prompt-box');
const cameraErrorBox = document.getElementById('camera-error-box');
const startCamBtn = document.getElementById('start-cam-btn');
const retryCamBtn = document.getElementById('retry-cam-btn');
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
const sortSelect = document.getElementById('sort-select');
const aiStatusText = document.getElementById('ai-status-text');
const statusDot = document.getElementById('status-dot');
const creditsPill = document.getElementById('credits-pill');
const sessionTimerText = document.getElementById('session-timer-text');
const dailySecondsText = document.getElementById('daily-seconds-text');
const networkAlert = document.getElementById('network-alert');
const toastContainer = document.getElementById('toast-container');

// DOM Elementlari - Modallar
const favModal = document.getElementById('fav-modal');
const galleryModal = document.getElementById('gallery-modal');
const outfitModal = document.getElementById('outfit-modal');
const cartModal = document.getElementById('cart-modal');
const stylistModal = document.getElementById('stylist-modal');
const telegramModal = document.getElementById('telegram-modal');

const openFavBtn = document.getElementById('open-fav-btn');
const openGalleryBtn = document.getElementById('open-gallery-btn');
const openOutfitBtn = document.getElementById('open-outfit-btn');
const openCartBtn = document.getElementById('open-cart-btn');
const openStylistBtn = document.getElementById('open-stylist-btn');

const favCountSpan = document.getElementById('fav-count');
const galleryCountSpan = document.getElementById('gallery-count');
const outfitCountSpan = document.getElementById('outfit-count');
const cartCountSpan = document.getElementById('cart-count');

// Obraz yig'ish elementlari
const slotUpperContent = document.getElementById('slot-upper-content');
const slotLowerContent = document.getElementById('slot-lower-content');
const slotFootwearContent = document.getElementById('slot-footwear-content');
const outfitNameInput = document.getElementById('outfit-name-input');
const outfitTotalPrice = document.getElementById('outfit-total-price');
const saveOutfitBtn = document.getElementById('save-outfit-btn');
const addOutfitToCartBtn = document.getElementById('add-outfit-to-cart-btn');
const savedOutfitsList = document.getElementById('saved-outfits-list');

// Savat elementlari
const cartModalBody = document.getElementById('cart-modal-body');
const cartModalCount = document.getElementById('cart-modal-count');
const cartTotalAmount = document.getElementById('cart-total-amount');
const checkoutBtn = document.getElementById('checkout-btn');

// AI Stilist elementlari
const stylistPromptInput = document.getElementById('stylist-prompt-input');
const askStylistBtn = document.getElementById('ask-stylist-btn');
const stylistResultsGrid = document.getElementById('stylist-results-grid');

// Telegram elementlari
const tgTokenInput = document.getElementById('tg-token-input');
const tgChatInput = document.getElementById('tg-chat-input');
const tgCaptionInput = document.getElementById('tg-caption-input');
const sendToTelegramBtn = document.getElementById('send-to-telegram-btn');

// ==================== STATE VA STORAGE ====================
let localStream = null;
let currentMode = 'ai'; // 'ai' | 'local'
let currentGarment = null;
let catalog = [];
let localEngine = null;
let decartClient = null;
let realtimeSession = null;
let sessionSeconds = 0;
let sessionInterval = null;
let inactivityTimeout = null;
const INACTIVITY_LIMIT_MS = 2 * 60 * 1000; // 2 daqiqa harakatsizlik (Topshiriq 2-band)

// LocalStorage kalitlari
const STORAGE_KEYS = {
  DAILY_SECONDS: 'tryon_daily_seconds',
  LAST_DATE: 'tryon_last_date',
  FAVORITES: 'tryon_favorites',
  SNAPSHOTS: 'tryon_snapshots',
  OUTFITS: 'tryon_outfits',
  CART: 'tryon_cart',
  TG_CONFIG: 'tryon_tg_config'
};

let favorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || '[]');
let snapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.SNAPSHOTS) || '[]');
let outfits = JSON.parse(localStorage.getItem(STORAGE_KEYS.OUTFITS) || '[]');
let cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || '[]');
let currentOutfit = { upper: null, lower: null, footwear: null };
let selectedSnapshotForTg = null;

// ==================== TOAST & ALERTS (Topshiriq 7-band) ====================
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span> <span>${msg}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Tarmoq holati monitoringi
window.addEventListener('offline', () => {
  networkAlert.style.display = 'block';
  showToast('Internet bilan aloqa uzildi!', 'error');
});
window.addEventListener('online', () => {
  networkAlert.style.display = 'none';
  showToast('Internet aloqasi tiklandi!', 'success');
});

// ==================== 1. SERVER STATUS VA TOKEN ====================
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

// ==================== 2. KUNLIK FOYDALANISH VA TAYMER (Topshiriq 2-band) ====================
function initDailyUsage() {
  const today = new Date().toDateString();
  const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE);
  if (lastDate !== today) {
    localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
    localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, '0');
  }
  updateDailyUsageDisplay();
}

function updateDailyUsageDisplay() {
  const secs = parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_SECONDS) || '0', 10);
  dailySecondsText.textContent = secs;
}

function incrementDailyUsage() {
  let secs = parseInt(localStorage.getItem(STORAGE_KEYS.DAILY_SECONDS) || '0', 10);
  secs++;
  localStorage.setItem(STORAGE_KEYS.DAILY_SECONDS, String(secs));
  updateDailyUsageDisplay();
}

function startSessionTimer() {
  stopSessionTimer();
  sessionSeconds = 0;
  sessionInterval = setInterval(() => {
    sessionSeconds++;
    incrementDailyUsage();
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
    console.warn('2 daqiqa kiyim tanlanmadi: kredit tejash maqsadida sessiya to\'xtatildi.');
    disconnectDecartAI();
    showToast('2 daqiqa harakatsizlik: kredit tejash uchun AI sessiya to\'xtatildi.', 'info');
  }, INACTIVITY_LIMIT_MS);
}

// ==================== 3. KAMERA ISHGA TUSHIRISH (Topshiriq 7-band) ====================
async function startCamera() {
  cameraErrorBox.style.display = 'none';
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
    cameraPromptBox.style.display = 'none';
    cameraErrorBox.style.display = 'flex';
    showToast('Kameraga ruxsat berilmadi. Iltimos brauzer sozlamalarini tekshiring.', 'error');
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

// ==================== 4. REJIM ALMASHTIRISH (AI / LOKAL) ====================
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

// ==================== 5. DECART AI VTON ULANISH ====================
async function applyGarmentAI() {
  if (!localStream || !currentGarment) return;

  const promptObj = generatePrompt(currentGarment);
  promptPreviewText.textContent = `✨ [Decart AI Ulanmoqda...] ${currentGarment.name}`;

  if (realtimeSession) {
    try {
      await realtimeSession.set({
        prompt: promptObj.prompt,
        enhance: false,
        image: currentGarment.image
      });
      promptPreviewText.textContent = `✨ [AI Faol] ${promptObj.prompt}`;
      return;
    } catch (e) {
      console.warn('Decart session.set xatosi, qayta ulaniladi:', e);
      disconnectDecartAI();
    }
  }

  try {
    const tokenRes = await fetch('/api/token', { method: 'POST' });
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
      },
      onConnectionChange: (state) => {
        if (state === 'generating' || state === 'connected') {
          promptPreviewText.textContent = `✨ [Jonli AI] Kiyim kiyildi!`;
        }
      }
    });

    await checkServerStatus();
  } catch (err) {
    console.error('Decart AI ulanish xatosi:', err);
    promptPreviewText.textContent = `AI xatosi: ${err.message || 'Xatolik yuz berdi'}`;
    cameraVideo.style.display = 'block';
    remoteVideo.style.display = 'none';
    showToast(`AI ulanish xatosi: ${err.message}`, 'error');
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

// ==================== 6. MAHSULOTNI TANLASH ====================
async function selectGarment(product) {
  currentGarment = product;
  resetInactivityTimer();

  document.querySelectorAll('.product-card').forEach(card => {
    if (card.dataset.id === String(product.id)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  const promptInfo = generatePrompt(product);
  promptPreviewText.textContent = `[${promptInfo.region.toUpperCase()}] ${product.name}`;

  if (!localStream) {
    await startCamera();
  }

  if (currentMode === 'ai') {
    await applyGarmentAI();
  } else {
    if (localEngine) {
      if (['Loufer', 'Barsofka', 'Krasofka', 'Tufli', 'mens-shoes', 'womens-shoes'].includes(product.subcategory)) {
        showToast('Oyoq kiyimlar faqat AI rejimda ko\'rsatiladi.', 'info');
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

// ==================== 7. SNAPSHOT VA GALEREYA (Topshiriq 4-band) ====================
function takeSnapshot() {
  const canvas = document.createElement('canvas');
  const sourceVideo = (currentMode === 'ai' && remoteVideo.style.display !== 'none' && remoteVideo.srcObject) 
    ? remoteVideo 
    : cameraVideo;

  if (!sourceVideo || sourceVideo.readyState < 2) {
    showToast('Kamera kadrini olib bo\'lmadi', 'error');
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

  const dataUrl = canvas.toDataURL('image/png');
  const newSnapshot = {
    id: `snap-${Date.now()}`,
    dataUrl,
    date: new Date().toLocaleString('uz-UZ'),
    garment: currentGarment ? currentGarment.name : 'Asl qiyofa'
  };

  snapshots.unshift(newSnapshot);
  localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
  updateCounts();
  showToast('Snapshot olindi va Galereyaga saqlandi!', 'success');
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  if (snapshots.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted); text-align:center; grid-column: 1/-1;">Hozircha hech qanday snapshot olinmagan.</p>';
    return;
  }

  grid.innerHTML = snapshots.map(s => `
    <div class="gallery-card">
      <img src="${s.dataUrl}" alt="Snapshot" />
      <div style="padding: 6px 10px; font-size: 11px; color: var(--text-muted);">${s.date} - ${s.garment}</div>
      <div class="gallery-card-actions">
        <button class="btn btn-secondary" onclick="window.downloadSnapshot('${s.id}')">💾 Yuklab olish</button>
        <button class="btn btn-primary" onclick="window.openTelegramModal('${s.id}')">✈️ Telegram</button>
        <button class="btn btn-danger" onclick="window.deleteSnapshot('${s.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

window.downloadSnapshot = (id) => {
  const s = snapshots.find(item => item.id === id);
  if (!s) return;
  const a = document.createElement('a');
  a.href = s.dataUrl;
  a.download = `kingsman-${id}.png`;
  a.click();
};

window.deleteSnapshot = (id) => {
  snapshots = snapshots.filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
  updateCounts();
  renderGallery();
  showToast('Snapshot o\'chirildi', 'info');
};

// ==================== 8. SEVIMLILAR (Topshiriq 4-band) ====================
function toggleFavorite(product, e) {
  if (e) e.stopPropagation();
  const index = favorites.findIndex(f => f.id === product.id);
  if (index >= 0) {
    favorites.splice(index, 1);
    showToast(`${product.name} sevimlilardan o'chirildi`, 'info');
  } else {
    favorites.push(product);
    showToast(`${product.name} sevimlilarga qo'shildi! ❤️`, 'success');
  }
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  updateCounts();
  renderProducts();
}

function renderFavorites() {
  const body = document.getElementById('fav-modal-body');
  document.getElementById('fav-modal-count').textContent = favorites.length;

  if (favorites.length === 0) {
    body.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Hozircha sevimli kiyimlar yo\'q.</p>';
    return;
  }

  body.innerHTML = `
    <div class="cart-items-list">
      ${favorites.map(p => `
        <div class="cart-item-row">
          <img class="cart-item-img" src="${p.image}" alt="${p.name}" />
          <div class="cart-item-details">
            <div class="cart-item-name">${p.name}</div>
            <div class="cart-item-price">${new Intl.NumberFormat('uz-UZ').format(p.price)} so'm</div>
          </div>
          <button class="btn btn-primary" onclick="window.tryGarmentFromModal(${p.id})">Kiyib ko'rish</button>
          <button class="btn btn-secondary" onclick="window.addToCart(${p.id})">🛒</button>
          <button class="btn btn-danger" onclick="window.removeFavorite(${p.id})">✕</button>
        </div>
      `).join('')}
    </div>
  `;
}

window.removeFavorite = (id) => {
  favorites = favorites.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  updateCounts();
  renderFavorites();
  renderProducts();
};

window.tryGarmentFromModal = (id) => {
  const p = catalog.find(item => item.id === id);
  if (p) {
    closeAllModals();
    selectGarment(p);
  }
};

// ==================== 9. OBRAZ YIG'ISH (Topshiriq 5-band) ====================
function addToOutfit(product, e) {
  if (e) e.stopPropagation();
  const sub = product.subcategory;
  const isLower = ['Shim Pol Klassik', 'Shim', 'Jeans', 'Shalvar'].includes(sub);
  const isFootwear = ['Loufer', 'Barsofka', 'Krasofka', 'Tufli', 'mens-shoes', 'womens-shoes'].includes(sub);

  if (isFootwear) {
    currentOutfit.footwear = product;
    showToast(`${product.name} obrazning poyabzaliga qo'shildi! 👞`, 'success');
  } else if (isLower) {
    currentOutfit.lower = product;
    showToast(`${product.name} obrazning pastki qismiga qo'shildi! 👖`, 'success');
  } else {
    currentOutfit.upper = product;
    showToast(`${product.name} obrazning ustki qismiga qo'shildi! 🧥`, 'success');
  }

  updateOutfitBuilderUI();
}

function updateOutfitBuilderUI() {
  slotUpperContent.innerHTML = currentOutfit.upper ? `
    <div class="slot-item-card">
      <img class="slot-item-img" src="${currentOutfit.upper.image}" />
      <div style="font-weight:600;">${currentOutfit.upper.name}</div>
      <div>${new Intl.NumberFormat('uz-UZ').format(currentOutfit.upper.price)} so'm</div>
      <button class="btn btn-danger" style="padding:2px 6px;" onclick="window.clearOutfitSlot('upper')">✕</button>
    </div>
  ` : 'Tanlanmagan';

  slotLowerContent.innerHTML = currentOutfit.lower ? `
    <div class="slot-item-card">
      <img class="slot-item-img" src="${currentOutfit.lower.image}" />
      <div style="font-weight:600;">${currentOutfit.lower.name}</div>
      <div>${new Intl.NumberFormat('uz-UZ').format(currentOutfit.lower.price)} so'm</div>
      <button class="btn btn-danger" style="padding:2px 6px;" onclick="window.clearOutfitSlot('lower')">✕</button>
    </div>
  ` : 'Tanlanmagan';

  slotFootwearContent.innerHTML = currentOutfit.footwear ? `
    <div class="slot-item-card">
      <img class="slot-item-img" src="${currentOutfit.footwear.image}" />
      <div style="font-weight:600;">${currentOutfit.footwear.name}</div>
      <div>${new Intl.NumberFormat('uz-UZ').format(currentOutfit.footwear.price)} so'm</div>
      <button class="btn btn-danger" style="padding:2px 6px;" onclick="window.clearOutfitSlot('footwear')">✕</button>
    </div>
  ` : 'Tanlanmagan';

  const total = (currentOutfit.upper?.price || 0) + (currentOutfit.lower?.price || 0) + (currentOutfit.footwear?.price || 0);
  outfitTotalPrice.textContent = `${new Intl.NumberFormat('uz-UZ').format(total)} so'm`;

  renderSavedOutfits();
}

window.clearOutfitSlot = (slot) => {
  currentOutfit[slot] = null;
  updateOutfitBuilderUI();
};

saveOutfitBtn.addEventListener('click', () => {
  if (!currentOutfit.upper && !currentOutfit.lower && !currentOutfit.footwear) {
    showToast('Obrazga kamida bitta kiyim tanlang!', 'error');
    return;
  }
  const name = (outfitNameInput.value || '').trim() || `Obraz #${outfits.length + 1}`;
  const total = (currentOutfit.upper?.price || 0) + (currentOutfit.lower?.price || 0) + (currentOutfit.footwear?.price || 0);

  const newOutfit = {
    id: `outfit-${Date.now()}`,
    name,
    items: [currentOutfit.upper, currentOutfit.lower, currentOutfit.footwear].filter(Boolean),
    totalPrice: total,
    date: new Date().toLocaleDateString('uz-UZ')
  };

  outfits.unshift(newOutfit);
  localStorage.setItem(STORAGE_KEYS.OUTFITS, JSON.stringify(outfits));
  outfitNameInput.value = '';
  updateCounts();
  updateOutfitBuilderUI();
  showToast(`"${name}" obrazi saqlandi! 👔`, 'success');
});

addOutfitToCartBtn.addEventListener('click', () => {
  const items = [currentOutfit.upper, currentOutfit.lower, currentOutfit.footwear].filter(Boolean);
  if (items.length === 0) {
    showToast('Obraz bo\'sh!', 'error');
    return;
  }
  items.forEach(p => addToCart(p));
  showToast('Obraz kiyimlari savatga qo\'shildi! 🛒', 'success');
});

function renderSavedOutfits() {
  if (outfits.length === 0) {
    savedOutfitsList.innerHTML = '<p style="color:var(--text-muted);">Hozircha saqlangan obrazlar yo\'q.</p>';
    return;
  }

  savedOutfitsList.innerHTML = outfits.map(o => `
    <div class="saved-outfit-card">
      <div class="saved-outfit-info">
        <h5>${o.name} <span style="color:var(--gold-light);">(${new Intl.NumberFormat('uz-UZ').format(o.totalPrice)} so'm)</span></h5>
        <div class="saved-outfit-items">
          ${o.items.map(it => `<img class="saved-outfit-thumb" src="${it.image}" title="${it.name}" />`).join('')}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-primary" onclick="window.tryOutfit('${o.id}')">Kiyib ko'rish</button>
        <button class="btn btn-danger" onclick="window.deleteOutfit('${o.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

window.tryOutfit = (id) => {
  const o = outfits.find(item => item.id === id);
  if (!o || o.items.length === 0) return;
  closeAllModals();
  // Asosiy ustki kiyimni kiyish
  selectGarment(o.items[0]);
  showToast(`"${o.name}" obrazi kiyilmoqda!`, 'info');
};

window.deleteOutfit = (id) => {
  outfits = outfits.filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEYS.OUTFITS, JSON.stringify(outfits));
  updateCounts();
  renderSavedOutfits();
};

// ==================== 10. SAVAT (Topshiriq 6-band) ====================
function addToCart(product, e) {
  if (e) e.stopPropagation();
  if (typeof product === 'number') {
    product = catalog.find(p => p.id === product);
  }
  if (!product) return;

  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  updateCounts();
  showToast(`${product.name} savatga qo'shildi! 🛒`, 'success');
}
window.addToCart = addToCart;

function renderCart() {
  cartModalCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cart.length === 0) {
    cartModalBody.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Savat bo\'sh.</p>';
    cartTotalAmount.textContent = '0 so\'m';
    return;
  }

  let total = 0;
  cartModalBody.innerHTML = `
    <div class="cart-items-list">
      ${cart.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `
          <div class="cart-item-row">
            <img class="cart-item-img" src="${item.image}" alt="${item.name}" />
            <div class="cart-item-details">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-price">${new Intl.NumberFormat('uz-UZ').format(item.price)} so'm</div>
            </div>
            <div class="cart-qty-ctrl">
              <button class="qty-btn" onclick="window.changeCartQty(${item.id}, -1)">-</button>
              <span>${item.quantity}</span>
              <button class="qty-btn" onclick="window.changeCartQty(${item.id}, 1)">+</button>
            </div>
            <button class="btn btn-danger" onclick="window.removeCartItem(${item.id})">✕</button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  cartTotalAmount.textContent = `${new Intl.NumberFormat('uz-UZ').format(total)} so'm`;
}

window.changeCartQty = (id, delta) => {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.id !== id);
  }
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  updateCounts();
  renderCart();
};

window.removeCartItem = (id) => {
  cart = cart.filter(i => i.id !== id);
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  updateCounts();
  renderCart();
};

checkoutBtn.addEventListener('click', () => {
  if (cart.length === 0) {
    showToast('Savatingiz bo\'sh!', 'error');
    return;
  }
  const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  alert(`Buyurtmangiz qabul qilindi!\nJami summa: ${new Intl.NumberFormat('uz-UZ').format(total)} so'm.\nTez orada operatorimiz siz bilan bog'lanadi.`);
  cart = [];
  localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  updateCounts();
  closeAllModals();
});

// ==================== 11. AI STILIST (Topshiriq 8-band) ====================
askStylistBtn.addEventListener('click', async () => {
  const prompt = (stylistPromptInput.value || '').trim();
  if (!prompt) {
    showToast('Iltimos maqsadingizni yozing (masalan: To\'yga boraman, byudjet $150)', 'error');
    return;
  }

  askStylistBtn.textContent = '⏳ AI hisoblamoqda...';
  askStylistBtn.disabled = true;

  try {
    const res = await fetch('/api/ai-stylist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI Stilist xatosi');

    stylistResultsGrid.innerHTML = data.looks.map((look, idx) => `
      <div class="stylist-look-card">
        <div class="stylist-look-header">
          <div class="stylist-look-title">✨ Variant #${idx + 1}: ${look.title}</div>
          <div class="stylist-look-price">${new Intl.NumberFormat('uz-UZ').format(look.totalPrice)} so'm</div>
        </div>
        <p style="font-size: 12px; color: var(--text-muted);">${look.description}</p>
        <div class="stylist-items-row">
          ${look.items.map(it => `
            <div class="stylist-single-item">
              <img class="stylist-single-img" src="${it.product.image}" />
              <div>
                <div style="font-size:11px; color:var(--gold);">${it.role}</div>
                <div style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${it.product.name}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <button class="btn btn-primary" onclick="window.tryGarmentFromModal(${look.items[0]?.product?.id})">👔 Kiyib ko'rish</button>
          <button class="btn btn-secondary" onclick="window.addLookToCart('${encodeURIComponent(JSON.stringify(look.items.map(i => i.product)))}')">🛒 Obrazni savatga qo'shish</button>
        </div>
      </div>
    `).join('');

    showToast('AI 3 ta mukammal obraz yaratdi!', 'success');
  } catch (err) {
    console.error('AI Stilist xatosi:', err);
    showToast(err.message, 'error');
  } finally {
    askStylistBtn.textContent = '✨ Tavsiya olish';
    askStylistBtn.disabled = false;
  }
});

window.addLookToCart = (jsonStr) => {
  try {
    const prods = JSON.parse(decodeURIComponent(jsonStr));
    prods.forEach(p => addToCart(p));
    showToast('Obraz savatga qo\'shildi!', 'success');
  } catch (e) {}
};

// ==================== 12. TELEGRAMGA SNAPSHOT YUBORISH (Topshiriq 9-band) ====================
window.openTelegramModal = (id) => {
  selectedSnapshotForTg = snapshots.find(s => s.id === id);
  if (!selectedSnapshotForTg) return;

  const cfg = JSON.parse(localStorage.getItem(STORAGE_KEYS.TG_CONFIG) || '{}');
  if (cfg.botToken) tgTokenInput.value = cfg.botToken;
  if (cfg.chatId) tgChatInput.value = cfg.chatId;

  telegramModal.style.display = 'flex';
};

sendToTelegramBtn.addEventListener('click', async () => {
  const botToken = (tgTokenInput.value || '').trim();
  const chatId = (tgChatInput.value || '').trim();
  const caption = (tgCaptionInput.value || '').trim();

  if (!botToken || !chatId) {
    showToast('Bot Token va Chat ID kiritilishi shart!', 'error');
    return;
  }
  if (!selectedSnapshotForTg) {
    showToast('Snapshot tanlanmagan', 'error');
    return;
  }

  // Sozlamalarni eslab qolish
  localStorage.setItem(STORAGE_KEYS.TG_CONFIG, JSON.stringify({ botToken, chatId }));

  sendToTelegramBtn.textContent = '⏳ Jo\'natilmoqda...';
  sendToTelegramBtn.disabled = true;

  try {
    const res = await fetch('/api/telegram-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo: selectedSnapshotForTg.dataUrl,
        botToken,
        chatId,
        caption
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Telegram xatosi');

    showToast('Snapshot Telegram botga muvaffaqiyatli yuborildi! 🚀', 'success');
    telegramModal.style.display = 'none';
  } catch (err) {
    console.error('Telegram jo\'natish xatosi:', err);
    showToast(`Xatolik: ${err.message}`, 'error');
  } finally {
    sendToTelegramBtn.textContent = '🚀 Telegramga Jo\'natish';
    sendToTelegramBtn.disabled = false;
  }
});

// ==================== 13. KATALOGNI YUKLASH VA SARALASH (Topshiriq 3-band) ====================
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
  const sortOption = sortSelect.value;

  let filtered = catalog.filter(p => {
    const matchSubcat = activeSubcat === 'all' || p.subcategory === activeSubcat;
    const matchQuery = !query || p.name.toLowerCase().includes(query) || (p.unique_id && p.unique_id.toLowerCase().includes(query));
    return matchSubcat && matchQuery;
  });

  // Narx va nom bo'yicha saralash
  if (sortOption === 'price-asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortOption === 'price-desc') {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sortOption === 'name-asc') {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  productsGrid.innerHTML = filtered.map(p => {
    const formattedPrice = new Intl.NumberFormat('uz-UZ').format(p.price) + ' so\'m';
    const isSelected = currentGarment && currentGarment.id === p.id;
    const isFav = favorites.some(f => f.id === p.id);
    const directImg = p.image;
    const proxyImg = `/img?u=${encodeURIComponent(p.image)}`;

    return `
      <div class="product-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
        <div class="card-top-actions">
          <div class="card-action-icon ${isFav ? 'active' : ''}" title="Sevimlilarga qo'shish" onclick="window.triggerFav(${p.id}, event)">❤️</div>
          <div class="card-action-icon" title="Obrazga qo'shish" onclick="window.triggerOutfit(${p.id}, event)">👔</div>
          <div class="card-action-icon" title="Savatga qo'shish" onclick="window.triggerCart(${p.id}, event)">🛒</div>
        </div>

        <div class="card-img-wrapper" onclick="window.triggerSelect(${p.id})">
          <img class="card-img" src="${directImg}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='${proxyImg}';" />
        </div>

        <div class="card-body">
          <div class="card-cat">${p.subcategory}</div>
          <div class="card-title" title="${p.name}">${p.name}</div>
          <div class="card-footer">
            <div class="card-price">${formattedPrice}</div>
            <button class="try-btn" onclick="window.triggerSelect(${p.id})">Kiyib ko'rish</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.triggerFav = (id, e) => {
  const p = catalog.find(item => item.id === id);
  if (p) toggleFavorite(p, e);
};

window.triggerOutfit = (id, e) => {
  const p = catalog.find(item => item.id === id);
  if (p) addToOutfit(p, e);
};

window.triggerCart = (id, e) => {
  const p = catalog.find(item => item.id === id);
  if (p) addToCart(p, e);
};

window.triggerSelect = (id) => {
  const p = catalog.find(item => item.id === id);
  if (p) selectGarment(p);
};

function updateCounts() {
  favCountSpan.textContent = favorites.length;
  galleryCountSpan.textContent = snapshots.length;
  outfitCountSpan.textContent = outfits.length;
  cartCountSpan.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

// ==================== MODALLARNI BOSHQARISH ====================
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

document.querySelectorAll('.modal-close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.close;
    if (target) document.getElementById(target).style.display = 'none';
  });
});

openFavBtn.addEventListener('click', () => {
  renderFavorites();
  favModal.style.display = 'flex';
});

openGalleryBtn.addEventListener('click', () => {
  renderGallery();
  galleryModal.style.display = 'flex';
});

openOutfitBtn.addEventListener('click', () => {
  updateOutfitBuilderUI();
  outfitModal.style.display = 'flex';
});

openCartBtn.addEventListener('click', () => {
  renderCart();
  cartModal.style.display = 'flex';
});

openStylistBtn.addEventListener('click', () => {
  stylistModal.style.display = 'flex';
});

// ==================== ASOSIY EVENT LISTENERS ====================
startCamBtn.addEventListener('click', startCamera);
retryCamBtn.addEventListener('click', startCamera);
toggleCamBtn.addEventListener('click', () => {
  if (localStream) stopCamera();
  else startCamera();
});

snapshotBtn.addEventListener('click', takeSnapshot);
clearGarmentBtn.addEventListener('click', clearCurrentGarment);

modeAiBtn.addEventListener('click', () => switchMode('ai'));
modeLocalBtn.addEventListener('click', () => switchMode('local'));

searchInput.addEventListener('input', () => renderProducts());
sortSelect.addEventListener('change', () => renderProducts());

// Boshlang'ich chaqiruvlar
initDailyUsage();
updateCounts();
checkServerStatus();
loadCatalog();
