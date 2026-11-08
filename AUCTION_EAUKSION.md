# E-auksion lotlari va Telegram bot bo‘yicha qo‘llanma

## Ishlash tartibi

E-auksion importi rasmiy `https://e-auksion.uz/api/front/lots` API’sidan faqat ko‘chmas mulk guruhidagi hovli uylar (category `2`) va kvartiralar (category `3`) ni oladi. Importator ariza muddati kelajakda bo‘lgan lotlarni qoldiradi, lot raqamini tashqi identifikator sifatida saqlaydi va yaqin muddatlilarni avval tanlaydi. Standart chegarasi 20 ta; `--limit=N` bilan 1–200 oralig‘ida beriladi.

Har bir import qilingan lot rasmiy API javobidagi nom, manzil, narx, zakalat, savdo/ariza sanalari, lot raqami va `media_url` rasmini saqlaydi. `source_payload` ustunida e-auksion qaytargan to‘liq JSON yozuv ham saqlanadi. Uzoq tavsif ro‘yxat javobida bo‘lmasa, sun’iy matn yaratilmaydi: rasmiy kategoriya nomi ishlatiladi va to‘liq rasmiy lot sahifasiga havola beriladi. E-auksionning `/lot-info` endpointi proof-of-work himoyasini qaytargani sabab, importer undan qo‘shimcha tavsif olayotgani haqida da’vo qilmaydi.

Saqlanganda lot `auction_lots` jadvalida `active` holatga yoziladi. Lot sahifadagi `/api/v1/lots` endpointida chiqadi. `auction.approved` xabari `outbox` jadvaliga yoziladi; ishlayotgan Telegram bot worker lot matni, rasmiy surat, rasmiy lot havolasi va `https://t.me/serinaqu` ariza tugmasini kanalga yuboradi. Saytdagi **Ariza berish** ham shu Telegram manzilini ochadi. Kanal sozlanmagan yoki worker o‘chiq bo‘lsa, lot saytda saqlanadi va outbox navbatida turadi.

## Birinchi import

1. `.env` ichida `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` va kerak bo‘lsa `PUBLIC_SITE_URL` sozlanganini tekshiring.
2. `npm run db:migrate` bajaring. Bu `source_lot_number`, `image_url`, `source_payload` ustunlarini yaratadi.
3. Avval natijani ko‘ring: `npm run import:e-auksion`.
4. Sayt va Telegram navbatiga yozish uchun: `npm run import:e-auksion -- --apply`.
5. Ko‘proq lot tanlash uchun, masalan: `npm run import:e-auksion -- --limit=40 --apply`.
6. Eski e-auksion kanal postlarini rasmli va ariza tugmali ko‘rinishda yangilash zarur bo‘lsa, `npm run refresh:e-auksion-posts` bajaring. U eski e-auksion xabarlarini o‘chiradi va to‘g‘rilangan postlarni navbatga qo‘yadi.
7. Botni alohida terminal yoki doimiy worker’da ishga tushiring: `npm run bot`.

Ko‘rib chiqish rejimi database’ga yozmaydi. `--apply` lotlarni saqlaydi va kanalga chiqarish uchun navbatga qo‘yadi. Importni qayta ishlatish mavjud `source_lot_number` yozuvlarini yangilaydi; yangi lot nusxasi yaratmaydi. Kanalga bir necha yuzta postni bir vaqtda yubormaslik uchun miqdor 200 bilan cheklangan.

## Telegram orqali bitta lot kiritish

Telegram botda admin hisobidan **Admin panel → E-auksion lotini kiritish** ni bosing. So‘ng rasmiy lot raqamini quyidagi ko‘rinishda yuboring:

```text
/addlot 26717015
```

Bot rasmiy API’dan shu raqamni qidiradi, faqat uy yoki kvartira turidagi faol lotni qabul qiladi, boshlang‘ich narx, zakalat, hudud, savdo sanasi va ariza muddatini saqlaydi. Lot bazaga yozilgach, saytga chiqadi va Telegram kanal worker’iga navbatlanadi. Bu amal `ADMIN_TELEGRAM_IDS` yoki bazadagi admin roli bilan cheklanadi.

Foydalanuvchilar **🏆 Auksionlar** yoki `/lots` orqali muddati tugamagan lotlarni ko‘radi. Sayt va botdagi **Ariza berish** tugmasi `https://t.me/serinaqu` ga olib boradi. Rasmiy lot sahifasiga havola ham ko‘rsatiladi.

## `npm run bot` ishlamasa

Loyiha ildizidagi `package.json` `bot` buyrug‘ini `apps/api` workspace’dagi `node src/bot.js` ga uzatadi. Bot quyidagilarsiz tayyor holatga o‘tmaydi:

- Node.js 24 LTS (loyihadagi tavsiya) yoki mos Node.js runtime;
- loyiha ildizida to‘g‘ri `.env`;
- ishlayotgan PostgreSQL, `DATABASE_URL` va qo‘llangan migratsiyalar;
- haqiqiy `TELEGRAM_BOT_TOKEN`;
- Telegram’dan chiqish tarmoq aloqasi;
- kanal postlari uchun `TELEGRAM_CHANNEL_ID` va botning kanal admin huquqi.

Bot pollingda bitta nusxada ishlashi kerak. `npm run bot` uni foreground jarayon sifatida ishga tushiradi; terminal yopilsa bot ham to‘xtaydi. VPS’da `docker compose up -d --build db migrate api bot` bot worker’ini doimiy ishlatadi. Startup muammosida terminaldagi `Bot startup is waiting...` satri database yoki Telegram xatosining kodini va xavfsiz qisqa sababini ko‘rsatadi.

## Fayllar xaritasi

| Fayl | Ichidagi vazifa | Muhim joyi |
| --- | --- | --- |
| `package.json` | Workspace buyruqlari. `npm run bot` bot worker’ini ochadi; import, kanal postlarini yangilash va Pages deploy buyruqlari ham shu yerda. | `scripts.bot`, `scripts.import:e-auksion`, `scripts.refresh:e-auksion-posts`, `scripts.deploy:web` |
| `scripts/import-e-auksion-lots.js` | Rasmiy API’dan uy va kvartira lotlarini olib, ochiq muddatlilarni preview yoki DB upsert/outbox qiladi; API row va rasmni saqlaydi. | `SOURCE`, `CATEGORIES`, `mapLot`, `main` |
| `scripts/refresh-e-auksion-channel-posts.js` | Avval yuborilgan e-auksion kanal postlarini o‘chirib, rasmli yangilangan postlar uchun publication yozuvlarini qayta navbatga qo‘yadi. | Telegram `deleteMessage`, publication reset |
| `apps/api/src/bot.js` | Telegram polling, admin paneli, `/lots`, `/addlot LOT_RAQAMI`, rasmli kanal posti va `t.me/serinaqu` ariza tugmasi. | `adminPanel`, `importEAuctionLot`, `publishListing`, `startBot` |
| `apps/api/src/channel-posts.js` | Kanal post matni va tugmalari. Auksion postida rasmiy lot raqami, ariza va manba tugmalari bor. | `auctionPost`, `auctionButtons` |
| `apps/api/src/server.js` | Ommaviy lotlar API’si; muddati o‘tgan lotlar katalogdan chiqariladi. Admin API lot yaratish/tahrirlash va outbox’ni yuritadi. | `GET /api/v1/lots`, `POST /api/v1/admin/lots`, `PATCH /api/v1/admin/lots/:id` |
| `apps/api/migrations/001_init.sql` | Auksion jadvali va e-auksion identifikatori, rasm URL’i, to‘liq JSON manba yozuvi ustunlari. | `auction_lots` ustunlari |
| `apps/web/src/main.jsx` | Auksion katalogi va tafsiloti; e-auksion rasmini, lot raqamini, rasmiy havolani hamda Telegram ariza tugmasini ko‘rsatadi. | `AuctionsPage`, `AuctionDetail` |
| `index.html` | Sayt til, title, description, Open Graph va Twitter share metadata’si. | `<head>` |
| `apps/web/src/admin-app.jsx` | Sayt adminining lot qo‘shish, tahrirlash, holatni o‘zgartirish va hujjat biriktirish interfeysi. | `AdminLots`, `AdminLotForm`, `AdminLotDocuments` |
| `apps/web/src/app.css` | Saytning kichik ekranlardagi katalog va admin ko‘rinishi. | responsive qoidalar |
| `wrangler.jsonc` | Cloudflare Pages project va Vite build output konfiguratsiyasi. | `pages_build_output_dir` |
| `functions/api/[[path]].js` | Pages Functions orqali `/api/*` so‘rovlarini backend originiga proxy qiladi. | `onRequest` |
| `functions/uploads/[[path]].js` | Sayt rasmlarini backend `/uploads/*` yo‘lidan uzatadi. | `onRequest` |
| `public/_headers` | Cloudflare Pages security va cache response header’lari. | `/*`, `/assets/*` |
| `public/robots.txt` | Qidiruv crawler’lari uchun ochiq sahifalarni belgilaydi; admin HTML’ni chetlaydi. | robots qoidalari |
| `public/site-icon.svg`, `public/og-image.svg` | Brauzer yorlig‘i va ulashish preview’i uchun brend SVG tasvirlari. | SVG asset’lar |
| `deploy/production.env.example` | VPS `.env` uchun xavfsiz, qiymatlari almashtirilishi kerak bo‘lgan shablon. | production env kalitlari |
| `deploy/README.md` | Cloudflare Pages + VPS API yoki to‘liq Docker VPS deploy bosqichlari. | DNS, build, API_ORIGIN, worker |
| `.env.example` | Bot, kanal, sayt URL va DB sozlamalari nomlari uchun namuna. Haqiqiy token/secret emas. | Telegram va `DATABASE_URL` qiymatlari |
| `README.md` | Umumiy loyiha yo‘riqnomasi va qisqa import/ishga tushirish ko‘rsatmasi. | “E-auksion lotlarini import qilish” |
| `AUCTION_EAUKSION.md` | Ushbu fayl: aniq oqim, buyruqlar, cheklov va fayllar xaritasi. | To‘liq qo‘llanma |

Ishchi daraxtda bu vazifadan avval ham ayrim fayllarda commit qilinmagan o‘zgarishlar bor edi. Ular saqlanib qoldi; fayl xaritasi loyihaning hozirgi tarkibiy rolini ko‘rsatadi.
