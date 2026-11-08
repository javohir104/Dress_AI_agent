/**
 * Kingsman Virtual Try-On - Lokal Dvigatel
 * MediaPipe Pose / Canvas Mesh-warp va Segmentatsiya yordamida kiyimni real vaqtda moslash.
 * Oyoq kiyimlar lokal rejimda ko'rsatilmaydi (cheklov).
 */

export class LocalTryOnEngine {
  constructor(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    this.isRunning = false;
    this.currentGarment = null;
    this.garmentImg = null;
    this.processedGarment = null;

    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();

    this.poseDetector = null;
    this.landmarks = null;

    this.initPose();
  }

  async initPose() {
    try {
      // MediaPipe Tasks-Vision yuklashga harakat qilamiz
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision').catch(() => ({}));
      if (PoseLandmarker && FilesetResolver) {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        this.poseDetector = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        console.log("MediaPipe PoseLandmarker GPU orqali yuklandi!");
      }
    } catch (e) {
      console.warn("MediaPipe to'g'ridan-to'g'ri yuklanmadi, geometrik adaptiv rejimga o'tildi:", e.message);
    }
  }

  /**
   * Kiyim rasmini yuklaydi va fonini tozalaydi (oq/och kulrang fonni shaffof qiladi)
   */
  async setGarment(garment) {
    if (!garment || garment.subcategory === 'Loufer' || garment.subcategory === 'Tufli' || garment.subcategory === 'Krasofka' || garment.subcategory === 'Barsofka') {
      this.currentGarment = null;
      this.garmentImg = null;
      this.processedGarment = null;
      return;
    }

    this.currentGarment = garment;
    const proxyUrl = `/img?u=${encodeURIComponent(garment.image)}`;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.garmentImg = img;
        this.processedGarment = this.removeBackground(img);
        resolve();
      };
      img.onerror = () => {
        console.error("Kiyim rasmini yuklab bo'lmadi:", proxyUrl);
        resolve();
      };
      img.src = proxyUrl;
    });
  }

  clearGarment() {
    this.currentGarment = null;
    this.garmentImg = null;
    this.processedGarment = null;
  }

  /**
   * Oq/och fonni yo'qotib, kiyimni shaffof PNG ga aylantirish
   */
  removeBackground(sourceImg) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = sourceImg.naturalWidth || sourceImg.width;
    offCanvas.height = sourceImg.naturalHeight || sourceImg.height;
    const offCtx = offCanvas.getContext('2d');

    offCtx.drawImage(sourceImg, 0, 0);
    const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;

    // Burchak piksellardan fon rangini aniqlash (odatda oq yoki juda och kulrang)
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Oq yoki burchak foniga yaqin ranglarni shaffof qilish
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      const isWhite = r > 230 && g > 230 && b > 230;

      if (isWhite || diff < 35) {
        data[i + 3] = 0; // Alpha 0
      } else if (diff < 65 || (r > 215 && g > 215 && b > 215)) {
        // Yumshoq qirralar (anti-aliasing)
        data[i + 3] = Math.min(data[i + 3], Math.floor((diff / 65) * 255));
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    return offCanvas;
  }

  start() {
    this.isRunning = true;
    this.renderLoop();
  }

  stop() {
    this.isRunning = false;
  }

  renderLoop = () => {
    if (!this.isRunning) return;

    this.render();
    this.calculateFps();
    requestAnimationFrame(this.renderLoop);
  };

  calculateFps() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      if (this.onFpsUpdate) this.onFpsUpdate(this.fps);
    }
  }

  render() {
    const { video, canvas, ctx } = this;
    if (!video || video.readyState < 2) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    const w = canvas.width;
    const h = canvas.height;

    // 1. Asosiy video kadrini tozalash va chizish
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);

    if (!this.processedGarment || !this.currentGarment) return;

    // 2. Pose aniqlash
    if (this.poseDetector && video.currentTime > 0) {
      try {
        const results = this.poseDetector.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks.length > 0) {
          this.landmarks = results.landmarks[0];
        }
      } catch (err) {
        // fallback
      }
    }

    // 3. Kiyimni tana nuqtalariga joylashtirish
    const isLower = ['Shim Pol Klassik', 'Shim', 'Jeans', 'Shalvar'].includes(this.currentGarment.subcategory);

    if (this.landmarks) {
      this.renderWithLandmarks(ctx, w, h, isLower);
    } else {
      this.renderAdaptiveFallback(ctx, w, h, isLower);
    }
  }

  /**
   * MediaPipe Pose nuqtalari bilan kiyintirish (Yelka, Ko'krak, Bel, Tirsak)
   */
  renderWithLandmarks(ctx, w, h, isLower) {
    const lm = this.landmarks;
    // 11: chap yelka, 12: o'ng yelka, 23: chap son/bel, 24: o'ng son/bel, 27: to'piq
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftHip = lm[23];
    const rightHip = lm[24];

    if (!leftShoulder || !rightShoulder) return;

    const lsX = leftShoulder.x * w;
    const lsY = leftShoulder.y * h;
    const rsX = rightShoulder.x * w;
    const rsY = rightShoulder.y * h;

    const shoulderDist = Math.hypot(lsX - rsX, lsY - rsY);
    const shoulderMidX = (lsX + rsX) / 2;
    const shoulderMidY = (lsY + rsY) / 2;
    const angle = Math.atan2(rsY - lsY, rsX - lsX);

    ctx.save();

    if (!isLower) {
      // Ustki kiyim (Upper body)
      const garmentW = shoulderDist * 2.1;
      const aspectRatio = this.processedGarment.height / this.processedGarment.width;
      const garmentH = garmentW * aspectRatio;

      ctx.translate(shoulderMidX, shoulderMidY);
      ctx.rotate(angle);

      // Yenglar va yelkani to'g'ri o'rnatish
      ctx.drawImage(
        this.processedGarment,
        -garmentW / 2,
        -garmentH * 0.18, // Yelka bo'yni chizig'iga moslash
        garmentW,
        garmentH
      );
    } else if (leftHip && rightHip) {
      // Pastki kiyim (Lower body / Shim)
      const lhX = leftHip.x * w;
      const lhY = leftHip.y * h;
      const rhX = rightHip.x * w;
      const rhY = rightHip.y * h;

      const hipDist = Math.hypot(lhX - rhX, lhY - rhY);
      const hipMidX = (lhX + rhX) / 2;
      const hipMidY = (lhY + rhY) / 2;
      const hipAngle = Math.atan2(rhY - lhY, rhX - lhX);

      const pantsW = Math.max(hipDist * 2.4, shoulderDist * 1.6);
      const aspectRatio = this.processedGarment.height / this.processedGarment.width;
      const pantsH = pantsW * aspectRatio;

      ctx.translate(hipMidX, hipMidY);
      ctx.rotate(hipAngle);

      ctx.drawImage(
        this.processedGarment,
        -pantsW / 2,
        -pantsH * 0.1,
        pantsW,
        pantsH
      );
    }

    ctx.restore();

    // Okklyuziya: Foydalanuvchining boshi va bo'ynini kiyim ustida qoldirish
    this.applyHeadOcclusion(ctx, w, h);
  }

  /**
   * Agar landmarklar bo'lmasa, markaziy adaptiv hisoblash
   */
  renderAdaptiveFallback(ctx, w, h, isLower) {
    const centerX = w / 2;
    const centerY = isLower ? h * 0.65 : h * 0.52;

    const baseWidth = w * (isLower ? 0.38 : 0.48);
    const aspectRatio = this.processedGarment.height / this.processedGarment.width;
    const baseHeight = baseWidth * aspectRatio;

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.drawImage(
      this.processedGarment,
      centerX - baseWidth / 2,
      centerY - baseHeight * 0.35,
      baseWidth,
      baseHeight
    );
    ctx.restore();
  }

  /**
   * Bosh va bo'yin sohasini qayta chizish (okklyuziya effekti)
   */
  applyHeadOcclusion(ctx, w, h) {
    if (!this.landmarks) return;
    const nose = this.landmarks[0];
    if (!nose) return;

    const headX = nose.x * w;
    const headY = nose.y * h;
    const headRadius = w * 0.11;

    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.clip();
    // Faqat bosh sohasini videodan qayta chizamiz
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
  }
}
