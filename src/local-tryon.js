/**
 * Kingsman Virtual Try-On - Lokal Dvigatel
 * MediaPipe Pose yordamida kiyimni real vaqtda tabiiy proporsiya bilan kiyintirish.
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
    this.smoothedMidX = null;
    this.smoothedMidY = null;
    this.smoothedWidth = null;
    this.smoothedAngle = 0;

    this.initPose();
  }

  async initPose() {
    try {
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
      console.warn("MediaPipe yuklanmadi, geometrik adaptiv rejim ishlatiladi:", e.message);
    }
  }

  async setGarment(garment) {
    if (!garment || ['Loufer', 'Tufli', 'Krasofka', 'Barsofka'].includes(garment.subcategory)) {
      this.clearGarment();
      return;
    }

    this.currentGarment = garment;
    // Rasmni yuklash
    const directUrl = garment.image;
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
        // Fallback proxy
        const imgFallback = new Image();
        imgFallback.crossOrigin = 'anonymous';
        imgFallback.onload = () => {
          this.garmentImg = imgFallback;
          this.processedGarment = this.removeBackground(imgFallback);
          resolve();
        };
        imgFallback.onerror = () => resolve();
        imgFallback.src = proxyUrl;
      };
      img.src = directUrl;
    });
  }

  clearGarment() {
    this.currentGarment = null;
    this.garmentImg = null;
    this.processedGarment = null;
    this.smoothedMidX = null;
    this.smoothedMidY = null;
    this.smoothedWidth = null;
    this.smoothedAngle = 0;
  }

  /**
   * Kiyim rasmining oq/och fonini tozalash
   */
  removeBackground(sourceImg) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = sourceImg.naturalWidth || sourceImg.width;
    offCanvas.height = sourceImg.naturalHeight || sourceImg.height;
    const offCtx = offCanvas.getContext('2d');

    offCtx.drawImage(sourceImg, 0, 0);
    const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;

    // Fon rangini aniqlash (burchakdagi piksellar)
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      const isVeryLight = r > 238 && g > 238 && b > 238;

      if (isVeryLight || diff < 30) {
        data[i + 3] = 0;
      } else if (diff < 60 || (r > 220 && g > 220 && b > 220)) {
        data[i + 3] = Math.min(data[i + 3], Math.floor((diff / 60) * 255));
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
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
    }

    const w = canvas.width;
    const h = canvas.height;

    // Asosiy kadrni tozalash
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);

    if (!this.processedGarment || !this.currentGarment) return;

    // Pose aniqlash
    if (this.poseDetector && video.currentTime > 0) {
      try {
        const results = this.poseDetector.detectForVideo(video, performance.now());
        if (results.landmarks && results.landmarks.length > 0) {
          this.landmarks = results.landmarks[0];
        }
      } catch (err) {}
    }

    const isLower = ['Shim Pol Klassik', 'Shim', 'Jeans', 'Shalvar'].includes(this.currentGarment.subcategory);

    if (this.landmarks) {
      this.renderWithLandmarks(ctx, w, h, isLower);
    } else {
      this.renderAdaptiveFallback(ctx, w, h, isLower);
    }
  }

  /**
   * MediaPipe Pose nuqtalari bilan kiyintirish
   */
  renderWithLandmarks(ctx, w, h, isLower) {
    const lm = this.landmarks;
    // 11: left_shoulder (foydalanuvchi chap yelkasi, ekranda o'ngda)
    // 12: right_shoulder (foydalanuvchi o'ng yelkasi, ekranda chapda)
    const ls = lm[11];
    const rs = lm[12];
    const lh = lm[23];
    const rh = lm[24];

    if (!ls || !rs) return;

    // Koordinatalar: ls.x odatda > rs.x bo'ladi
    const lsX = ls.x * w;
    const lsY = ls.y * h;
    const rsX = rs.x * w;
    const rsY = rs.y * h;

    // Gorizontal va vertikal farq (to'g'ri burchak hisobi)
    const dx = lsX - rsX;
    const dy = lsY - rsY;
    const rawDist = Math.hypot(dx, dy);

    // Yelka burchagi (odam qiyaligiga moslash, teskari aylanishni oldini olish)
    let angle = Math.atan2(dy, dx);
    if (Math.abs(angle) > Math.PI / 4) {
      angle = 0; // Agar xato hisoblansa, to'g'ri turgan deb olinadi
    }

    const rawMidX = (lsX + rsX) / 2;
    const rawMidY = (lsY + rsY) / 2;

    // Smoothing (titrashni yo'qotish)
    const smoothFactor = 0.35;
    if (this.smoothedMidX === null) {
      this.smoothedMidX = rawMidX;
      this.smoothedMidY = rawMidY;
      this.smoothedWidth = rawDist;
      this.smoothedAngle = angle;
    } else {
      this.smoothedMidX += (rawMidX - this.smoothedMidX) * smoothFactor;
      this.smoothedMidY += (rawMidY - this.smoothedMidY) * smoothFactor;
      this.smoothedWidth += (rawDist - this.smoothedWidth) * smoothFactor;
      this.smoothedAngle += (angle - this.smoothedAngle) * smoothFactor;
    }

    const midX = this.smoothedMidX;
    const midY = this.smoothedMidY;
    const shoulderDist = this.smoothedWidth;
    const currentAngle = this.smoothedAngle;

    ctx.save();

    if (!isLower) {
      // Ustki kiyim (Kastyum, Kurtka, Nimcha, Futbolka)
      // Tabiiy proporsiya: yelka kengligidan biroz kengroq (1.5x)
      const garmentW = shoulderDist * 1.52;
      const aspectRatio = this.processedGarment.height / this.processedGarment.width;
      const garmentH = garmentW * aspectRatio;

      ctx.translate(midX, midY);
      ctx.rotate(currentAngle);

      // Yoqani yelkalar o'rtasidan bir oz yuqoriga qo'yish (bo'yin chizig'iga)
      const collarOffset = garmentH * 0.13;

      ctx.drawImage(
        this.processedGarment,
        -garmentW / 2,
        -collarOffset,
        garmentW,
        garmentH
      );
    } else if (lh && rh) {
      // Pastki kiyim (Shim, Jeans)
      const lhX = lh.x * w;
      const lhY = lh.y * h;
      const rhX = rh.x * w;
      const rhY = rh.y * h;

      const hipMidX = (lhX + rhX) / 2;
      const hipMidY = (lhY + rhY) / 2;
      const hipDist = Math.hypot(lhX - rhX, lhY - rhY);

      const pantsW = Math.max(hipDist * 2.2, shoulderDist * 1.25);
      const aspectRatio = this.processedGarment.height / this.processedGarment.width;
      const pantsH = pantsW * aspectRatio;

      ctx.translate(hipMidX, hipMidY);
      ctx.rotate(currentAngle * 0.5);

      ctx.drawImage(
        this.processedGarment,
        -pantsW / 2,
        -pantsH * 0.08,
        pantsW,
        pantsH
      );
    }

    ctx.restore();
  }

  /**
   * Landmarklar yo'q bo'lsa adaptiv kiyintirish
   */
  renderAdaptiveFallback(ctx, w, h, isLower) {
    const centerX = w / 2;
    const centerY = isLower ? h * 0.65 : h * 0.55;

    const baseWidth = w * (isLower ? 0.35 : 0.45);
    const aspectRatio = this.processedGarment.height / this.processedGarment.width;
    const baseHeight = baseWidth * aspectRatio;

    ctx.save();
    ctx.drawImage(
      this.processedGarment,
      centerX - baseWidth / 2,
      centerY - baseHeight * 0.25,
      baseWidth,
      baseHeight
    );
    ctx.restore();
  }
}
