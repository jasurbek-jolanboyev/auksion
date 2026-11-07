<<<<<<< HEAD
# auksion
=======
# e-uylar

React ko‘chmas mulk platformasi, PostgreSQL API, alohida admin hostida ishlaydigan boshqaruv paneli va Telegram bot. Sayt, admin panel va bot bir xil PostgreSQL bazasidan foydalanadi.

## Mundarija

- [Loyiha tuzilishi](#tuzilma)
- [Lokal ishga tushirish](#lokal-ishga-tushirish)
- [Telegram bot va database](#telegram-bot-va-database)
- [Frontend va backend integratsiyasi](#frontend-va-backend-integratsiya-xaritasi)
- [VPS deploy va production](#vps-deploy-va-production)
- [Xavfsizlik auditi](#xavfsizlik-auditi)
- [Telegram bot sozlamalari](#telegram-bot-sozlamalari)

## Tuzilma

- `apps/web` — React + Vite foydalanuvchi sayti. Alohida `admin.html` entry’dan quriladigan mustaqil admin ilovasi ham shu frontend build ichida chiqadi; Caddy admin domenining bosh sahifasida faqat admin ilovasini beradi.
- `apps/api` — Express API, Postgres migratsiyasi, rasm saqlash va Telegram bot kodi.
- `apps/api/migrations` — umumiy ma’lumotlar bazasi sxemasi.
- Ushbu README loyiha arxitekturasi, API integratsiyasi, bot, database, xavfsizlik va VPS deploy bo‘yicha yagona qo‘llanmadir.
- `index.html` — React/Vite ilovasining kirish nuqtasi; UI `apps/web/src` ichida.
- `index1.html` — asl ko‘rinish uchun saqlangan reference; React build’iga kirmaydi.

## Lokal ishga tushirish

Talablar: Node.js 24 LTS, PostgreSQL 15+. Production Docker images use Node.js 24 LTS.

1. `.env.example` faylini `.env` nomi bilan nusxalang. Lokal PostgreSQL uchun konfiguratsiya `euylar` login, `euylar` parol va `euylar` bazasini kutadi. Homebrew PostgreSQL’da bu login/baza bo‘lmasa, `npm run db:setup:local` buyrug‘ini lokal PostgreSQL administrator huquqiga ega macOS foydalanuvchisidan bajaring. Bu buyruq lokal development bazasini tayyorlaydi; production bazasida ishlatmang.

2. `.env` ichida `DATABASE_URL` va kamida 32 belgili tasodifiy `OTP_SECRET` qiymatini sozlang.
3. `npm install` bajaring.
4. `npm run db:migrate` bajaring.
5. `npm run dev` saytni `http://localhost:5173` va API’ni `http://localhost:4100` da ishga tushiradi.
6. Admin UI `http://admin.localhost:5173/admin.html` manzilida lokal preview qilinadi; VPS’da `https://<ADMIN_HOST>/` admin uchun alohida ilovani ochadi. Admin bo‘lish uchun telefon raqami `ADMIN_PHONES` ichida bo‘lishi va SMS provayder ishlashi kerak.
7. Telegram bot kerak bo‘lsa, quyidagi “Telegram bot va database” hamda “VPS deploy va production” bo‘limlariga amal qiling. Lokal ishga tushirish uchun `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `ADMIN_TELEGRAM_IDS` ni sozlab, `npm run bot` bajaring.

Lokal muhitda ham SMS yoki Telegram xabari faqat tegishli provayder/token sozlangandan keyin yuboriladi. Oldindan belgilangan statik kirish kodi yo‘q.

## E’lonni tasdiqlash oqimi

1. Sayt yoki bot e’lonni `pending` holatda PostgreSQL’ga saqlaydi.
2. Ommaviy `/properties` API faqat `active` e’lonlarni qaytaradi. E’lon egasi `/me/properties`, admin esa `/admin/properties` orqali kutayotgan e’lonni ko‘radi.
3. Admin `active` qilib tasdiqlasa, status va `outbox` yozuvi bitta DB tranzaksiyasida saqlanadi.
4. Telegram bot `outbox` navbatini olib, kanalga e’lonni chiqaradi. Telegram xatosida navbat qayta urinadi; botning oxirgi heartbeat’i admin panelda ko‘rsatiladi.

## Ishga tushirishdan oldin sozlanadigan xizmatlar

- SMS provayderi uchun `SMS_PROVIDER_URL` va `SMS_PROVIDER_TOKEN`. Adapter JSON `{ "to": "+998…", "message": "…" }` yuboradi va 2xx javob kutadi. Provayder API’siga moslashtirish talab qilinishi mumkin.
- Telegram bot tokeni, admin Telegram ID’lari va kanal ID’si. Bot kanalda post qilish huquqiga ega bo‘lishi kerak.
- Fayllar uchun development’da lokal `uploads/`, production’da bardavom disk yoki `STORAGE_DRIVER=s3` bilan S3-compatible storage.
- Production domenida sayt, admin subdomeni, reverse proxy, TLS, cookie domeni va `SITE_ORIGINS`.

Production runbook, host sozlamalari, zaxira, monitoring va migration tartibi ushbu README’ning “VPS deploy va production” bo‘limida keltirilgan. `.env.example` ichidagi qiymatlar ishlab chiqarish sirlari emas; ularni deploy oldidan alohida yarating.

Docker Compose bilan deploy qilishda `.env` ichida `POSTGRES_PASSWORD`, `SITE_DOMAIN`, `ADMIN_HOST` (masalan `admin.<sizning-domeningiz>`), `SESSION_COOKIE_DOMAIN`, `SITE_ORIGINS`, `OTP_SECRET`, SMS va Telegram sozlamalarini haqiqiy qiymatlar bilan kiriting. Keyin `docker compose up -d --build` bajaring. DNS’da sayt va admin subdomain’lari shu serverga yo‘naltirilgan, 80/443 portlari ochiq bo‘lishi kerak. Serverning real manzili, DNS, TLS, kanalga post qilish va SMS provayderini ishga tushirib tekshirmaguncha deployment to‘liq faol hisoblanmaydi.


---

## Telegram bot va database

Ushbu hujjat repository’dagi amaldagi bot va PostgreSQL kodini tavsiflaydi. Sayt, sayt admin paneli, Telegram bot va kanal e’lonlari bitta PostgreSQL bazasidan foydalanadi. Bot uchun alohida ma’lumotlar bazasi yo‘q.

### Fayllar joylashuvi

| Fayl | Vazifasi |
| --- | --- |
| `apps/api/src/bot.js` | Telegram Bot API polling’i, tugmalar, ro‘yxatdan o‘tish, profil, e’lonlar, qidiruv, admin amallari va kanalga post chiqarish |
| `apps/api/src/db.js` | `pg` pool va `DATABASE_URL` orqali PostgreSQL ulanishi |
| `apps/api/src/server.js` | Sayt va admin panel foydalanadigan API; bot bilan ayni DB’ga ulanadi |
| `apps/web/src/admin-app.jsx` | Web admin paneldagi foydalanuvchilar ro‘yxati, profil ko‘rish/tahrirlash va bloklash UI’i |
| `apps/api/src/migrate.js` | Database sxemasini `001_init.sql` dan qo‘llaydi |
| `apps/api/migrations/001_init.sql` | Jadval, constraint, indeks va boshlang‘ich sxemaning manba fayli |
| `apps/api/src/storage.js` | Sayt va bot yuborgan rasmlar/hujjatlar uchun local yoki S3-compatible saqlash |
| `compose.yaml` | `db`, `migrate`, `api`, `bot`, `web` va `caddy` servislarini ishga tushiradi |
| `.env.example` | Kerakli sozlamalar nomlari uchun namuna; haqiqiy secret saqlamaydi |
| README — “Telegram bot sozlamalari” bo‘limi | Telegram tokeni, kanal va VPS sozlash bo‘yicha qisqa yo‘riqnoma |
| README — “VPS deploy va production” bo‘limi | To‘liq VPS, domen, HTTPS, DB, zaxira va deploy tartibi |

#### Kod ichidagi asosiy funksiyalar

| Funksiya | Fayl | Vazifasi |
| --- | --- | --- |
| `mainKeyboard`, `handleMessage` | `apps/api/src/bot.js` | Tugmalar va foydalanuvchi matnlarini qabul qilish |
| `beginRegistration`, `handleRegistrationText`, `showProfile`, `finishProfileEdit` | `apps/api/src/bot.js` | Ro‘yxatdan o‘tish va bot profilini yuritish |
| `search`, `newProperty`, `handleStep`, `saveDraft`, `manageListings` | `apps/api/src/bot.js` | E’lon qidirish, yaratish, saqlash va foydalanuvchi e’lonlarini boshqarish |
| `adminPanel`, `adminUsersPage`, `adminUserProfile`, `adminSetUserBlocked` | `apps/api/src/bot.js` | Bot admin menyusi, foydalanuvchi ro‘yxati/profili va hisob cheklovlari |
| `callback` | `apps/api/src/bot.js` | Inline tugma callback’lari va admin huquqini tekshirish |
| `publishApproved`, `unpublishProperty`, `outboxWorker`, `startBot` | `apps/api/src/bot.js` | Kanal post’lari, retry navbati va bot startup/polling |
| `/admin/users`, `/admin/users/:id`, `/admin/users/:id/status` | `apps/api/src/server.js` | Web admin foydalanuvchilarini qidirish, ko‘rish, tahrirlash va cheklash API’lari |
| `AdminUsers` | `apps/web/src/admin-app.jsx` | Web admin foydalanuvchilar ro‘yxati va tanlangan profil UI’i |

### Bot foydalanuvchi interfeysi

Telegram command menyusida faqat `/start` ko‘rsatiladi. Qidirish, e’lon joylash, e’lonlarni boshqarish, auksion va profil amallari pastdagi reply-keyboard tugmalari orqali bajariladi. Botda hozir quyidagi asosiy tugmalar bor:

- **E’lon qidirish** — `properties.status='active'` e’lonlardan sarlavha, tavsif, hudud va tumanga mos natijalarni chiqaradi.
- **E’lon joylash** — bot foydalanuvchidan ketma-ket ma’lumotlarni so‘raydi, hudud/tur/bitim uchun inline tanlovlar beradi, e’lon va rasmni umumiy DB/storage’ga yozib `pending` holatida moderatorga yuboradi.
- **E’lonlarimni boshqarish** — shu Telegram akkauntiga bog‘langan foydalanuvchining e’lonlarini ko‘rsatadi; egasi tahrirlashi yoki arxivlashi mumkin. Tahrirlangan e’lon qayta ko‘rib chiqishga yuboriladi.
- **Auksionlar** — faol lotlarni ko‘rsatadi; lot uchun ariza takroran yuborilmaydi.
- **Profil** — bot/site uchun saqlangan profil ma’lumotlarini ko‘rsatadi va tahrirlash oqimini ochadi. Telefon raqami faqat foydalanuvchi Telegram’ning o‘z contact tugmasi orqali ulashganda tasdiqlanadi.
- **Admin panel** — faqat adminlarga ko‘rinadi; kutayotgan e’lonlar, DB hisoboti, kanal/bot holati va foydalanuvchilar boshqaruviga o‘tadi.

Inline natija tugmalari orqali foydalanuvchi e’lonni saqlashi, sotuvchiga savol yuborishi, lotga ariza berishi yoki e’lonni saytda ochishi mumkin. Jarayon holatlari `bot_states` jadvalida saqlanadi, shuning uchun bot qayta ishga tushganda dialog bosqichi yo‘qolmaydi.

#### `/start` va profil yaratish

1. `/start` Telegram foydalanuvchisini `users.telegram_id` bo‘yicha topadi yoki yaratadi.
2. Profilning zarur qismlari (`name`, tasdiqlangan `phone`, tanlangan `region`) to‘liq bo‘lmasa, ro‘yxatdan o‘tish oqimi ochiladi.
3. Email, tuman va yashash manzili ixtiyoriy. Tanlovlar va bosqichlar `bot_states.state` JSONB maydonida saqlanadi.
4. Telegram username, Telegram bio va profil rasmi e-uylar hisobidagi telefon yoki email o‘rnini bosmaydi; bular Telegram API’dan alohida olinadi.

#### Bot adminida foydalanuvchilarni boshqarish

Admin panelidagi **Foydalanuvchilar** tugmasi sahifalangan ro‘yxatni ochadi (har sahifada 8 ta foydalanuvchi). Ro‘yxatdagi foydalanuvchi nomi/raqami bo‘lgan tugmani bosganda aynan shu `users.id` profili ochiladi. Profil quyidagilarni ko‘rsatadi:

- e-uylar/bot akkauntidagi ID, ism, telefon(lar), email, hudud, tuman, manzil, rol, hisob holati va cheklov sababi;
- ro‘yxatdan o‘tgan va oxirgi yangilangan vaqt;
- e’lonlar va oxirgi e’lonlar, sevimlilar, saqlangan qidiruvlar, suhbatlar, xabarlar va auksion arizalari soni;
- Telegram API’dan olingan Telegram ID, ism, username, bio va mavjud profil rasmi.

Telegram ma’lumotlari profil ochilgan paytda `getChat` va `getUserProfilePhotos` orqali so‘raladi. Telegram API qaytarmagan maydonlar “olinmadi/ko‘rsatilmagan” bo‘lib qoladi. Bot API telefon raqamini yoki foydalanuvchining boshqa yashirin/private ma’lumotlarini o‘qiy olmaydi; telefon faqat foydalanuvchi o‘zi ulashgan contact sifatida DB’da bo‘ladi. Username mavjud bo‘lsa Telegram profiliga o‘tish tugmasi ko‘rsatiladi.

Bot adminida oddiy hisobni cheklash/qayta faollashtirish mumkin. Administrator hisobini bot orqali o‘zgartirish bloklangan. Cheklashda sessiyalar bekor qilinadi va amal `admin_audit` ga yoziladi. Ism/email/hudud/manzilni batafsil tahrirlash hamda sayt adminidagi to‘liq foydalanuvchi boshqaruvi alohida admin web panelda bajariladi.

Admin huquqi `ADMIN_TELEGRAM_IDS` bilan yoki DB’dagi `users.role='admin'` orqali aniqlanadi. Callback tugmasi bosilganda ham server/bot admin huquqini qayta tekshiradi.

### Bot va sayt DB bilan qanday ishlaydi

`apps/api/src/db.js` Node `pg` pool yaratadi. API va bot har biri shu moduldan pool oladi; alohida connection URL, bot DB yoki bot foydalanuvchilari jadvali yo‘q. Telegram foydalanuvchisi `users` jadvalidagi umumiy e-uylar foydalanuvchisiga `telegram_id` orqali bog‘lanadi.

```text
Telegram foydalanuvchisi
        │ telegram_id
        ▼
      users ──< properties ──< property_images
        │           │
        │           └── outbox ── Telegram kanal post’i
        ├── favorites / saved_searches
        ├── conversations ──< messages
        ├── auction_applications >── auction_lots
        ├── notifications
        └── bot_states (Telegram dialog holati)
```

#### `001_init.sql` dagi jadvallar

| Jadval | Saqlanadigan ma’lumot |
| --- | --- |
| `users` | Sayt/bot hisoblari, telefon, Telegram ID, profil, rol va bloklash holati |
| `sessions` | Web login sessiyalarining hash’i va muddati |
| `otp_challenges` | Telefon orqali kirish uchun OTP hash’i, amal muddati va urinishlar |
| `properties` | Ko‘chmas mulk e’lonlari, egasi, turi/bitimi, narxi, manzili, koordinatasi va moderatsiya holati |
| `property_images` | E’lon rasmlari va tartibi |
| `favorites` | Foydalanuvchi saqlagan e’lonlar |
| `saved_searches` | Saqlangan qidiruv filtrlari (JSONB) |
| `conversations` | E’lon bo‘yicha xaridor-sotuvchi suhbatlari |
| `messages` | Suhbat xabarlari va o‘qilgan vaqti |
| `viewing_requests` | Uy ko‘rish uchun vaqt so‘rovlari |
| `reports` | E’lon bo‘yicha shikoyatlar |
| `projects` | Yangi uylar/turar joy majmualari |
| `auction_lots` | Auksion lotlari, boshlang‘ich narx va deadline |
| `auction_applications` | Foydalanuvchi lot arizalari; lot/user juftligi takrorlanmaydi |
| `lot_documents` | Lotga biriktirilgan hujjat metadata/storage key |
| `notifications` | Sayt va botda foydalanuvchiga ko‘rsatiladigan bildirishnomalar |
| `contact_requests` | Yordam/murojaat formalaridan kelgan so‘rovlar |
| `admin_audit` | Admin tomonidan bajarilgan boshqaruv amallari |
| `outbox` | DB tranzaksiyasidan keyin Telegram kanaliga yuboriladigan hodisalar va retry holati |
| `property_channel_posts` | E’lon va Telegram kanal message ID bog‘lanishi; arxivlashda postni topib o‘chirish uchun |
| `bot_states` | Ro‘yxatdan o‘tish, e’lon yaratish va xabar yozish kabi bot dialog bosqichlari |
| `service_heartbeats` | Bot servisining oxirgi tirikligi, admin panel monitoringi uchun |

E’lon statuslari: `draft`, `pending`, `active`, `rejected`, `archived`. Ommaviy katalog va bot qidiruvi `active` e’lonlarni qaytaradi. Auksion holatlari: `draft`, `active`, `closed`, `archived`; ariza holatlari: `submitted`, `reviewing`, `accepted`, `rejected`. Koordinata WGS84 latitude/longitude ko‘rinishida saqlanadi; latitude `-90..90`, longitude `-180..180`. Narx `bigint`, valyuta ISO kodi (`UZS`, `USD`, `EUR` va hokazo), maydon `m2` yoki `sotix` bilan saqlanadi.

### Kanalga post chiqarish oqimi

1. Sayt yoki bot yangi e’lonni `pending` holatda `properties` va kerak bo‘lsa `property_images` ga yozadi. Bu holatda ommaviy sayt va kanalga chiqmaydi.
2. Admin e’lonni tasdiqlaydi. Status `active` bo‘lishi va `property.approved` hodisasi `outbox` ga yozilishi DB tranzaksiyasida bajariladi.
3. `outboxWorker()` tasdiqlangan e’lonni olib, matn/rasm va inline tugmalar bilan `TELEGRAM_CHANNEL_ID` kanaliga chiqaradi.
4. Telegram qaytargan `message_id` `property_channel_posts` da saqlanadi. Sayt havolasi shu e’lonning public share URL’iga boradi; koordinata bo‘lsa alohida xarita tugmasi ham qo‘shiladi.
5. Telegram vaqtinchalik xato bersa `attempts`, `next_attempt_at`, `last_error` yangilanadi va exponential retry qilinadi.
6. E’lon arxivlansa `property.archived` hodisasi kanal post’ini o‘chirishga yuboriladi.

Bot `getUpdates` long polling ishlatadi, shu sabab production’da `bot` servisining bitta nusxasini ishga tushiring. Parallel bot nusxalari bir-biriga xalaqit berishi mumkin. Bot webhook’ni o‘chirib polling’ni ishga tushiradi.

### Muhit sozlamalari

Qiymatlar `.env` da bo‘ladi; `.env` Git’ga kiritilmaydi. `.env.example` dagi maydonlar:

| Variable | Maqsad |
| --- | --- |
| `DATABASE_URL` | Sayt, admin, migrate va bot uchun umumiy PostgreSQL ulanishi |
| `DB_POOL_SIZE` | Node `pg` connection pool limiti, ixtiyoriy |
| `DATABASE_SSL` | `true` bo‘lsa Postgres TLS sertifikati tekshiruvi yoqiladi |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni; kodga yoki hujjatga yozilmaydi |
| `TELEGRAM_BOT_USERNAME` | Bot username; bo‘sh bo‘lsa bot Telegram’dan o‘zi aniqlaydi |
| `TELEGRAM_CHANNEL_ID` | E’lon chiqariladigan kanal `@username` yoki numeric chat ID |
| `ADMIN_TELEGRAM_IDS` | Telegram admin ID’lari, vergul bilan ajratilgan |
| `PUBLIC_SITE_URL` | Kanal/bot e’lon havolalarining asosiy sayti |
| `PUBLIC_ADMIN_URL` | Bot profilidan sayt adminida ochish tugmasi uchun URL |
| `TELEGRAM_CHANNEL_SIGNATURE` | Kanal post’ining ixtiyoriy oxirgi imzosi |
| `UPLOAD_DIR`, `STORAGE_DRIVER` | Bot/sayt rasm saqlash joyi va backend’i |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE` | `STORAGE_DRIVER=s3` bo‘lgandagi S3-compatible sozlamalari |

`compose.yaml` `DATABASE_URL` ni Compose ichidagi `db` hostiga o‘rnatadi. `.env.example` dagi lokal qiymatni production secret sifatida ishlatmang. Haqiqiy token, DB paroli va access key’larni Markdown, Git, Telegram chat yoki loglarga qo‘ymang.

### Ishga tushirish

#### Lokal, alohida terminalda

```sh
npm install
npm run db:migrate
npm run bot
```

Botga `TELEGRAM_BOT_TOKEN`, `PUBLIC_SITE_URL`, `DATABASE_URL` va schema kerak. Kanalga post chiqarish uchun `TELEGRAM_CHANNEL_ID` hamda botning kanalda post qilish admin huquqi kerak. Admin tugmasi uchun `ADMIN_TELEGRAM_IDS` yoki DB’da admin roli bo‘lsin.

#### VPS / Docker Compose

Repository ildizida `.env` va DNS sozlangandan keyin:

```sh
docker compose config -q
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate api bot
```

`migrate` servisi `api` va `bot` dan oldin `001_init.sql` ni bajaradi. `property_channel_posts` jadvali eski o‘rnatmada yo‘q bo‘lsa, `apps/api/src/bot.js` startup paytida `CREATE TABLE IF NOT EXISTS` bilan aynan shu yordamchi jadvalni tiklaydi; qolgan sxema uchun migration baribir bajarilishi shart.

Foydali holat tekshiruvlari:

```sh
docker compose logs -f bot
docker compose exec db psql -U euylar -d euylar -c '\dt'
docker compose exec db psql -U euylar -d euylar -c "SELECT service,last_seen_at FROM service_heartbeats ORDER BY service;"
docker compose exec db psql -U euylar -d euylar -c "SELECT event_type,attempts,next_attempt_at,last_error FROM outbox WHERE delivered_at IS NULL ORDER BY id;"
```

Bot logida `e-uylar Telegram bot started.` ko‘rinishi kerak. `relation does not exist` chiqsa migration muvaffaqiyatini va DB ulanishining aynan to‘g‘ri bazaga ketayotganini tekshiring. `role "euylar" does not exist` bo‘lsa `DATABASE_URL` ichidagi DB user mavjud emas yoki noto‘g‘ri host/bazaga ulangan.

### Database backup va tiklash

Production’da DB volume’ni o‘chirmang (`docker compose down -v` ishlatmang). PostgreSQL dump’ni muntazam oling va serverdan tashqarida shifrlangan joyda saqlang:

```sh
docker compose exec -T db pg_dump -U euylar -d euylar --format=custom > euylar-$(date +%F).dump
```

Tiklashdan oldin alohida bo‘sh DB tayyorlang; keyin:

```sh
docker compose exec -T db pg_restore -U euylar -d euylar --clean --if-exists < euylar-backup.dump
```

`property-media` volume yoki S3 bucket’dagi rasmlar DB backup’idan alohida zaxiralanadi. Restore’ni avval staging’da sinab ko‘ring.

### Chegaralar va maxfiylik

- Telegram profilidan olinadigan maydonlar Telegram Bot API ruxsat bergan ma’lumotlar bilan cheklangan. Foydalanuvchining telefon raqami, emaili, sessiyalari yoki Telegram’dagi private yozishmalari API’dan o‘qilmaydi.
- Admin foydalanuvchi profili va botdagi faollikni ko‘rishi maxfiy ma’lumotga kirish hisoblanadi; faqat ishonchli admin Telegram ID va web-admin akkauntlariga ruxsat bering.
- Foydalanuvchini bloklash server/DB qatlamida tekshiriladi; bot UI’dagi tugmaning o‘zi ruxsat bermaydi. Admin akkauntini botdan bloklash taqiqlangan.
- DB ichidagi `messages` va `admin_audit` yozuvlari alohida saqlanadi. DB zaxirasi, kimda admin huquqi borligi va VPS loglariga kirish huquqlarini cheklang.
- Auksion arizasi, SMS yuborish, Telegram kanaliga post qilish va rasm saqlash tegishli provider hamda credential’lar to‘g‘ri sozlanganida ishlaydi.

### Tegishli boshqa hujjatlar

- [Telegram sozlamalarining qisqa yo‘riqnomasi](#telegram-bot-sozlamalari)
- [VPS deploy yo‘riqnomasi](#vps-deploy-va-production)
- [Frontend va API integratsiya xaritasi](#frontend-va-backend-integratsiya-xaritasi)
- [Xavfsizlik auditi](#xavfsizlik-auditi)

---

## Frontend va backend integratsiya xaritasi

Bu hujjat foydalanuvchi React frontend (`apps/web/src/main.jsx`), alohida admin frontend (`apps/web/src/admin.jsx` va `apps/web/src/admin-app.jsx`), Express API (`apps/api/src/server.js`), PostgreSQL sxemasi (`apps/api/migrations/001_init.sql`) va Telegram bot (`apps/api/src/bot.js`) bilan moslangan. API prefiksi frontend va serverda `/api/v1`. Site, admin UI, API va Telegram bot bir xil PostgreSQL bazasidan foydalanadi.

### Ishga tushirish va umumiy sozlama

- `npm run dev`: Vite saytni `localhost:5173`, backendni `localhost:4100` da ishga tushiradi; Vite `/api` so‘rovlarini API ga uzatadi.
- `npm run db:migrate`: `001_init.sql` sxemasini qo‘llaydi. Migratsiyadagi jadvallar `IF NOT EXISTS` bilan yaratiladi.
- `npm run bot`: `apps/api/src/bot.js` polling botini va kanal outbox workerini alohida jarayon sifatida boshlaydi.
- API manzili `apps/web/src/api-client.js` dagi yagona `API_BASE` konfiguratsiyasidan olinadi: `VITE_API_BASE_URL` bo‘sh bo‘lsa `/api/v1`. Production reverse proxy ikkala domenning `/api/*` va `/uploads/*` so‘rovlarini backendga uzatadi.
- Admin ilovasi alohida Vite entry (`admin.html`) va bundle sifatida quriladi. Caddy admin domenining root yo‘lini `admin.html` ga yo‘naltiradi; ommaviy domen esa `index.html` ni beradi. Ikkalasi ham bitta API va bazani ishlatadi. Admin ruxsati hostname/UI orqali emas, API’dagi `role='admin'` va admin-origin tekshiruvi orqali beriladi.
- Production’da `OTP_SECRET` kamida 32 belgi, `SESSION_COOKIE_DOMAIN`, `ADMIN_HOST`, `SITE_ORIGINS`, `DATABASE_URL` sozlanishi shart. Cookie `HttpOnly`, `Secure` (production), `SameSite=Lax`; session tokeni bazada SHA-256 xesh ko‘rinishida saqlanadi.
- Server xatolari JSON `{ "error":"…", "message":"…", "details":[] }` qaytaradi. Frontend xabarni toast/banner’da ko‘rsatadi. API xatosida mahalliy fixture bilan almashtirish yo‘q.

### Kirish, profil va ruxsat

| Harakat / kod | Endpoint | Ruxsat |
|---|---|---|
| Sayt yuklanishi — `App` | `GET /api/v1/bootstrap` | Ochiq; cookie bo‘lsa user/session ma’lumotini beradi |
| Telefon kodini yuborish — `sendCode()` | `POST /api/v1/auth/otp` | Ochiq; SMS sozlangan bo‘lishi shart |
| Kodni tasdiqlash — `verifyCode()` | `POST /api/v1/auth/verify` | Ochiq challenge; faqat server OTP tasdiqlagach session beradi |
| Telegram WebApp login — API tayyor, UI tugmasi hali ulanmagan | `POST /api/v1/auth/telegram` | Ochiq; Telegram imzosi va `auth_date` serverda tekshiriladi |
| Profil — `Profile`, `ProfileEdit` | `GET/PATCH /api/v1/me` | Faqat session egasi; `name`, `email`, `region`, `district`, `residentialAddress`, `contactPhone` JSON sifatida yuboriladi. Asosiy `phone` OTP bilan tasdiqlangan, faqat o‘qish uchun; qo‘shimcha raqam `+998` va 9 raqam bo‘lishi kerak. Hudud va tuman ro‘yxatdan tanlanadi. Javob `{user:{id,name,phone,email,region,district,residential_address,contact_phone,role}}`; 422 validatsiya xatolari qaytariladi. `district`, `residential_address`, `contact_phone` ustunlari idempotent migratsiyada qo‘shilgan. |
| Chiqish — `logout()` | `POST /api/v1/auth/logout` | Kirgan user |

Telefon tasdiqlash namunasi:

```json
POST /api/v1/auth/otp
{"phone":"+998901234567"}
```

```json
202 {"challengeId":"UUID","expiresIn":300}
POST /api/v1/auth/verify
{"challengeId":"UUID","phone":"+998901234567","code":"123456","name":"Ali Valiyev"}
200 {"user":{"id":"UUID","name":"Ali Valiyev","phone":"+998901234567","role":"user","region":"Toshkent"}}
```

OTP 6 raqam, amal qilish muddati default 300 soniya, bir soatda bir telefon uchun ko‘pi bilan 5 ta so‘rov, bitta API process’da bir IP uchun ko‘pi bilan 20 ta so‘rov, noto‘g‘ri kod uchun 5 urinish. UI raqamni `+998-XX-XXX-XX-XX` ko‘rinishida formatlaydi va API’ga `+998XXXXXXXXX` yuboradi. `400 OTP_INVALID/OTP_EXPIRED`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`, `502 SMS_PROVIDER_ERROR`, `503 SMS_NOT_CONFIGURED`. SMS yuborish bilan bog‘liq xatolarda foydalanuvchiga sodda “Kodni yuborishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.” xabari ko‘rsatiladi; konfiguratsiya tafsilotlari foydalanuvchi interfeysiga chiqmaydi. Kutiladigan SMS adapter so‘rovi `SMS_PROVIDER_URL` ga `{ "to":"+998…", "message":"e-uylar kirish kodi: …" }` JSON; `Authorization: Bearer SMS_PROVIDER_TOKEN`; 2xx muvaffaqiyat hisoblanadi. Provayder autentifikatsiyasi yoki body formati boshqacha bo‘lsa, `auth/otp` adapterini o‘sha provayderga moslang.

`ADMIN_PHONES` ichidagi raqam OTP bilan tasdiqlanganida `admin` rol oladi. Telegram tomonda `ADMIN_TELEGRAM_IDS` ichidagi ID `admin` roli oladi. Admin huquqini UI, hostname yoki bot callback’iga ishonib bo‘lmaydi; serverdagi role va bot ID allowlist tekshiradi. E’lon egasi bo‘yicha barcha o‘zgartirishlarda `owner_id` server sessioniga solishtiriladi.

Profil PATCH namunasi:

```json
{"name":"Ali Valiyev","region":"Toshkent"}
```

Javob `{ "user": { ... } }`; xato `401`, `422`. `phone` ushbu UI’da tahrirlanmaydi; uni o‘zgartirish uchun OTP asosidagi alohida telefon-almashtirish oqimi hali yo‘q.

### E’lonlar, qidiruv, rasm va egasi

#### Public katalog va tafsilot

- `HomePage`, `ListingsPage`, `Card`: `GET /api/v1/properties?q=&type=&deal=&region=&district=&minPrice=&maxPrice=&rooms=&sort=&page=&pageSize=`. `type`: `apartment|house|land|commercial`; `deal`: `sale|rent`; sort: `new|price_asc|price_desc|area|oldest`; page default `1`, pageSize default `12`, max `48`.
- Ommaviy query faqat `status='active'` qaytaradi. Javob `{items:[Property],total,page,pageSize}`. Bo‘sh natija `Mos e’lon topilmadi`; yuklanish va server xatosi alohida ko‘rsatiladi.
- `PropertyPage`: `GET /api/v1/properties/:id`, faol e’lon, `related` o‘xshashlari va galereya qaytaradi. Egasi o‘zining kutayotgan/qoralama e’lonini ID bilan ko‘ra oladi; begona user `404` oladi. E’lon yo‘q/yopiq bo‘lsa UI topilmadi holatini ko‘rsatadi.
- `SellerPage`: `GET /api/v1/sellers/:id`, faqat seller nomi/hududi va `active` e’lonlari. Telefon va Telegram username bu javobda yo‘q.
- Filtrlar URL/hash query’dan boshlang‘ich qiymat oladi. Katalog `sort` va pagination server query’lariga o‘tadi. Parametrlar SQL qiymat bindlari orqali beriladi; sort qiymati allowlist bilan tanlanadi.
- `ListingsPage` va `PostPage` hududlarni `apps/web/src/locations.js` dagi `UZ_LOCATIONS` ro‘yxatidan oladi; tanlangan viloyat/shaharga mos tuman va shaharlar ikkinchi tanlovda chiqadi. Bu ro‘yxat UI katalogi, backend esa saqlangan nomlarni matn sifatida qabul qiladi. Eski yozuvlardagi “Toshkent” kabi qisqa region nomlari `ILIKE` qidiruvida yangi hudud nomlari bilan qisman mos keladi.

Misol:

```http
GET /api/v1/properties?q=Yunusobod&type=apartment&deal=sale&sort=price_asc&page=1&pageSize=12
```

```json
{"items":[{"id":"UUID","title":"3 xonali kvartira","type":"apartment","deal":"sale","status":"active","price":850000000,"currency":"UZS","area":91,"areaUnit":"m2","region":"Toshkent","district":"Yunusobod","images":[]}],"total":1,"page":1,"pageSize":12}
```

`400/422` yaroqsiz enum/qiymatlar, `429` rate limit kelajakdagi gateway’dan, `5xx` DB/server xatosi. Filter natijasi bo‘sh bo‘lsa HTTP `200` va `items:[]`.

#### E’lon joylash, tahrirlash, qoralama va rasmlar

- Site `PostPage.submit()` `POST /api/v1/properties/with-images` multipart yuboradi; kirgan user shart. `listing` maydonida JSON, `images` maydonida 1–10 rasm. Rasm turi JPG/PNG, fayl hajmi 10 MiB dan oshmaydi va o‘lchami kamida 300×300 px. Client tanlashda tekshiradi, server esa MIME, magic bytes va haqiqiy pixel o‘lchamni qayta tekshiradi.
- `listing` JSON: `title` 3–50 belgi, `description` 20–1000, `type` (`apartment|house|land|commercial`), `deal` (`sale|rent`), `price` UZS musbat integer, `area`, `areaUnit` (`m2|sotix`), `rooms`, `region`, `district`, `address`, `landmark`, `latitude`, `longitude`, `amenities[]`, `sellerTelegram`, `viewingAvailable`, `status` (`draft|pending`). `pending` uchun xaritada tanlangan latitude/longitude, tuman va manzil talab qilinadi.
- Javob `201 {"property":Property}` rasmlar bilan birga qaytadi. Server e’lon, rasmlar va notificationni DB tranzaksiyasida yaratadi; DB xatosida rollback va fayl tozalash bor. `draft` katalogda ko‘rinmaydi, `pending` moderatsiya tasdig‘ini kutadi. Xatolar: `401`, `413`, `415`, `422`.
- Xarita `LocationMapPicker` orqali boshqariladi: klik/sudrash koordinata qo‘yadi; `navigator.geolocation` joriy joyni taklif qiladi. Manzil va mo‘ljal user tomonidan kiritiladi; geokodlash ulanmagan. `viewingAvailable` `properties.viewing_available` ustunida saqlanadi.
- Rasm yuklash: `POST /api/v1/properties/:id/images`, `multipart/form-data`, `images` nomli 12 tagacha JPEG/PNG/WebP fayl, har biri default 12 MB gacha. Session user e’lon egasi yoki admin bo‘lishi shart; ruxsat multipart fayllar o‘qilishidan oldin tekshiriladi. Server MIME va JPEG/PNG/WebP signature’ni tekshiradi, extension’ni server belgilaydi. Local `/uploads/:filename` URL’lari DB’dagi e’lon bilan bog‘lanadi: faol e’lon rasmlari ommaga, qoralama rasmlari esa faqat egasi/admin’ga beriladi. Javob `201 {"images":[{"id":"UUID","url":"…","position":0}]}`. `413` hajm/son, `415` MIME/imzo, `403` egalik, `404` ID yoki rasm.
- `PATCH /api/v1/properties/:id` e’lon egasi uchun; server boshqa userni `403` qaytaradi. Har qanday egasi tahriri `pending` holatga qaytadi va `rejection_reason` ni tozalaydi. E’lonni ommaga qayta chiqarish uchun yana moderator tasdig‘i kerak.
- `GET /api/v1/me/properties` e’lon egasining active/draft/pending/rejected/archived yozuvlarini va rad sababi bo‘lsa uni beradi. `/my-listings` React sahifasi holatni ko‘rsatadi.
- Admin create: `POST /api/v1/admin/properties` admin role talab qiladi, backend yozuvni `active` qilib yaratadi va kanal outbox’iga qo‘shadi. Hozirgi React admin formi xavfsiz tekshiruv oqimidan foydalanib `/properties` orqali `pending` yaratadi.
- Local storage driverda fayl `UPLOAD_DIR` ga yoziladi va DB authorization tekshiradigan `/uploads/...` endpointidan olinadi. `STORAGE_DRIVER=s3` bo‘lsa `apps/api/src/storage.js` S3-compatible bucket’ga yuklaydi; `S3_BUCKET`, access key/secret, endpoint, region va public base URL to‘liq sozlanishi shart. S3 bucket ommaga ochiq bo‘lsa qoralama URL’i ham ochilishi mumkin; private bucket/signed URL siyosatini server tomonda qo‘shing. Production’da lokal storage bardavom shared volume bo‘lishi zarur.

Misol JSON:

```json
{"title":"Yangi 3 xonali kvartira","description":"Ta’mirlangan, transportga yaqin va hujjatlari tayyor.","type":"apartment","deal":"sale","price":850000000,"area":91,"areaUnit":"m2","rooms":3,"region":"Toshkent","district":"Yunusobod","address":"","landmark":"Metro yaqinida","latitude":41.36,"longitude":69.28,"amenities":["Lift","Gaz"],"sellerTelegram":"username","status":"pending"}
```

#### Sevimlilar, solishtirish va saqlangan qidiruv

- Sevimli kartasi `PUT /api/v1/me/favorites/:id` `{}` va o‘chirishda `DELETE /api/v1/me/favorites/:id`; login shart. `GET /api/v1/me/favorites` faqat userning active saqlangan e’lonlari.
- `Card` solishtirish IDs’larini hozir `localStorage` (`euylar-compare`) da uchta ID bilan saqlaydi, `ComparePage` ID’larni `GET /properties/:id` orqali qayta oladi. Compare serverda saqlanmaydi va qurilmalar o‘rtasida sinxron emas; buning uchun endpoint/jadval taklif etilgan, hozircha yozilmagan.
- Qidiruv saqlash `POST /api/v1/me/saved-searches` `{"name":"…","filters":{"q":"…","type":"…"}}`; ko‘rish `GET /api/v1/me/saved-searches`. `SavedSearches` natijaga query string orqali qaytadi. O‘chirish endpointi/UI hali yozilmagan.

### Xarita va yaqin atrofdagi e’lonlar

- `MapPage` xarita har zoom/ko‘chirilganda ko‘rinayotgan chegaralarni `GET /api/v1/properties/map?west=69.1&south=41.2&east=69.4&north=41.5` bilan yuboradi. Parametrlar WGS84 darajalarida: `west/east` longitude (`-180…180`), `south/north` latitude (`-90…90`); chegaralar tartibi tekshiriladi.
- Ixtiyoriy filtrlar: `region`, `district`, `type=apartment|house|land|commercial`, `deal=sale|rent`. Javob `{items:[Property],total,limit:500,coordinates:"WGS84"}`; faqat `active` va ikkala koordinatasi mavjud e’lonlar keladi. Xarita 500 natija bilan cheklanadi. Boshqa hududga o‘tilganda komponent so‘rovni 250 ms debounce qiladi va pinlarni qayta chizadi.
- Kirish huquqi talab qilinmaydi. Yaroqsiz chegara/geo-filtr `422 INVALID_BOUNDS|INVALID_GEO_FILTER`; backend/DB xatosi API xatosi bo‘lib UI’da ko‘rsatiladi. UI pin pop-up va yon ro‘yxatni e’lon tafsilotiga bog‘laydi; uy/kvartira, yer, tijorat, sarlavhadagi maktab va ofis so‘zlariga mos belgilar qo‘llanadi.
- “Yaqinimdan qidirish” brauzer geolokatsiyasidan koordinatani oladi (ruxsat shart, serverga faqat GET so‘rovida yuboriladi) va `lat`, `lng`, `radiusKm` bilan birga map chegarasini qidiradi. Radius `5|10|25|50|100` km. API e’lon koordinatasigacha sferik masofani hisoblab, radiusdan tashqarisini chiqarib tashlaydi; joylashuv ruxsati rad etilsa oddiy xarita/hudud qidiruvi ishlashda qoladi.
- Map API faqat xaritada ko‘rsatishga mos maydonlarni mavjud `Property` formatida qaytaradi; javob namunasi yuqoridagi e’lon javobiga `latitude:41.30,longitude:69.24` qo‘shilgan ko‘rinishdir. E’lon pin koordinatasi bo‘lmasa xaritada chiqmaydi, backend joylashuvni o‘zi taxmin qilmaydi.
- Hozirgi front xarita kutubxonasi Leaflet 1.9.4 ni `unpkg.com` dan talab bo‘yicha yuklaydi; fon tile’lari `VITE_MAP_TILE_URL` qiymatidan (bo‘sh bo‘lsa OpenStreetMap standard tile endpointidan) keladi va xaritada attribution ko‘rsatiladi. Real geokodlash, manzil qidiruvidan koordinata aniqlash, mobil operator joylashuvi va tile hosting/ishonchliligi tashqi xizmatga bog‘liq. E’lon joylash formasida koordinatalarni qo‘lda kiritish yoki brauzer geolokatsiyasini bir marta olish mumkin.

### Sotuvchi aloqasi, chat, uchrashuv va shikoyat

- Telefon/Telegram: `PropertyPage.showPhone()` `GET /api/v1/properties/:id/contact`, login talab qilinadi. Javob `{phone:string|null,telegram:string|null}` faqat `active` e’lon sotuvchisidan olinadi. Phone bo‘lmasa UI chatga taklif qiladi; mavjud bo‘lmagan telefon, username yoki tashqi URL to‘qilmaydi. Telegram qiymati `@` bilan yoki usiz faqat username regex’dan o‘tsa qaytariladi.
- Chat boshlash: `POST /api/v1/conversations` `{"propertyId":"UUID"}` → `201 {conversation}`. Ikkala qatnashchi ham login qilgan, e’lon active bo‘lishi, user o‘z e’loniga yozmasligi kerak. `GET /api/v1/conversations`, `GET /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/messages` `{"text":"…"}`; message 1–4000 belgi. Server membership’ni tekshiradi va qabul qiluvchiga notification yaratadi. Real-time WebSocket/push hali yo‘q; React chat sahifasi polling qilmaydi, xabar yuborilgandan keyin qayta o‘qiydi.
- Ko‘rish vaqti: `POST /api/v1/properties/:id/viewings` `{"requestedAt":"2026-10-25T10:30:00.000Z","note":"…"}`. Login, `active` listing va ISO datetime talab qilinadi. Server egaga notification yozadi; status `pending|accepted|declined|cancelled`. UI so‘rovni yuboradi, sotuvchi tomonidan qabul/rad qilish UI/API hali qo‘shilmagan.
- Shikoyat: `POST /api/v1/properties/:id/reports` `{"reason":"Noto‘g‘ri ma’lumot","details":"…"}`. Login talab; `reason` 3–100, `details` 2000 belgigacha. Admin `GET /api/v1/admin/reports` bilan ko‘radi; statusni o‘zgartirish endpointi hali yozilmagan.
- Telegram bot xabarlar uchun `/ask PROPERTY_ID matn`, `/inbox`, `/reply CONVERSATION_ID matn` buyruqlarini beradi. Ular xuddi shu `conversations/messages` jadvallarini ishlatadi. Javob berilayotgan boshqa account’ning Telegram ID ma’lum bo‘lsa bot Telegram notification jo‘natishga urinadi; jo‘natish muvaffaqiyatsiz bo‘lsa sayt xabari bazada saqlangan bo‘ladi.

### Yangi uylar, auksion, hujjatlar

- Public loyihalar: `GET /api/v1/projects` — `status='active'` majmualar. Admin qo‘shish: `POST /api/v1/admin/projects`, admin role va admin origin talab qiladi. Body `{title,description,region,developer,priceFrom,handoverDate,imageUrl}`. UI `ProjectsPage` ko‘rsatadi.
- Lot ro‘yxati/tafsiloti: `GET /api/v1/lots`, `GET /api/v1/lots/:id`; faqat active lotlar. Admin qo‘shish: `POST /api/v1/admin/lots` body `{title,description,region,address,startingPrice,area,areaUnit,deadline,status}`; admin role + admin origin.
- Ariza: `POST /api/v1/lots/:id/applications`, login shart, lot `active` va muddati tugamagan bo‘lishi shart; bitta user/lot uchun unique. Javob `201 {application}`; takroriy ariza `409 ALREADY_APPLIED`, yopiqligi `409 LOT_CLOSED`. React `AuctionDetail.apply()` va bot `/apply LOT_ID` shu jadvalga yozadi.
- Hujjatlar: `lot_documents` jadvali bor, ammo hujjat metadata yaratish, xavfsiz download endpointi va admin upload UI hozircha yozilmagan. Hujjat URL’i o‘ylab topilmaydi; server storage authorization endpointi implementatsiya qilingach UI’dan ulanishi kerak.

### Moderatsiya, kanal va notification

- Admin navbati: `GET /api/v1/admin/properties?status=pending|draft|active|rejected|archived`; `requireAdmin` role va admin-host origin tekshiradi. React admin panel e’lonni ko‘radi, tahrirlaydi, tasdiqlaydi/rad etadi/arxivlaydi.
- Status amali: `PATCH /api/v1/admin/properties/:id/status` body `{"status":"active|rejected|archived","reason":"…"}`. DB tranzaksiyada listing holati, `admin_audit`, egaga notification va tasdiqda `outbox` yozuvi saqlanadi. UI faqat server muvaffaqiyatli javobidan keyin statusni yangilaydi.
- Statuslar: `draft` — userning saqlangan qoralamasi; `pending` — moderatsiya navbatida; `active` — ommaviy katalogda; `rejected` — admin rad etgan; `archived` — ommaviydan olingan. Kanal jo‘natish `outbox.delivered_at` bo‘sh bo‘lsa navbatda; attempts/last_error qayd etiladi.
- Bot approval callback ham `ADMIN_TELEGRAM_IDS` ni tekshiradi va DB’da shu status/audit/notification/outbox workflow’ini bajaradi. `active` statusga o‘tgan yozuv saytda darhol public; bot outbox navbatidan Telegram kanal postini chiqaradi. Kanalga post Telegram API muvaffaqiyat javobidan keyin delivered bo‘ladi. Telegram uzilganida qayta urinish exponential backoff bilan davom etadi; bot worker ishlamayotgan bo‘lsa post ketmaydi.
- Admin `GET /api/v1/admin/integrations`: SMS, bot token, worker heartbeat (45 soniya), kanal va storage konfiguratsiyasini qaytaradi. Secret qiymatlarini oshkor qilmaydi.
- User notification: `GET /api/v1/me/notifications`, `PATCH /api/v1/me/notifications/:id/read`. Bootstrap ham oxirgi notifications/favorites qaytaradi. UI list ko‘rsatadi; barcha notification turlariga real-time push hali ulanmagan.

### Yordam va murojaat

- `ContactPage` `POST /api/v1/contact-requests` yuboradi. JSON `{name,email,phone,message}`, name 2–100, message 10–5000. Javob `201 {request}`; xato bo‘lsa form saqlanib qoladi. Admin `GET /api/v1/admin/contact-requests` orqali ko‘radi.
- `/help`, `/terms`, `/privacy` React sahifalari mavjud. Hozirgi matn minimal servis matni, yurist tekshirgan haqiqiy foydalanish/maxfiylik hujjati emas; production legal matnlar bilan almashtirish kerak.
- `POST /api/v1/admin/projects`, `/admin/lots`, admin listing endpointlari kabi boshqaruv amallari role tekshiruvidan tashqari admin subdomain `Origin` tekshiruviga ham ega. E’lon egasi serverda tekshiriladi.

### Telegram bot va kanal

`apps/api/src/bot.js` bot polling va kanal outbox workerini ishga tushiradi. Telegram command menyusida faqat `/start` ko‘rsatiladi; asosiy vazifalar bot tugmalari orqali bajariladi. Bot, sayt va admin panel bitta PostgreSQL bazasidan foydalanadi.

- E’lon qidirish faqat `active` e’lonlarni topadi. E’lon joylash bosqichma-bosqich ma’lumot yig‘adi va moderatsiya uchun `pending` holatda saqlaydi. Foydalanuvchi o‘z e’lonlarini tahrirlashi/arxivlashi, profilini ko‘rishi/tahrirlashi mumkin.
- Admin bot panelida kutilayotgan e’lonlarni ko‘radi, foydalanuvchilar ro‘yxatini sahifalaydi va foydalanuvchi tugmasini bosib e-uylar/bot hamda Telegram’da mavjud profil ma’lumotlarini ko‘radi. Oddiy hisobni cheklashi yoki qayta faollashtirishi mumkin.
- Admin huquqi `ADMIN_TELEGRAM_IDS` va `users.role='admin'` bilan server/bot tomonda tekshiriladi.
- Faqat tasdiqlangan (`active`) e’lonlar `outbox` navbati orqali kanalga yuboriladi. Telegram xatosi retry holati sifatida DB’da saqlanadi; post ID `property_channel_posts` jadvalida qayd qilinadi.
- Kanal postidagi sayt tugmasi aynan e’lonning public URL’ini ochadi. Mavjud koordinata uchun xarita tugmasi qo‘shiladi.
- Bot media’ni Telegram’dan olib umumiy `storage.js` adapteriga yozadi. `STORAGE_DRIVER=local` uchun API va botga bir xil bardavom volume, S3 uchun umumiy bucket kerak.

Bot admini foydalanuvchining Telegram’dan ochiq qaytariladigan ism, username, bio va profil rasmini ko‘rsatishi mumkin. Telegram Bot API telefon/email yoki boshqa private profil ma’lumotlarini bermaydi; telefon faqat user o‘zi contact sifatida ulashganda saqlanadi.
## VPS deploy va production

Ushbu hujjat repository’dagi amaldagi Docker Compose, Caddy, React/Vite va Express/PostgreSQL kodiga mos. Kod tayyor bo‘lishi server, domen, SMS provayderi yoki Telegram xizmatlari allaqachon ishga tushganini anglatmaydi: quyidagi tashqi sozlamalar deploy qiluvchi tomonidan berilishi kerak.

### Arxitektura va manzillar

- `apps/web` — React/Vite sayt. `admin.html` alohida entry va bundle sifatida quriladi; u alohida domenning root sahifasida xizmat qiladi.
- `apps/api` — Express API, OTP/SMS kirish, cookie sessiyalari, fayllar, Telegram bot va kanal outbox worker’i.
- `db` — PostgreSQL; sayt, admin va bot shu bazani ishlatadi.
- `caddy` — `SITE_DOMAIN` va `ADMIN_HOST` uchun HTTPS beradi. Asosiy domenda sayt entry’ni, admin domenda `/admin.html` entry’ni beradi; `/api/*` va `/uploads/*` ikkala domendan API’ga uzatiladi.
- Asosiy host: `https://<SITE_DOMAIN>`; admin sayti: `https://<ADMIN_HOST>/`; API ikkala hostda ham shu origin orqali `/api/v1` ostida. Admin UI va foydalanuvchi UI alohida frontend entry/bundle’lardir, ma’lumotlar bazasi va API umumiy.
- Sayt/admin uchun sessiya cookie’i `euylar_session`, HTTP-only, `Secure` (production), `SameSite=Lax`; ikkala hostda kirish saqlanishi uchun `SESSION_COOKIE_DOMAIN` ota domenni `.example.uz` ko‘rinishida qamrashi kerak.
- API va bot Node.js 24 LTS asosida, `node` foydalanuvchisida va read-only root filesystem’da ishlaydi. PostgreSQL alohida ichki tarmoqda; web container bazaga to‘g‘ridan-to‘g‘ri ulana olmaydi.
- Caddy HTTPS hostlarida xavfsizlik response header’larini beradi. Nginx production image’i Nginx 1.30.6 Alpine.

### Deploydan oldingi talablar

1. Ubuntu 22.04/24.04 VPS, kamida 2 vCPU, 4 GB RAM va bardavom disk. Rasm ko‘p bo‘lsa disk/S3 hajmini oshiring.
2. Domen va admin subdomeni DNS A/AAAA yozuvlari bilan VPS’ga yo‘naltirilgan bo‘lishi kerak. Caddy uchun TCP 80/443 va HTTP/3 ishlatilsa UDP 443 ochiq bo‘lsin.
3. Docker Engine hamda Docker Compose v2 plugin o‘rnatilgan bo‘lsin.
4. Ishonchli SMS provayder hisobi va uning API formati; Telegram bot tokeni; kanal ID’si va botga kanalga post yozish huquqi.
5. VPS’da repository checkout va maxfiy `.env` faylini yaratish huquqi.

### Serverga deploy qilish

Repository VPS’da mavjud bo‘lgach, loyiha ildizida:

```sh
cp .env.example .env
chmod 600 .env
```

`openssl rand -hex 32` yordamida alohida maxfiy qiymatlar yarating. `.env` ichidagi quyidagi qiymatlarni almashtiring; secret’larni Git’ga qo‘shmang va logga chiqarmang:

```dotenv
NODE_ENV=production
POSTGRES_PASSWORD=<kuchli-va-tasodifiy-parol>
DATABASE_URL=postgres://euylar:<POSTGRES_PASSWORD>@db:5432/euylar
OTP_SECRET=<kamida-32-belgili-tasodifiy-secret>
SITE_DOMAIN=example.uz
ADMIN_HOST=admin.example.uz
SESSION_COOKIE_DOMAIN=.example.uz
SITE_ORIGINS=https://example.uz,https://admin.example.uz
PUBLIC_SITE_URL=https://example.uz
PUBLIC_ADMIN_URL=https://admin.example.uz
ADMIN_PHONES=+998901234567
SMS_PROVIDER_URL=<provayderning-SMS-API-URL-i>
SMS_PROVIDER_TOKEN=<SMS-provayder-tokeni>
TELEGRAM_BOT_TOKEN=<BotFather-tokeni>
TELEGRAM_BOT_USERNAME=<bot-username>
TELEGRAM_CHANNEL_ID=<kanal-ID-si>
ADMIN_TELEGRAM_IDS=<vergul-bilan-ajratilgan-Telegram-ID-lar>
TELEGRAM_CHANNEL_SIGNATURE=<ixtiyoriy-kanal-imzosi>
STORAGE_DRIVER=local
```

`ADMIN_PHONES` dagi telefon OTP orqali tasdiqlanganda birinchi admin bo‘ladi. Raqamni `+998` va 9 ta raqam bilan, ajratgichsiz yozing. Telegram admin ID’lari ham vergul bilan ajratiladi. Faqat ishonchli, shaxsiy admin telefonlarini kiriting.

`DATABASE_URL` Compose ichida `POSTGRES_PASSWORD` bilan qayta tuziladi; `.env` dagi `DATABASE_URL` development qiymati o‘rnida qolishi mumkin, ammo yuqoridagi production URL shaklini saqlang. Parolda URL uchun maxsus belgilar bo‘lsa percent-encode qiling yoki faqat URL-safe tasodifiy parol yarating.

SMS adapter `SMS_PROVIDER_URL` manziliga `Authorization: Bearer <SMS_PROVIDER_TOKEN>` bilan JSON yuboradi:

```json
{"to":"+998901234567","message":"e-uylar kirish kodi: 123456"}
```

Provider API aynan shu formatni va Bearer autentifikatsiyani qabul qilmasa, `apps/api/src/server.js` ichidagi `/auth/otp` SMS adapterini provider hujjatlariga moslang. Har qanday 2xx javob yuborilgan deb hisoblanadi. SMS konfiguratsiyasi yo‘q yoki provider xato qaytarsa login muvaffaqiyatli deb ko‘rsatilmaydi.

Production’da media bardavom saqlanishi uchun Docker named volume `property-media` uploaddirectory’ni mount qiladi. Tashqi S3 ishlatilsa `STORAGE_DRIVER=s3`, endpoint, bucket, region, access key, secret key va public base URL’ni sozlang. S3 credential’larini faqat VPS `.env` faylida saqlang.

So‘ng:

```sh
docker compose config -q
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 migrate api web caddy bot
```

Migration `001_init.sql` avtomatik bajariladi va API undan keyin ishga tushadi. Yangilashda shu build buyrug‘ini takrorlang. Ma’lumotlar saqlanadigan `postgres-data` va `property-media` volume’larini o‘chirib yubormang.

### Ishga tushganini tekshirish

1. `https://example.uz` va `https://admin.example.uz` HTTPS bilan ochilishini tekshiring.
2. `curl -fsS https://example.uz/api/v1/health` javobida `status: ok` va `database: connected` bo‘lishi kerak.
3. Saytning Kirish oynasida O‘zbekiston telefonini kiriting. UI `+998-XX-XXX-XX-XX` ko‘rinishida formatlaydi; API `+998XXXXXXXXX` kanonik formatini qabul qiladi. SMS kelgan kodni kiriting. Kod 5 daqiqa amal qiladi (sozlanishi mumkin), har challenge’da 5 xato urinishdan keyin yaroqsiz bo‘ladi; bir telefon uchun 1 soatda 5 OTP, bitta IP uchun 1 soatda 20 OTP so‘rovi cheklangan.
4. Kirgan user cookie’li `/api/v1/bootstrap` javobida ko‘rünsün; Chiqish cookie’ni va DB sessiyasini bekor qilsin. Sessiya 30 kun amal qiladi.
5. `ADMIN_PHONES` dagi raqam bilan kirib admin subdomenida panel ochilishini tekshiring. Oddiy foydalanuvchi admin endpoint’laridan `403` olishi kerak.
6. Botni private chat’da `/start` bilan oching; qidiruv va e’lon joylashni pastdagi menyu tugmalari orqali tekshiring. Kanalga test e’lon yuborishni faqat sinov e’loni admin tomonidan tasdiqlangandan keyin bajaring.
7. E’lon yaratish, admin tasdiqlashi, ommaviy katalogda ko‘rinishi, rasm URL’i, xabar yuborish va xabar qabul qilishni ikki alohida user bilan tekshiring.

Admin paneldagi **Ulangan xizmatlar** bo‘limi SMS, Telegram bot worker’i, kanal va media storage holatini ko‘rsatadi. Telegram bot ishlashi uchun token to‘g‘ri, bot polling’iga ruxsat bor, kanal ID to‘g‘ri va bot kanalda post yozuvchi admin bo‘lishi kerak. Kanalga post navbatdan yuboriladi; xato bo‘lsa `outbox` qayta urinadi.

### Autentifikatsiya qanday ishlaydi

- Frontend `apps/web/src/main.jsx` ichidagi `normalizeUzPhone` va `formatUzPhone` orqali raqamni kiritish ko‘rinishidan API kanonik ko‘rinishiga o‘tkazadi.
- `POST /api/v1/auth/otp` raqamni tekshiradi, OTP hash’ini DB’da saqlaydi, SMS provider’ga yuboradi; xom kod DB’da saqlanmaydi.
- `POST /api/v1/auth/verify` OTP’ni bir martalik tekshiradi, foydalanuvchini yaratadi/yangilaydi va 30 kunlik sessiya ochadi.
- `GET /api/v1/bootstrap` sahifa yuklanganda cookie sessiyasini tiklaydi; `POST /api/v1/auth/logout` sessiyani bekor qiladi.
- Admin darajasi faqat serverda `ADMIN_PHONES`/`ADMIN_TELEGRAM_IDS` bilan belgilanadi; URL yoki frontend tugmasi huquq bermaydi. Admin API ruxsati `requireAdmin` bilan serverda tekshiriladi.
- SMS kodi ishlab chiqarish provider’i ulanmaguncha haqiqiy foydalanuvchilarga yetib bormaydi. Soxta kod yoki “muvaffaqiyat” fallback yo‘q.

### Xavfsizlik, zaxira va yangilash

- `.env`, Telegram token, SMS token, DB paroli va OTP secret’ni Git, chat yoki support loglariga qo‘ymang. Agar bot tokeni oldin ommaviy joyga yuborilgan bo‘lsa, deploydan oldin BotFather’dan yangisini oling va eski tokenni bekor qiling.
- `docker compose logs` ichiga secret yoki OTP body tushmasligini tekshiring; xataga response body/token loglamang.
- Har kuni PostgreSQL dump’ni VPS’dan tashqaridagi shifrlangan storage’ga olib chiqing. Fayl volume’ini ham alohida zaxiralang; restore’ni vaqti-vaqti bilan mashq qiling.
- TLS Caddy tomonidan boshqariladi. DNS, 80/443 firewall va server vaqti to‘g‘ri bo‘lishi shart.
- `docker compose down -v` ishlatmang: `-v` database va media ma’lumotlarini o‘chirishi mumkin.
- API loglari, disk bo‘sh joyi, PostgreSQL volume, SMS provider balansi/kvotalari va Telegram bot heartbeat’ini muntazam kuzating.

### Hozir deploydan oldin tashqi tomondan talab qilinadigan ma’lumotlar

- Haqiqiy asosiy domen va admin subdomeni, DNS A/AAAA qiymatlari, VPS IP va firewall.
- Ishlaydigan SMS provayder credential’i va uning aniq endpoint/JSON kontrakti. Hozirgi adapter umumiy Bearer+JSON kontraktini qo‘llaydi; provider boshqacha bo‘lsa moslash shart.
- Yangi/ishonchli Telegram bot tokeni, kanal ID’si va botning kanalda admin huquqi.
- Production admin telefon raqami(lar)i va Telegram ID’lari.
- Production media uchun lokal volume yoki S3-compatible bucket tanlovi.

API endpointlar, request/response namunalari va sahifalardagi ulanishlar uchun [Frontend va backend integratsiya xaritasi](#frontend-va-backend-integratsiya-xaritasi) ga qarang. Lokal ishlab chiqish uchun ushbu README’ning yuqori qismidagi ko‘rsatmalardan foydalaning.
Xavfsizlik auditi va hozircha qolgan risklar [Xavfsizlik auditi](#xavfsizlik-auditi) bo‘limida qayd etilgan.

---

## Xavfsizlik auditi

Sana: 2026-10-23. Ko‘rib chiqilgan qismlar: Express API va auth, PostgreSQL so‘rovlari/ruxsatlar, rasm saqlash, Telegram bot, Caddy va Docker Compose. Bu kod auditi; VPS, DNS, firewall, real SMS provider va Telegram kanalida amaliy pentest o‘tkazilmadi.

### Topilgan va tuzatilgan muammolar

#### Yuqori: rasm yuklashda ruxsat tekshiruvidan oldin fayl diskka yozilgan

Avval Multer diskka yozishni e’lon egasini tekshirishdan oldin bajargan, fayl kengaytmasi esa yuboruvchi bergan `originalname`dan olingan. Bu autentifikatsiyalangan foydalanuvchiga boshqa e’lon uchun keraksiz fayl yozish va MIME turini aldab faol origin ostida noto‘g‘ri turdagi fayl saqlash imkonini berardi.

**Tuzatildi:** e’lon egasi/admin ruxsati multipart body qabul qilinishidan oldin tekshiriladi; fayllar xotirada olinadi; JPEG/PNG/WebP magic bytes tekshiriladi; kengaytma MIME ro‘yxatidan serverda belgilanadi; static public uploads o‘chirildi. Local media endpoint UUID fayl nomini tekshiradi, DB’dagi e’lon bilan bog‘liqligini tekshiradi, faqat faol e’lon rasmini ommaga beradi; qoralama/egasiga tegishli media `private, no-store` bilan qaytadi.

#### O‘rta: production’da Origin sarlavhasiz cookie bilan o‘zgarish so‘rovlari o‘tishi mumkin edi

**Tuzatildi:** production’dagi barcha `POST/PUT/PATCH/DELETE` API so‘rovlari allowlist’dagi Origin talab qiladi. Admin o‘zgarishlari faqat `ADMIN_HOST` origin’dan; production’da HTTPS bilan qabul qilinadi. Admin rasm va e’lon tahrirlash ham shu talabga bo‘ysunadi. SameSite cookie qo‘shimcha qatlam bo‘lib qoladi.

#### O‘rta: production domen va cookie konfiguratsiyasi qisman tekshirilgan

**Tuzatildi:** API ishga tushganda `SITE_DOMAIN`, `ADMIN_HOST`, `SITE_ORIGINS`, `SESSION_COOKIE_DOMAIN`, 32+ belgili `OTP_SECRET` bir-biriga mos va production origin’lari HTTPS ekanini tekshiradi. Noto‘g‘ri production konfiguratsiyada API xavfsiz sozlamasiz ishga tushmaydi.

#### Qattiqlashtirish

- API va bot Docker’da `node` foydalanuvchisida ishlaydi; upload volume shu UID uchun yaratiladi.
- API/bot root filesystem’i read-only, `/tmp` vaqtinchalik filesystem; Linux capability’lar olib tashlangan va `no-new-privileges` yoqilgan.
- PostgreSQL faqat ichki `backend` tarmog‘ida. Caddy, web, API va bot `edge` tarmog‘ida; web container DB tarmog‘iga kira olmaydi. API/bot DB va tashqi SMS/Telegram xizmatlariga kerakli ikkala tarmoqda.
- Caddy HTTPS hostlarida `nosniff`, `DENY` frame, Referrer-Policy, Permissions-Policy, HSTS va Leaflet/unpkg xaritasiga mos CSP sarlavhalarini beradi.
- End-of-life bo‘lgan Node 20 production Docker image’i Node 24 LTS’ga, eski Nginx 1.27 image’i Nginx 1.30.6’ga almashtirildi. Node release jadvalida 20.x EOL 2026-04-30, 24.x Active LTS 2028-04-30 gacha deb ko‘rsatilgan ([Node.js Release jadvali](https://github.com/nodejs/Release)). Nginx rasmiy relizlarida 2026-yil stable qatori 1.30.x ([NGINX relizlari](https://nginx.org/2026.html)).
- SQL foydalanuvchi qiymatlari parametr bilan yuboriladi; tahrirlashdagi SQL ustun nomlari koddagi allowlist’dan olinadi. E’lon egasi, admin roli va chat ishtirokchisi serverda tekshiriladi. Admin suhbatni o‘qishi alohida auditga yoziladi, lekin xabarlarning read receipt’i o‘zgarmaydi. Foydalanuvchi bloklanganda sessiyalari bekor qilinadi va OTP/bot amallari rad etiladi; admin hisobini UI’dan bloklash yoki rolini o‘zgartirish mumkin emas.
- OTP xom ko‘rinishda DB’ga yozilmaydi; HMAC hash, expiry, bir martalik ishlatish, 5 urinish, telefon bo‘yicha 5/soat va process ichida IP bo‘yicha 20/soat limit mavjud.

### Qolgan xavflar va deploy oldidan zarur choralar

1. **Secret rotatsiyasi:** Telegram bot tokeni avvalgi yozishmada ochiq ko‘rinishda yuborilgan. Uni BotFather orqali bekor qilib, yangisini faqat VPS `.env`/secret store’iga kiriting. Eski tokenni ishlatib production’ga chiqarmang. SMS token, DB parol va `OTP_SECRET` ham unikal tasodifiy qiymat bo‘lsin.
2. **Dependency advisory tekshiruvi bajarilmadi:** `npm audit --omit=dev --audit-level=high` registry DNS tarmoq cheklovi sabab `registry.npmjs.org` ga ulana olmadi. Deploy internetga chiqadigan CI/VPS’da `npm ci && npm audit --omit=dev` ni bajarib, lockfile natijasini ko‘rib chiqing; audit natijasisiz paketlar toza deb tasdiqlanmagan.
3. **Rate limit kengaytirish:** OTP IP limiti bitta process xotirasida, restart/ko‘p replica’da umumiy emas. Public contact form, e’lon qidirish, chat va upload uchun ham reverse proxy/API gateway’da IP/user limit, request size va abuse monitoring qo‘shing. Hozir API faqat OTP’ni alohida limitlaydi.
4. **Rasmni decode/re-encode qilish:** magic bytes va `nosniff` noto‘g‘ri turdagi oddiy uploadni to‘sadi, lekin to‘liq image decoder bilan qayta kodlash, maksimal piksel o‘lchami va metadata tozalash yo‘q. Public production’da image processing pipeline qo‘shish tavsiya etiladi. S3 bucket public bo‘lsa, draft URL’larini ham bucket siyosati orqali private qiling yoki signed URL ishlating.
5. **Admin MFA:** admin login hozir telefon OTP’ga tayanadi; SIM-swap/telefon raqami qayta berilishi xavfiga qarshi alohida MFA/WebAuthn va admin login audit qo‘shilmagan. Admin raqamlarini `ADMIN_PHONES`da minimal saqlang, telefon operatorida raqamni himoyalang.
6. **Monitoring va zaxira:** production’da Postgres backup/restore, disk/volume monitoring, Telegram outbox xatolari, OTP limitlar va admin audit kuzatuvini sozlang. Loglarga token, OTP, sessiya cookie yoki to‘liq shaxsiy ma’lumot yozmang.
7. **Amaliy deploy verifikatsiyasi:** ushbu muhitda Docker CLI mavjud emas va API portini sandbox ochmadi; shu sabab Compose/Caddy’ni real parse/run, file upload/authorization va Origin ssenariylarini serverda sinash imkoni bo‘lmadi. `docker compose config -q`, image build va staging smoke-test deploydan oldin bajarilishi shart.

### Tekshiruv natijalari

- `node --check` API, bot va migration fayllarida muvaffaqiyatli.
- React/Vite production build muvaffaqiyatli.
- `npm audit` registry DNS bloklangani sabab natija bermadi.
- Docker compose va real HTTP xavfsizlik ssenariylari Docker/runtime mavjud bo‘lmagani sabab tekshirilmagan.

#### VPS sozlash

Deploy buyruqlari, TLS/domain, secret va servis konfiguratsiyasi uchun [VPS deploy va production](#vps-deploy-va-production) bo‘limiga qarang.

---

## Telegram bot va kanalga e’lon chiqarish

Bot kodi `apps/api/src/bot.js`, post shablonlari `apps/api/src/channel-posts.js` ichida. Sayt, admin panel va bot bir PostgreSQL bazasidan foydalanadi. Kanalga faqat moderator `active` holatga tasdiqlagan kvartira, hovli, yer va faol auksion lotlari chiqadi. Qoralama, rad etilgan va tekshiruvdagi e’lonlar yuborilmaydi.

### ENV sozlamalari

- `TELEGRAM_BOT_TOKEN` — botning maxfiy tokeni. Faqat `.env` yoki secret store’da saqlang.
- `TELEGRAM_BOT_USERNAME=uy_joylabot` — `@` belgisiz username.
- `TELEGRAM_CHANNEL_ID=-1004331715560` — matn ko‘rinishidagi kanal ID.
- `TELEGRAM_CHANNEL_URL=https://t.me/uyjoyla_uz` va `TELEGRAM_CHANNEL_SIGNATURE` — post footer’i.
- `PUBLIC_SITE_URL` — production’dagi ommaviy HTTPS sayt manzili. `localhost` yoki private manzil bo‘lsa, kanal postida sayt tugmasi yashiriladi.
- `PUBLIC_ADMIN_URL` — production admin subdomeni.
- `DATABASE_URL` — sayt, bot va admin uchun umumiy PostgreSQL ulanishi.
- `OTP_SECRET` — kamida 32 belgili tasodifiy sir. Bo‘sh bo‘lsa, birinchi ishga tushishda kriptografik tasodifiy qiymat DB’da bir marta saqlanadi va restartda qayta yaratilmaydi.

Token va parollarni Git, README, terminal chiqishi yoki support xabarlariga kiritmang. `.env` `.gitignore` orqali e’tiborsiz qoldiriladi; `.env.example` maxfiy token yoki parol saqlamaydi.

### Kanal huquqlari va diagnostika

Bot `@uyjoyla_uz` kanalida administrator bo‘lishi va **Post Messages** huquqiga ega bo‘lishi kerak. Bot ishga tushganda `getMe`, `getChat` va `getChatMember` orqali konfiguratsiya hamda yozish huquqini tekshiradi; bu diagnostika kanalga test posti yubormaydi. Natija admin paneldagi **Ulangan xizmatlar** bo‘limida ko‘rinadi.

### Ishga tushirish

Lokal loyiha ildizida:

```sh
npm run db:migrate
npm run dev
npm run bot
```

VPS’da `.env` domenlari va production `DATABASE_URL` bilan to‘ldirilgach:

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f bot
```

Telegram polling uchun bot servisining bitta nusxasini ishlating.

### Moderatsiya, media va qayta yuborish

Admin tasdiqlashi e’lon holati va `outbox` ishini tranzaksiyada saqlaydi. Worker e’lon holatini qayta tekshirib, Telegram’ga matn, bitta rasm yoki albom chiqaradi. Albomga inline tugma ulab bo‘lmagani uchun havolalar keyingi qisqa xabarda beriladi. Har bir xabar ID’i `channel_publication_messages` va umumiy holat `channel_publications` jadvallarida saqlanadi.

Listing va kanal uchun yagona DB yozuvi, row lock va `queued` holatidan atomik claim takroriy postni to‘sadi. `429`, DNS va ulanish rad etilishi xatolari besh martagacha cheklangan backoff bilan qayta urinadi. Telegram javobi noaniq bo‘lsa (timeout, HTTP 5xx yoki worker to‘xtashi), dublikat xavfi sabab holat `unknown` bo‘ladi va avtomatik qayta yuborilmaydi. Ruxsat yoki noto‘g‘ri so‘rov xatosi `failed` bo‘lib, admin panelda oxirgi xato ko‘rsatiladi.

E’lon tugmasi loyihadagi `#/property/:id` yoki `#/auction/:id` yo‘liga boradi. Auksionning tashqi tugmasi faqat admin kiritgan HTTPS lot URL’i bo‘lsa ko‘rsatiladi. Telefon raqami faqat e’lon egasi kanal postida ochiq ko‘rsatishga rozilik berganda chiqadi. Bo‘sh maydonlar yashiriladi; sanalar `Asia/Tashkent` bo‘yicha formatlanadi.

### E’lon qidiruvi va joy bo‘yicha yaqinlik

Sayt API’si va Telegram bot bitta PostgreSQL `properties` jadvalidan foydalanadi. Kanalga post ham shu jadvaldagi moderatsiyadan o‘tgan e’londan tuziladi. Sayt va bot qidiruvi faol e’lonlarning sarlavhasi, tavsifi, hududi, manzili, mo‘ljali, qulayliklari va boshqa tavsif maydonlaridagi so‘zlarni alohida kalit sifatida qidiradi. E’lon moderatsiyadan o‘tmaguncha ommaviy qidiruvda chiqmaydi. Kanal qidiruv manbasi emas; bot ham, sayt ham e’lonlarni bazadan oladi.

`menga Krasnagorskdan uy kerak` kabi joy yaqinligini aniqlash uchun VPS’da `LOCATION_GEOCODER_URL` ga O‘zbekiston hududini qidirishni qo‘llaydigan geokoder endpointini kiriting. So‘rovdan joy nomi olinib koordinataga aylantiriladi, so‘ng e’lon kirituvchilar xaritada belgilagan koordinatalar `SEARCH_PLACE_RADIUS_KM` radiusi (standart 25 km) bo‘yicha bazada saralanadi. Geokoder sozlanmagan yoki javob bermaganida qidiruv e’lonlardagi matn bo‘yicha davom etadi; koordinatasi yo‘q e’lon uchun taxminiy nuqta yasalmaydi.
>>>>>>> 89bd3d0 (Ilk commit: loyihaning boshlang'ich kodi)
