import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const catalogPath = path.join(publicDir, 'catalog.json');

if (!fs.existsSync(catalogPath)) {
  console.error('Avval "npm run catalog" ni ishga tushiring!');
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
const pagesDir = path.join(publicDir, 'p');

if (!fs.existsSync(pagesDir)) {
  fs.mkdirSync(pagesDir, { recursive: true });
}

console.log(`Mahsulot sahifalari generatsiya qilinmoqda: jami ${catalog.length} ta...`);

// 1. Har bir mahsulot sahifasi
catalog.forEach((prod) => {
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": prod.name,
    "image": [prod.image, ...(prod.photos || [])],
    "description": `${prod.subcategory} — Kingsman erkaklar kiyimi to'plamidan`,
    "sku": prod.unique_id,
    "brand": {
      "@type": "Brand",
      "name": "Kingsman"
    },
    "offers": {
      "@type": "Offer",
      "url": `https://kingsman.com.uz/uz/product/${prod.unique_id}`,
      "priceCurrency": "UZS",
      "price": prod.price,
      "availability": "https://schema.org/InStock"
    }
  };

  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prod.name} — Kingsman Jonli Primerka</title>
  <link rel="stylesheet" href="/src/style.css">
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 2)}
  </script>
  <style>
    .product-page-container {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
    }
    @media (max-width: 768px) {
      .product-page-container { grid-template-columns: 1fr; }
    }
    .product-gallery img {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .product-details {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .back-link {
      color: var(--gold);
      text-decoration: none;
      font-size: 14px;
      margin-bottom: 10px;
      display: inline-block;
    }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="brand">
      <div class="brand-logo">Kingsman</div>
      <div class="brand-badge">${prod.subcategory}</div>
    </div>
    <a href="/" class="btn btn-primary">👔 Jonli Primerka (Barchasi)</a>
  </header>

  <main class="product-page-container">
    <div class="product-gallery">
      <img src="${prod.image}" alt="${prod.name}">
    </div>

    <div class="product-details">
      <a href="/" class="back-link">← Kataloga qaytish</a>
      <span class="card-cat">${prod.subcategory}</span>
      <h1 style="font-size: 26px; color: var(--gold-light);">${prod.name}</h1>
      <div class="card-price" style="font-size: 22px;">${new Intl.NumberFormat('uz-UZ').format(prod.price)} so'm</div>

      <p style="color: var(--text-muted); line-height: 1.6;">
        Ushbu kiyimni kameraga qarab to'g'ridan-to'g'ri o'zingizda jonli sinab ko'rishingiz mumkin.
      </p>

      <a href="/?product=${prod.unique_id}" class="btn btn-primary" style="padding: 14px 24px; font-size: 16px; text-align: center; text-decoration: none;">
        ✨ Jonli Kiyib Ko'rish (Try-On)
      </a>
    </div>
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(pagesDir, `${prod.id}.html`), html, 'utf-8');
});

// 2. public/katalog.html
const katalogHtml = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kingsman Mahsulotlar Katalogi — Jonli Primerka</title>
  <link rel="stylesheet" href="/src/style.css">
</head>
<body>
  <header class="app-header">
    <div class="brand">
      <div class="brand-logo">Kingsman</div>
      <div class="brand-badge">Katalog (${catalog.length})</div>
    </div>
    <a href="/" class="btn btn-primary">👔 Jonli Primerkaga O'tish</a>
  </header>

  <main style="max-width: 1400px; margin: 30px auto; padding: 0 20px;">
    <h1 style="color: var(--gold-light); margin-bottom: 24px;">To'liq Katalog</h1>
    <div class="products-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
      ${catalog.map(p => `
        <a href="/p/${p.id}.html" style="text-decoration: none;">
          <div class="product-card">
            <div class="card-img-wrapper">
              <img class="card-img" src="/img?u=${encodeURIComponent(p.image)}" alt="${p.name}" loading="lazy">
            </div>
            <div class="card-body">
              <div class="card-cat">${p.subcategory}</div>
              <div class="card-title">${p.name}</div>
              <div class="card-footer">
                <div class="card-price">${new Intl.NumberFormat('uz-UZ').format(p.price)} so'm</div>
              </div>
            </div>
          </div>
        </a>
      `).join('')}
    </div>
  </main>
</body>
</html>`;

fs.writeFileSync(path.join(publicDir, 'katalog.html'), katalogHtml, 'utf-8');
console.log(`Mahsulot sahifalari muvaffaqiyatli yaratildi: public/p/*.html va public/katalog.html`);
