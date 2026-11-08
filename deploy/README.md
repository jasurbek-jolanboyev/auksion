# Internetga chiqarish

Loyihada ikki tayyor variant bor. Frontend Cloudflare Pages’da, API/PostgreSQL/bot esa doimiy ishlaydigan VPS’da joylashadi. Yoki butun tizim VPS’dagi Docker Compose va Caddy bilan birgalikda ishlaydi. Faqat frontendni internetga chiqarish API, PostgreSQL, SMS va Telegram botni avtomatik joylamaydi.

## Cloudflare Pages frontend + VPS API

1. Repository’ni GitHub’dagi kerakli branch’ga push qiling.
2. Cloudflare dashboard’da **Workers & Pages → Create → Pages → Connect to Git** orqali repository’ni ulang.
3. Build command: `npm run build`. Build output directory: `apps/web/dist`. Root directory: `/`.
4. Build environment variable’larini quyidagicha sozlang:

   | Variable | Qiymat |
   | --- | --- |
   | `VITE_SITE_URL` | Saytning haqiqiy HTTPS manzili, masalan `https://uyjoyla.uz` |
   | `VITE_API_BASE_URL` | `/api/v1` |

5. Cloudflare Pages project’ning **Settings → Variables and Secrets** bo‘limida `API_ORIGIN` ni API VPS’ining HTTPS originiga o‘rnating, masalan `https://api.uyjoyla.uz`. Bu API javoblari va rasm fayllari uchun proxy manzilidir.
6. `SITE_ORIGINS` qiymatiga Pages saytining va admin saytining aniq HTTPS originlarini kiriting. `SESSION_COOKIE_DOMAIN` ikkalasiga umumiy bo‘lgan domen bo‘lishi kerak.
7. DNS’da custom domain’ni Cloudflare Pages’ga ulang. Custom domain va API HTTPS ishlayotganini tekshirib, so‘ng foydalanuvchi saytini oching.

`functions/api/[[path]].js` API so‘rovlarini, `functions/uploads/[[path]].js` rasmlarni `API_ORIGIN` ga uzatadi. Brauzer API’ni o‘z sayt domenidan ko‘radi; Express’dagi `SITE_ORIGINS` baribir to‘g‘ri bo‘lishi kerak. `wrangler.jsonc` Pages build output’ini belgilaydi. Deploy: `npm run deploy:web` (yoki Cloudflare Git integration bilan commit push).

## To‘liq VPS deploy

1. `deploy/production.env.example` ni VPS’da loyiha ildizidagi `.env` ga nusxalang. Haqiqiy domen, DB parol, kamida 32 belgili `OTP_SECRET`, admin raqamlar, Telegram token va kanal ID’sini kiriting. `.env` faylini Git’ga qo‘shmang.
2. Domen DNS yozuvlarida sayt va `ADMIN_HOST` server IP’iga yo‘naltirilgan bo‘lsin. 80 va 443 portlariga kirish ochiq bo‘lsin.
3. `npm run build` va `docker compose up -d --build` bajaring.
4. Holatni `docker compose ps` va loglarni `docker compose logs --tail=100 migrate api bot caddy` bilan tekshiring.

Caddy `SITE_DOMAIN` da foydalanuvchi frontendini, `ADMIN_HOST` da admin ilovasini beradi; `/api/*` va `/uploads/*` API’ga yo‘naltiriladi. Caddy TLS sertifikatini avtomatik oladi. PostgreSQL internet portini ochmaydi; Docker backend network ichida qoladi. Yuklangan fayllar `property-media` volume’da saqlanadi.

## Ommaga chiqishdan oldingi yakuniy sozlamalar

- Haqiqiy domain va Cloudflare/VPS akkauntiga kirish kerak. Ushbu repository o‘zi tashqi hostingda deploy bo‘lmaydi.
- Admin login uchun `ADMIN_PHONES` va ishlaydigan SMS provider sozlanadi; Telegram adminlari `ADMIN_TELEGRAM_IDS` bilan belgilanadi.
- Telegram tokenini faqat VPS secret/environment’da saqlang. Uni Pages build variable yoki frontend kodiga qo‘ymang.
- `npm run db:migrate` yangi versiya ishga tushishidan oldin ishlashi shart.
- `npm run bot` PostgreSQL va Telegram sozlamalariga muhtoj. Doimiy ishlab turishi uchun VPS/Compose’da bitta bot worker qoldiring.
