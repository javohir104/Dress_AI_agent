import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const API_BASE = 'https://api.kingsman.com.uz';

async function fetchAllProducts() {
  console.log('Kingsman API dan mahsulotlar yuklanmoqda...');
  let page = 1;
  const limit = 50;
  let allProducts = [];
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const url = `${API_BASE}/products?limit=${limit}&page=${page}`;
      console.log(`Sahifa so'ralmoqda: ${page}/${totalPages || '...'} -> ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      const items = data.data || [];
      totalPages = data.totalPages || 1;
      
      allProducts.push(...items);
      console.log(`Sahifa ${page} olindi: ${items.length} ta mahsulot. Jami hozircha: ${allProducts.length}`);
      page++;
    }

    console.log(`Barcha mahsulotlar muvaffaqiyatli yuklandi: jami ${allProducts.length} ta.`);

    // Tozalash va saralash
    const cleaned = allProducts.map((p) => {
      const subcatName = p.subcategory?.name || p.category?.name || 'Boshqa';
      const variant = p.variants?.[0] || {};
      const photos = variant.photos?.map(ph => ph.url) || [];
      const primaryPhoto = photos[0] || p.mobile_photo_url?.url || '';
      const minPrice = variant.sizes?.reduce((min, s) => (s.price && s.price < min ? s.price : min), 99999999) || 0;

      return {
        id: p._id || p.id,
        unique_id: p.unique_id || String(p._id),
        name: p.name || p.name_uz || p.name_ru || '',
        category: p.category?.name || '',
        subcategory: subcatName,
        price: minPrice === 99999999 ? 0 : minPrice,
        image: primaryPhoto,
        photos: photos,
        color: variant.color?.name_uz || variant.color?.name || '',
        color_code: variant.color?.code?.[0] || '000000',
        sizes: variant.sizes?.map(s => s.size?.name).filter(Boolean) || []
      };
    }).filter(p => p.image); // Rasmga ega bo'lganlar

    const outPath = path.join(publicDir, 'catalog.json');
    fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2), 'utf-8');
    console.log(`Katalog saqlandi: ${outPath} (${cleaned.length} mahsulot)`);

    // Subkategoriyalar hisoboti
    const counts = {};
    cleaned.forEach(p => {
      counts[p.subcategory] = (counts[p.subcategory] || 0) + 1;
    });
    console.log('Subkategoriyalar taqsimoti:');
    console.table(counts);

    return cleaned;
  } catch (err) {
    console.error('Katalogni yuklashda xatolik:', err);
    process.exit(1);
  }
}

fetchAllProducts();
