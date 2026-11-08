# 👔 Kingsman — Jonli Primerka (Try-On 2.0)

> **Kingsman erkaklar kiyimi do'koni uchun real vaqtli Virtual Try-On (jonli kiyib ko'rish) platformasi.**
> Decart AI (`lucy-vton-latest`) va Google MediaPipe dvigatellari asosida ishlaydi.

---

## 🌟 Try-On 2.0 Imkoniyatlari (Bajarilgan vazifalar)

### 🟢 1-DARAJA (Majburiy qism)
1. **Kalit xavfsizligi:**
   - Doimiy Decart `dct_...` API kalitlari hech qachon brauzer kodiga chiqmaydi, faqat `.env` da saqlanadi va `.gitignore` qilingan.
   - Express serverda `POST /api/token` va `POST /api/tokens` endpointlari har bir sessiya uchun qisqa muddatli xavfsiz mijoz tokenini (client token) generatsiya qilib beradi.
2. **Kredit tejash:**
   - Ekranda jonli sessiya taymeri (`00:00`).
   - Agar foydalanuvchi **2 daqiqa** davomida kiyim tanlamasa yoki harakatsiz bo'lsa, kreditlarni tejash uchun AI sessiya avtomatik to'xtatiladi.
   - **«Bugun ishlatildi: XXs»** hisoblagichi `localStorage` da saqlanib, foydalanuvchiga kunlik sarfni ko'rsatib turadi.
3. **Katalog (DummyJSON + Kingsman):**
   - Jami **548 ta mahsulot**: Kingsman do'konining 523 ta kiyimi + DummyJSON to'plami (`mens-shirts`, `mens-shoes`, `tops`, `womens-dresses`, `womens-shoes`).
   - Qidiruv qatori va **Narx bo'yicha saralash** (Arzondan qimmatga, Qimmatdan arzonga, Nom bo'yicha).
4. **❤️ Sevimlilar + 📸 Galereya:**
   - Har bir kartochkada sevimlilarga qo'shish (❤️) tugmasi.
   - Olingan barcha kiyingan fotosuratlar (snapshotlar) `localStorage` galereyasida saqlanadi, ularni kattalashtirib ko'rish va yuklab olish mumkin.

### 🟡 2-DARAJA (O'rta daraja)
5. **👔 Obraz yig'ish (Outfit Builder):**
   - 3 ta slot: **🧥 Ustki kiyim + 👖 Pastki kiyim (Shim) + 👞 Poyabzal**.
   - Obrazga nom berib (masalan: *"To'y libosi"*, *"Ofis klassik"*), umumiy narxi bilan saqlash.
   - Obrazni bir tugma bilan to'liq kiyib ko'rish yoki savatga qo'shish.
6. **🛒 Savat (Shopping Cart):**
   - Mahsulot yoki butun obrazni savatga qo'shish, miqdorini o'zgartirish (`+` / `-`), jami summani hisoblash va buyurtma berish.
7. **Xatolarni chiroyli qayta ishlash:**
   - Kamera ruxsati berilmasa — oq ekran emas, yo'riqnomali chiroyli xabar.
   - Internet uzilsa — tepadagi ogohlantirish banneri va bildirishnoma.
   - Kredit tugasa — avtomatik 4 ta zaxira kalit navbatiga o'tish va tushunarli Toast xabarlar.

### 🔴 3-DARAJA (Bonus daraja)
8. **🤖 Shaxsiy AI Stilist:**
   - Foydalanuvchi o'z maqsadi va byudjetini yozadi (masalan: *«To'yga boraman, byudjet $150»* yoki *«Kuzgi uchrashuv uchun»*).
   - Backenddagi AI Stilist katalogdan mos narx va mavzudagi **3 ta to'liq obraz** (Ustki + Shim + Poyabzal) tavsiya qiladi.
   - Har bir tavsiya etilgan obrazda **«Kiyib ko'rish»** va **«Savatga qo'shish»** tugmalari mavjud.
9. **✈️ Telegram botga yuborish:**
   - Olingan snapshot rasmini to'g'ridan-to'g'ri o'zingizning Telegram botingizga yoki kanalga bir tugma bilan yuborish imkoniyati.
10. **4 ta Decart kaliti navbati (Auto-Failover):**
   - Serverda 4 ta slot (jami ~3600 kredit) ulangan. Bitta kalitda kredit tugasa, tizim avtomatik navbatdagisiga o'tadi.

---

## 🚀 Ishga tushirish (Qo'llanma)

```bash
# 1. Loyiha papkasiga kirish
cd kingsman-tryon

# 2. Kutubxonalarni o'rnatish
npm install

# 3. Katalogni yangilash (ixtiyoriy, tayyor turibdi)
npm run catalog

# 4. Loyihani build qilish
npm run build

# 5. Serverni ishga tushirish
npm start
```
Brauzerda oching: **`http://localhost:8787`**

---

## 🎓 Darsda 2 daqiqalik himoya («Bu kod nima qiladi?»)

Ustoz yoki talabalar so'raganda qisqa va aniq javoblar:

### 1. `server.mjs` nima qiladi?
- **Vazifasi:** Express backend serveri.
- **Xavfsizlik:** Doimiy `DECART_API_KEY` ni berkitadi va frontendga faqat qisqa muddatli vaqtinchalik mijoz tokenini (`POST /api/token`) beradi.
- **Kalitlar navbati:** 4 ta Decart slotini monitoring qiladi, har 30 soniyada kreditni keshlaydi va kredit tugasa avtomatik keyingi kalitga o'tadi.
- **CORS Proksi:** DigitalOcean Spaces va DummyJSON dan rasmlarni Canvasga xavfsiz uzatadi (`GET /img?u=...`).
- **Telegram & AI:** Telegram botga rasm jo'natish (`/api/telegram-send`) va AI stilist obraz tuzish (`/api/ai-stylist`) logikasini bajaradi.

### 2. `src/main.js` nima qiladi?
- **Vazifasi:** Ilovaning boshqaruv markazi (UI State va Integratsiya).
- **Decart AI:** Kamera videosini WebRTC orqali Decart `lucy-vton-latest` modeliga ulaydi va fotoreal o'zgarishni ekranga chiqaradi.
- **Taymerlar:** Har soniya kunlik vaqtni hisoblaydi va 2 daqiqa kiyim tanlanmasa sessiyani to'xtatadi.
- **State boshqaruvi:** Sevimlilar, Galereya, Savat va Obrazlarni `localStorage` da saqlaydi va modallarni yangilaydi.

### 3. `src/local-tryon.js` nima qiladi?
- **Vazifasi:** MediaPipe Tasks-Vision GPU asosidagi bepul lokal kiyintirish dvigateli.
- Tana landmarklarini (yelka 11, 12, bel 23, 24) aniqlab, kiyimni to'g'ri burchak va proporsiyada tana ustiga joylashtiradi va kadr titramasligi uchun tekislash (*smoothing*) bajaradi.

### 4. `src/prompt.js` nima qiladi?
- **Vazifasi:** Mahsulot nomi va kategoriyasidan Decart Anywear uchun optimallashgan 20-30 so'zli inglizcha prompt yasab beradi.

---

## 📁 Fayllar tuzilishi
```
kingsman-tryon/
  ├── server.mjs             # Express backend (API, token, proxy, telegram)
  ├── package.json           # Dastur sozlamalari va kutubxonalar
  ├── .env                   # Decart API kalitlari (git'ga kirmaydi)
  ├── index.html             # Asosiy HTML interfeys va modallar
  ├── src/
  │   ├── main.js            # Frontend mantiqi, WebRTC, do'kon funksiyalari
  │   ├── local-tryon.js     # MediaPipe lokal try-on dvigateli
  │   ├── prompt.js          # Decart AI prompt generatori
  │   └── style.css          # Premium Black & Gold dizayn va modallar
  ├── scripts/
  │   └── fetch-catalog.mjs  # Kingsman + DummyJSON yuklagichi
  └── public/
      └── catalog.json       # 548 ta mahsulot ma'lumotlar bazasi
```
