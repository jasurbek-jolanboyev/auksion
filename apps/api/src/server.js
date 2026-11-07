require('dotenv').config({path:require('node:path').resolve(__dirname,'../../../.env')});
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { z } = require('zod');
const { pool } = require('./db');
const storage = require('./storage');
const { buildPropertySearch, extractPlaceQuery } = require('./property-search');
const { geocodePlace } = require('./place-geocoder');
let runtimeOtpSecret=process.env.OTP_SECRET||'';
if(runtimeOtpSecret&&runtimeOtpSecret.length<32)throw new Error('OTP_SECRET must contain at least 32 characters.');
const otpSecretReady=(async()=>{
  if(runtimeOtpSecret)return;
  await pool.query('CREATE TABLE IF NOT EXISTS app_runtime_secrets(name text PRIMARY KEY,value text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())');
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('uyjoyla:otp-secret'))");
    let row=(await client.query("SELECT value FROM app_runtime_secrets WHERE name='otp_secret'")).rows[0];
    if(!row){const generated=crypto.randomBytes(48).toString('base64url');row=(await client.query("INSERT INTO app_runtime_secrets(name,value) VALUES('otp_secret',$1) ON CONFLICT(name) DO UPDATE SET value=app_runtime_secrets.value RETURNING value",[generated])).rows[0];}
    runtimeOtpSecret=row.value;await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
})();

const app = express();
const PORT = Number(process.env.PORT || 4100);
const API = '/api/v1';
const COOKIE = 'euylar_session';
const SESSION_DAYS = 30;
const configuredOrigins=(process.env.SITE_ORIGINS||'http://localhost:5173,http://admin.localhost:5173').split(',').map(s=>s.trim()).filter(Boolean);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const allowedOrigins = new Set(configuredOrigins);
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if ((isProd && !origin) || (origin && !allowedOrigins.has(origin))) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: 'Ushbu manbadan so‘rov qabul qilinmaydi.' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});

const fail = (res, status, error, message, details) => res.status(status).json({ error, message, ...(details ? { details } : {}) });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const otpHash = (phone, code) => {if(!runtimeOtpSecret)throw new Error('OTP signing key is not ready.');return crypto.createHmac('sha256',runtimeOtpSecret).update(`${phone}:${code}`).digest('hex')};
const isProd = process.env.NODE_ENV === 'production';
if(isProd){
  const site=process.env.SITE_DOMAIN,admin=process.env.ADMIN_HOST,cookie=(process.env.SESSION_COOKIE_DOMAIN||'').replace(/^\./,'');
  if(!site||!admin||!cookie||!process.env.SITE_ORIGINS)throw new Error('Production security configuration is incomplete.');
  const hosts=new Set();
  for(const value of configuredOrigins){let origin;try{origin=new URL(value)}catch{throw new Error('Production origin configuration is invalid.')}
    if(origin.protocol!=='https:'||origin.origin!==value||![site,admin].includes(origin.hostname))throw new Error('Production origins must be HTTPS origins for SITE_DOMAIN and ADMIN_HOST.');hosts.add(origin.hostname);
  }
  const sharesCookie=host=>host===cookie||host.endsWith(`.${cookie}`);
  if(!hosts.has(site)||!hosts.has(admin)||!sharesCookie(site)||!sharesCookie(admin))throw new Error('Production site, admin, origin and session cookie domains do not match.');
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', domain: process.env.SESSION_COOKIE_DOMAIN || undefined, maxAge: SESSION_DAYS * 86400000 });
}
async function createSession(userId, res) {
  const token = randomToken();
  await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'30 days\')', [hash(token), userId]);
  setSessionCookie(res, token);
}
const optionalUser = asyncRoute(async (req, res, next) => {
  const token = req.cookies[COOKIE];
  if (token) {
    const { rows } = await pool.query('SELECT u.id,u.name,u.phone,u.email,u.role,u.region,u.district,u.residential_address,u.contact_phone,u.blocked_at,u.blocked_reason FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(token)]);
    req.user = rows[0] || null;
  } else req.user = null;
  next();
});
const requireAuth = (req, res, next) => !req.user ? fail(res, 401, 'AUTH_REQUIRED', 'Davom etish uchun tizimga kiring.') : req.user.blocked_at ? fail(res, 403, 'ACCOUNT_BLOCKED', 'Hisobingizdan foydalanish cheklangan.') : next();
const requireAdmin = (req, res, next) => {
  if (!req.user) return fail(res, 401, 'AUTH_REQUIRED', 'Tizimga kiring.');
  if (req.user.blocked_at) return fail(res, 403, 'ACCOUNT_BLOCKED', 'Hisobingizdan foydalanish cheklangan.');
  if (req.user.role !== 'admin') return fail(res, 403, 'ADMIN_REQUIRED', 'Admin huquqi talab qilinadi.')
  next();
};
function hasAdminOrigin(req){
  const origin=req.get('origin');
  if(!origin)return false;
  try{const url=new URL(origin);return url.hostname===(process.env.ADMIN_HOST||'admin.localhost')&&(!isProd||url.protocol==='https:');}catch{return false;}
}
const adminOriginOnly = (req,res,next)=>{
  const origin=req.get('origin');
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(!origin||!hasAdminOrigin(req))return fail(res,403,'ADMIN_HOST_REQUIRED','Amalga ruxsat berilmadi.');
  next();
};
app.use(API, optionalUser);
app.use(`${API}/admin`,adminOriginOnly);
app.get('/uploads/:filename',optionalUser,asyncRoute(async(req,res,next)=>{
  const filename=req.params.filename;
  const match=filename.match(/^([0-9a-f-]{36})\.(jpg|jpeg|png|webp)$/i);
  if(!match)return fail(res,404,'NOT_FOUND','Rasm topilmadi.');
  const mediaUrl=`/uploads/${filename}`;
  const {rows}=await pool.query(`SELECT p.status FROM property_images i JOIN properties p ON p.id=i.property_id
    WHERE i.url=$1 AND (p.status='active' OR p.owner_id=$2 OR $3::boolean) LIMIT 1`,[mediaUrl,req.user?.id||null,req.user?.role==='admin']);
  if(!rows[0])return fail(res,404,'NOT_FOUND','Rasm topilmadi.');
  const contentType=match[2].toLowerCase()==='png'?'image/png':match[2].toLowerCase()==='webp'?'image/webp':'image/jpeg';
  res.type(contentType).set('X-Content-Type-Options','nosniff').set('Cache-Control',rows[0].status==='active'?'public, max-age=604800, immutable':'private, no-store');
  res.sendFile(path.join(UPLOAD_DIR,filename),err=>{if(err)next(err)});
}));

function mapProperty(row) {
  if (!row) return null;
  return {
    id: row.id, ownerId: row.owner_id, title: row.title, description: row.description,
    type: row.type, deal: row.deal, status: row.status, price: Number(row.price), currency: row.currency, priceNegotiable: row.price_negotiable===true,
    area: Number(row.area), areaUnit: row.area_unit, rooms: row.rooms,
    region: row.region, district: row.district, address: row.address, landmark: row.landmark,
    floorNumber: row.floor_number, totalFloors: row.total_floors, condition: row.condition||'', documentsInfo: row.documents_info||'',
    electricityAvailable: row.electricity_available, waterAvailable: row.water_available, gasAvailable: row.gas_available, publishPhone: row.publish_phone===true, priceNegotiable: row.price_negotiable===true,
    latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
    amenities: row.amenities || [], images: row.images || [], viewingAvailable: row.viewing_available !== false, sellerName: row.seller_name,
    rejectionReason: row.rejection_reason, createdAt: row.created_at, publishedAt: row.published_at
  };
}
const PROPERTY_SELECT = `SELECT p.*,u.name seller_name,u.phone seller_phone,
  COALESCE((SELECT json_agg(json_build_object('id',i.id,'url',i.url,'position',i.position) ORDER BY i.position)
  FROM property_images i WHERE i.property_id=p.id),'[]'::json) images
  FROM properties p JOIN users u ON u.id=p.owner_id`;
const createSchema = z.object({
  title: z.string().trim().min(3).max(50), description: z.string().trim().min(20).max(1000),
  type: z.enum(['apartment','house','land','commercial']), deal: z.enum(['sale','rent']),
  price: z.coerce.number().int().min(1).max(100000000000000), area: z.coerce.number().positive().max(10000000),
  currency: z.enum(['UZS','USD','EUR']).default('UZS'),
  areaUnit: z.enum(['m2','sotix']).default('m2'), rooms: z.union([z.coerce.number().int().min(1).max(100),z.null()]).optional(),
  region: z.string().trim().min(2).max(100), district: z.string().trim().max(100).default(''),
  address: z.string().trim().max(250).default(''), landmark: z.string().trim().max(250).default(''),
  floorNumber: z.union([z.coerce.number().int().min(0).max(200),z.null()]).optional(), totalFloors: z.union([z.coerce.number().int().min(1).max(200),z.null()]).optional(),
  condition: z.string().trim().max(100).default(''), documentsInfo: z.string().trim().max(500).default(''),
  electricityAvailable: z.boolean().nullable().optional(), waterAvailable: z.boolean().nullable().optional(), gasAvailable: z.boolean().nullable().optional(), publishPhone: z.boolean().default(false), priceNegotiable: z.boolean().default(false),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(), longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  amenities: z.array(z.string().trim().max(80)).max(40).default([]), sellerTelegram: z.string().trim().max(64).optional().nullable(),
  viewingAvailable: z.boolean().default(true),
  status: z.enum(['draft','pending']).default('pending')
});
const errorFields = parsed => parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
const postListingSchema=createSchema.extend({title:z.string().trim().min(3).max(50),description:z.string().trim().min(20).max(1000),district:z.string().trim().min(2).max(100),address:z.string().trim().min(3).max(250)});
const isHttpsUrl = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const hasCoordinatePair = (latitude, longitude) => (latitude == null && longitude == null) || (latitude != null && longitude != null);

// Database-backed phone limits cover restarts; this short IP limit also protects
// the SMS gateway when callers rotate through many phone numbers.
const otpIpWindows = new Map();
function limitOtpByIp(req,res,next){
  const now=Date.now(),key=req.ip||req.socket.remoteAddress||'unknown',windowMs=60*60*1000,max=20;
  let entry=otpIpWindows.get(key);
  if(!entry||entry.until<=now){
    if(!entry&&otpIpWindows.size>=5000)for(const [ip,value] of otpIpWindows)if(value.until<=now)otpIpWindows.delete(ip);
    if(!entry&&otpIpWindows.size>=5000)return fail(res,503,'RATE_LIMIT_CAPACITY','SMS so‘rovlari vaqtincha cheklangan. Keyinroq urinib ko‘ring.');
    entry={count:0,until:now+windowMs};otpIpWindows.set(key,entry)
  }
  entry.count++;
  if(entry.count>max){res.set('Retry-After',String(Math.ceil((entry.until-now)/1000)));return fail(res,429,'RATE_LIMITED','Ko‘p SMS so‘rovi yuborildi. Bir soatdan keyin qayta urinib ko‘ring.')}
  next();
}

app.get(`${API}/health`, asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' });
}));

// Login uses a configured SMS provider; no fixed or pretend OTP is accepted.
app.post(`${API}/auth/otp`, limitOtpByIp, asyncRoute(async (req, res) => {
  await otpSecretReady;
  const parsed = z.object({ phone: z.string().regex(/^\+998\d{9}$/) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Telefon raqamini +998XXXXXXXXX shaklida kiriting.', errorFields(parsed));
  const blocked=await pool.query('SELECT blocked_at FROM users WHERE phone=$1',[parsed.data.phone]);
  if(blocked.rows[0]?.blocked_at)return fail(res,403,'ACCOUNT_BLOCKED','Hisobingizdan foydalanish cheklangan.');
  if (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN) return fail(res, 503, 'SMS_NOT_CONFIGURED', 'Kodni yuborishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');
  const recent = await pool.query('SELECT count(*)::int count FROM otp_challenges WHERE phone=$1 AND created_at>now()-interval \'1 hour\'', [parsed.data.phone]);
  if (recent.rows[0].count >= 5) return fail(res, 429, 'RATE_LIMITED', 'SMS so‘rovlar limiti tugadi. Keyinroq urinib ko‘ring.');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const challenge = await pool.query('INSERT INTO otp_challenges(phone,code_hash,expires_at) VALUES($1,$2,now()+make_interval(secs=>$3)) RETURNING id', [parsed.data.phone, otpHash(parsed.data.phone, code), Number(process.env.OTP_TTL_SECONDS || 300)]);
  let sms;try{sms=await fetch(process.env.SMS_PROVIDER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_PROVIDER_TOKEN}` }, body: JSON.stringify({ to: parsed.data.phone, message: `e-uylar kirish kodi: ${code}` }),signal:AbortSignal.timeout(8000) });}catch{await pool.query('DELETE FROM otp_challenges WHERE id=$1',[challenge.rows[0].id]);return fail(res,502,'SMS_PROVIDER_ERROR','Kodni yuborishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');}
  if (!sms.ok) { await pool.query('DELETE FROM otp_challenges WHERE id=$1', [challenge.rows[0].id]); return fail(res, 502, 'SMS_PROVIDER_ERROR', 'Tasdiqlash xabarini yuborib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.'); }
  res.status(202).json({ challengeId: challenge.rows[0].id, expiresIn: Number(process.env.OTP_TTL_SECONDS || 300) });
}));
app.post(`${API}/auth/verify`, asyncRoute(async (req, res) => {
  await otpSecretReady;
  const parsed = z.object({ challengeId: z.string().uuid(), phone: z.string().regex(/^\+998\d{9}$/), code: z.string().regex(/^\d{6}$/), name: z.string().trim().min(2).max(100).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Kiritilgan ma’lumotlarni tekshiring.', errorFields(parsed));
  const c = await pool.query('SELECT * FROM otp_challenges WHERE id=$1 AND phone=$2', [parsed.data.challengeId, parsed.data.phone]);
  const row = c.rows[0];
  if (!row || row.used_at || row.expires_at < new Date() || row.attempts >= 5) return fail(res, 400, 'OTP_EXPIRED', 'Kod yaroqsiz yoki muddati tugagan.');
  const submittedHash=Buffer.from(otpHash(parsed.data.phone,parsed.data.code));
  if (!crypto.timingSafeEqual(Buffer.from(row.code_hash), submittedHash)) { await pool.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1 AND used_at IS NULL AND expires_at>now() AND attempts<5', [row.id]); return fail(res, 400, 'OTP_INVALID', 'Tasdiqlash kodi noto‘g‘ri.'); }
  const consumed=await pool.query('UPDATE otp_challenges SET used_at=now() WHERE id=$1 AND phone=$2 AND used_at IS NULL AND expires_at>now() AND attempts<5 AND code_hash=$3 RETURNING id',[row.id,parsed.data.phone,otpHash(parsed.data.phone,parsed.data.code)]);
  if(!consumed.rowCount)return fail(res,400,'OTP_EXPIRED','Kod ishlatilgan yoki muddati tugagan.');
  const admins = (process.env.ADMIN_PHONES || '').split(',').map(x => x.trim());
  const user = await pool.query(`INSERT INTO users(phone,name,role) VALUES($1,$2,$3)
    ON CONFLICT(phone) DO UPDATE SET name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE users.name END,
    role=CASE WHEN users.role='admin' OR excluded.role='admin' THEN 'admin' ELSE 'user' END,updated_at=now()
    RETURNING id,name,phone,email,role,region,blocked_at`, [parsed.data.phone, parsed.data.name || '', admins.includes(parsed.data.phone) ? 'admin' : 'user']);
  if(user.rows[0].blocked_at)return fail(res,403,'ACCOUNT_BLOCKED','Hisobingizdan foydalanish cheklangan.');
  await createSession(user.rows[0].id, res); res.json({ user: user.rows[0] });
}));
app.post(`${API}/auth/logout`, requireAuth, asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash(req.cookies[COOKIE] || '')]); res.clearCookie(COOKIE, { path: '/', domain: process.env.SESSION_COOKIE_DOMAIN || undefined }); res.json({ ok: true });
}));
app.post(`${API}/auth/telegram`, asyncRoute(async (req, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) return fail(res, 503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram orqali kirish sozlanmagan.');
  const parsed = z.object({ initData: z.string().min(1).max(10000) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Telegram WebApp ma’lumoti topilmadi.');
  const params = new URLSearchParams(parsed.data.initData); const hashValue = params.get('hash'); params.delete('hash');
  const dataCheck = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  const authDate = Number(params.get('auth_date'));
  if (!/^[0-9a-f]{64}$/i.test(hashValue||'') || !crypto.timingSafeEqual(Buffer.from(hashValue), Buffer.from(expected)) || !authDate || Date.now()/1000-authDate > 86400) return fail(res, 401, 'TELEGRAM_AUTH_INVALID', 'Telegram sessiyasi yaroqsiz yoki eskirgan.');
  const tg = JSON.parse(params.get('user') || '{}');
  if (!tg.id) return fail(res, 401, 'TELEGRAM_USER_MISSING', 'Telegram foydalanuvchisi aniqlanmadi.');
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(x => x.trim());
  const user = await pool.query(`INSERT INTO users(telegram_id,name,role) VALUES($1,$2,$3)
    ON CONFLICT(telegram_id) DO UPDATE SET name=excluded.name,role=CASE WHEN users.role='admin' OR excluded.role='admin' THEN 'admin' ELSE 'user' END,updated_at=now()
    RETURNING id,name,phone,email,role,region`, [tg.id, [tg.first_name,tg.last_name].filter(Boolean).join(' '), admins.includes(String(tg.id)) ? 'admin' : 'user']);
  await createSession(user.rows[0].id, res); res.json({ user: user.rows[0] });
}));

app.get(`${API}/bootstrap`, asyncRoute(async (req, res) => {
  if (!req.user) return res.json({ user: null, favorites: [], notifications: [] });
  const [fav, notifications] = await Promise.all([
    pool.query('SELECT property_id FROM favorites WHERE user_id=$1', [req.user.id]),
    pool.query('SELECT id,title,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id])
  ]);
  res.json({ user: req.user, favorites: fav.rows.map(r => r.property_id), notifications: notifications.rows });
}));
app.get(`${API}/me`, requireAuth, (req, res) => res.json({ user: req.user }));
app.get(`${API}/me/properties`, requireAuth, asyncRoute(async(req,res)=>{const {rows}=await pool.query(`${PROPERTY_SELECT} WHERE p.owner_id=$1 ORDER BY p.created_at DESC`,[req.user.id]);res.json({items:rows.map(mapProperty)});}));
app.patch(`${API}/me`, requireAuth, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().max(254).optional().or(z.literal('')), region: z.string().trim().min(2).max(100), district: z.string().trim().max(100).default(''), residentialAddress: z.string().trim().max(250).default(''), contactPhone: z.string().regex(/^\+998\d{9}$/).or(z.literal('')).default('') }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 'VALIDATION_ERROR', 'Profil ma’lumotlarini tekshiring.', errorFields(parsed));
  const { rows } = await pool.query('UPDATE users SET name=$2,email=NULLIF($3,\'\'),region=$4,district=$5,residential_address=$6,contact_phone=$7,updated_at=now() WHERE id=$1 RETURNING id,name,phone,email,role,region,district,residential_address,contact_phone', [req.user.id, parsed.data.name, parsed.data.email || '', parsed.data.region, parsed.data.district, parsed.data.residentialAddress, parsed.data.contactPhone]);
  res.json({ user: rows[0] });
}));

// Map results are public listings with seller-supplied WGS84 coordinates only.
app.get(`${API}/properties/map`, asyncRoute(async (req, res) => {
  const p=req.query, values=[], where=["p.status='active'",'p.latitude IS NOT NULL','p.longitude IS NOT NULL'];
  const add=(sql,v)=>{values.push(v);where.push(sql.replace('?',`$${values.length}`));};
  if(p.west!==undefined&&p.south!==undefined&&p.east!==undefined&&p.north!==undefined){
    const b=[p.west,p.south,p.east,p.north].map(Number);
    if(b.some(x=>!Number.isFinite(x))||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90||b[0]>b[2]||b[1]>b[3])return fail(res,422,'INVALID_BOUNDS','Xarita chegaralari noto‘g‘ri.');
    add('p.longitude>=?',b[0]);add('p.latitude>=?',b[1]);add('p.longitude<=?',b[2]);add('p.latitude<=?',b[3]);
  }
  if(p.region){const region=String(p.region).slice(0,100).replace(/[%_]/g,'');if(region==='Toshkent shahri'){values.push('%Toshkent shahri%','Toshkent');where.push(`(p.region ILIKE $${values.length-1} OR p.region=$${values.length})`)}else add('p.region ILIKE ?',`%${region}%`)}
  if(p.district)add('p.district ILIKE ?',`%${String(p.district).slice(0,100).replace(/[%_]/g,'')}%`);
  if(['apartment','house','land','commercial'].includes(p.type))add('p.type=?',p.type);
  if(['sale','rent'].includes(p.deal))add('p.deal=?',p.deal);
  let mapDistanceOrder='';
  if(p.lat!==undefined||p.lng!==undefined){
    const lat=Number(p.lat),lng=Number(p.lng),radius=Number(p.radiusKm||25);
    if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lng)||lng < -180||lng>180||!Number.isFinite(radius)||radius<=0||radius>500)return fail(res,422,'INVALID_GEO_FILTER','Joylashuv yoki radius qiymati noto‘g‘ri.');
    const a=values.push(lat),o=values.push(lng),r=values.push(radius);
    const distance=`(6371 * acos(LEAST(1,GREATEST(-1,cos(radians($${a}))*cos(radians(p.latitude))*cos(radians(p.longitude)-radians($${o}))+sin(radians($${a}))*sin(radians(p.latitude))))))`;
    where.push(`p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ${distance} <= $${r}`);
    mapDistanceOrder=distance;
  }
  const {rows}=await pool.query(`${PROPERTY_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${mapDistanceOrder||'p.published_at DESC'} LIMIT 500`,values);
  res.json({items:rows.map(mapProperty),total:rows.length,limit:500,coordinates:'WGS84'});
}));

app.get(`${API}/properties`, asyncRoute(async (req, res) => {
  const p = req.query; const values = []; const where = ["p.status='active'"];
  const add = (sql, v) => { values.push(v); where.push(sql.replace('?', `$${values.length}`)); };
  let searchRank='0',searchCondition='';
  if (p.q) {const search=buildPropertySearch(String(p.q).slice(0,120),{startIndex:values.length});if(search.condition){values.push(...search.values);searchCondition=search.condition;where.push(search.condition);searchRank=search.rank;}}
  if (['apartment','house','land','commercial'].includes(p.type)) add('p.type=?',p.type);
  if (['sale','rent'].includes(p.deal)) add('p.deal=?',p.deal);
  if (p.region) {const region=String(p.region).slice(0,100).replace(/[%_]/g,'');if(region==='Toshkent shahri'){values.push('%Toshkent shahri%','Toshkent');where.push(`(p.region ILIKE $${values.length-1} OR p.region=$${values.length})`)}else add('p.region ILIKE ?',`%${region}%`)}
  if (p.district) add('p.district ILIKE ?',`%${String(p.district).slice(0,100)}%`);
  if (p.minPrice && Number.isFinite(+p.minPrice)) add('p.price>=?',Math.max(0,+p.minPrice));
  if (p.maxPrice && Number.isFinite(+p.maxPrice)) add('p.price<=?',Math.max(0,+p.maxPrice));
  if (p.rooms && Number.isFinite(+p.rooms)) add('p.rooms=?',+p.rooms);
  let distanceExpr='';
  if(p.q&&p.lat===undefined&&p.lng===undefined){const place=extractPlaceQuery(String(p.q).slice(0,120)),point=place?await geocodePlace(place):null;if(point){const latIndex=values.push(point.lat),lngIndex=values.push(point.lng),radiusIndex=values.push(Math.max(1,Math.min(100,Number(process.env.SEARCH_PLACE_RADIUS_KM)||25)));distanceExpr=`(6371 * acos(LEAST(1,GREATEST(-1,cos(radians($${latIndex}))*cos(radians(p.latitude))*cos(radians(p.longitude)-radians($${lngIndex}))+sin(radians($${latIndex}))*sin(radians(p.latitude))))))`;const placeCondition=`(p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ${distanceExpr}<=$${radiusIndex})`;const index=where.indexOf(searchCondition);if(index>=0)where[index]=`(${searchCondition} OR ${placeCondition})`;else where.push(placeCondition);}}
  if(p.lat!==undefined||p.lng!==undefined||p.radiusKm!==undefined){
    const lat=Number(p.lat),lng=Number(p.lng),radius=Number(p.radiusKm||25);
    if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lng)||lng < -180||lng>180||!Number.isFinite(radius)||radius<=0||radius>500)
      return fail(res,422,'INVALID_GEO_FILTER','Joylashuv koordinatasi yoki masofa noto‘g‘ri.');
    const latIndex=values.push(lat),lngIndex=values.push(lng),radiusIndex=values.push(radius);
    distanceExpr=`(6371 * acos(LEAST(1,GREATEST(-1,cos(radians($${latIndex}))*cos(radians(p.latitude))*cos(radians(p.longitude)-radians($${lngIndex}))+sin(radians($${latIndex}))*sin(radians(p.latitude))))))`;
    where.push(`p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND ${distanceExpr} <= $${radiusIndex}`);
  }
  const page = Math.max(1,Math.min(10000,+p.page||1)), pageSize=Math.max(1,Math.min(48,+p.pageSize||12));
  const sortOrder=distanceExpr?`${distanceExpr} ASC`:(({price_asc:'p.price ASC',price_desc:'p.price DESC',area:'p.area DESC',oldest:'p.published_at ASC'})[p.sort]||'p.published_at DESC');
  const order=p.q?`${searchRank} DESC, ${sortOrder}`:sortOrder;
  const baseWhere = where.join(' AND '); const count=await pool.query(`SELECT count(*)::int total FROM properties p WHERE ${baseWhere}`,values);
  const queryValues=[...values,pageSize,(page-1)*pageSize];
  const result=await pool.query(`${PROPERTY_SELECT} WHERE ${baseWhere} ORDER BY ${order} LIMIT $${values.length+1} OFFSET $${values.length+2}`,queryValues);
  res.json({items:result.rows.map(mapProperty),total:count.rows[0].total,page,pageSize});
}));
app.get(`${API}/share/properties/:id`,asyncRoute(async(req,res)=>{
  const id=z.string().uuid().safeParse(req.params.id);if(!id.success)return res.status(404).type('html').send('E’lon topilmadi.');
  const {rows}=await pool.query(`SELECT p.id,p.title,p.description,p.price,p.currency,p.area,p.area_unit,p.region,p.district,
    (SELECT i.url FROM property_images i WHERE i.property_id=p.id ORDER BY i.position LIMIT 1) image_url
    FROM properties p WHERE p.id=$1 AND p.status='active'`,[id.data]);
  if(!rows[0])return res.status(404).type('html').send('E’lon topilmadi.');
  const p=rows[0],site=(process.env.PUBLIC_SITE_URL||'').replace(/\/$/,''),shareUrl=`${site}/api/v1/share/properties/${p.id}`,targetUrl=`${site}/#/property/${p.id}`;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const title=`${p.title} — e-uylar`,description=[p.region,p.district,`${Number(p.area)} ${p.area_unit==='sotix'?'sotix':'m²'}`,`${Number(p.price).toLocaleString('uz-UZ')} so‘m`,p.description].filter(Boolean).join(' · ').slice(0,300);
  const image=p.image_url?(p.image_url.startsWith('http')?p.image_url:`${site}${p.image_url.startsWith('/')?'':'/'}${p.image_url}`):'';
  res.set('Cache-Control','public, max-age=300, s-maxage=300').set('X-Content-Type-Options','nosniff').type('html').send(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(shareUrl)}"><meta property="og:type" content="product"><meta property="og:site_name" content="e-uylar"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(shareUrl)}">${image?`<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${escapeHtml(image)}">`:''}<meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}"><script>location.replace(${JSON.stringify(targetUrl)})</script></head><body><a href="${escapeHtml(targetUrl)}">E’lonni e-uylar’da ko‘rish</a></body></html>`);
}));
app.get(`${API}/properties/:id`, asyncRoute(async (req,res)=>{
  const {rows}=await pool.query(`${PROPERTY_SELECT} WHERE p.id=$1 AND (p.status='active' OR p.owner_id=$2 OR $3::boolean)`,[req.params.id,req.user?.id||null,req.user?.role==='admin']);
  if(!rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');
  const item=mapProperty(rows[0]);
  const related=await pool.query(`${PROPERTY_SELECT} WHERE p.status='active' AND p.id<>$1 AND p.type=$2 ORDER BY p.published_at DESC LIMIT 4`,[item.id,item.type]);
  res.json({property:item,related:related.rows.map(mapProperty)});
}));
app.get(`${API}/sellers/:id`,asyncRoute(async(req,res)=>{const seller=await pool.query('SELECT id,name,region,created_at FROM users WHERE id=$1',[req.params.id]);if(!seller.rows[0])return fail(res,404,'NOT_FOUND','Sotuvchi topilmadi.');const {rows}=await pool.query(`${PROPERTY_SELECT} WHERE p.owner_id=$1 AND p.status='active' ORDER BY p.published_at DESC LIMIT 48`,[req.params.id]);res.json({seller:seller.rows[0],items:rows.map(mapProperty)});}));
app.post(`${API}/properties`, requireAuth, asyncRoute(async(req,res)=>{
  const parsed=createSchema.safeParse(req.body); if(!parsed.success)return fail(res,422,'VALIDATION_ERROR','E’lon maydonlarini tekshiring.',errorFields(parsed));
  if(!hasCoordinatePair(parsed.data.latitude,parsed.data.longitude))return fail(res,422,'VALIDATION_ERROR','Xaritadagi kenglik va uzunlikni birga kiriting.');
  const d=parsed.data; const {rows}=await pool.query(`INSERT INTO properties(owner_id,title,description,type,deal,price,area,area_unit,rooms,region,district,address,landmark,latitude,longitude,amenities,seller_telegram,viewing_available,status,floor_number,total_floors,condition,documents_info,electricity_available,water_available,gas_available,publish_phone,currency,price_negotiable)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING *`,[req.user.id,d.title,d.description,d.type,d.deal,d.price,d.area,d.areaUnit,d.rooms||null,d.region,d.district,d.address,d.landmark,d.latitude??null,d.longitude??null,JSON.stringify(d.amenities),d.sellerTelegram||null,d.viewingAvailable,d.status,d.floorNumber??null,d.totalFloors??null,d.condition,d.documentsInfo,d.electricityAvailable??null,d.waterAvailable??null,d.gasAvailable??null,d.publishPhone,d.currency,d.priceNegotiable]);
  if(d.status==='pending')await pool.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',[req.user.id,'E’lon tekshiruvga yuborildi','Tekshiruv yakunlangach, natija haqida xabar beramiz.']);
  res.status(201).json({property:mapProperty(rows[0])});
}));
app.patch(`${API}/properties/:id`, requireAuth, asyncRoute(async(req,res)=>{
  const parsed=createSchema.partial().safeParse(req.body); if(!parsed.success)return fail(res,422,'VALIDATION_ERROR','E’lon maydonlarini tekshiring.',errorFields(parsed));
  const existing=await pool.query('SELECT id,owner_id,status,latitude,longitude FROM properties WHERE id=$1',[req.params.id]);
  if(!existing.rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');
  if(existing.rows[0].owner_id!==req.user.id && req.user.role!=='admin')return fail(res,403,'FORBIDDEN','Bu e’lonni tahrirlash huquqi yo‘q.');
  if(req.user.role==='admin'&&!hasAdminOrigin(req))return fail(res,403,'ADMIN_HOST_REQUIRED','Amalga ruxsat berilmadi.');
  if(!hasCoordinatePair(Object.hasOwn(parsed.data,'latitude')?parsed.data.latitude:existing.rows[0].latitude,Object.hasOwn(parsed.data,'longitude')?parsed.data.longitude:existing.rows[0].longitude))return fail(res,422,'VALIDATION_ERROR','Xaritadagi kenglik va uzunlikni birga kiriting.');
  const d=parsed.data; const columns={title:'title',description:'description',type:'type',deal:'deal',price:'price',currency:'currency',priceNegotiable:'price_negotiable',area:'area',areaUnit:'area_unit',rooms:'rooms',region:'region',district:'district',address:'address',landmark:'landmark',latitude:'latitude',longitude:'longitude',amenities:'amenities',sellerTelegram:'seller_telegram',viewingAvailable:'viewing_available',floorNumber:'floor_number',totalFloors:'total_floors',condition:'condition',documentsInfo:'documents_info',electricityAvailable:'electricity_available',waterAvailable:'water_available',gasAvailable:'gas_available',publishPhone:'publish_phone'};
  const sets=[],values=[]; for(const [key,col] of Object.entries(columns))if(Object.hasOwn(d,key)){values.push(key==='amenities'?JSON.stringify(d[key]):d[key]);sets.push(`${col}=$${values.length}${key==='amenities'?'::jsonb':''}`)}
  if(!sets.length)return fail(res,422,'VALIDATION_ERROR','O‘zgarish topilmadi.');
  values.push(req.params.id);const client=await pool.connect();let updated;
  try{await client.query('BEGIN');const {rows}=await client.query(`UPDATE properties SET ${sets.join(',')},status='pending',rejection_reason=NULL,updated_at=now() WHERE id=$${values.length} RETURNING *`,values);if(!rows[0]){await client.query('ROLLBACK');return fail(res,404,'NOT_FOUND','E’lon topilmadi.');}updated=rows[0];if(existing.rows[0].status==='active')await client.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('property.archived',$1,$2)",[req.params.id,JSON.stringify({propertyId:req.params.id,reason:'property edited; awaiting moderation'})]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  res.json({property:mapProperty(updated)});
}));

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||12)*1024*1024,files:12,fields:8,parts:20,fieldSize:4096},fileFilter:(_req,file,cb)=>['image/jpeg','image/png','image/webp'].includes(file.mimetype)?cb(null,true):cb(Object.assign(new Error('Faqat JPEG, PNG yoki WebP rasm yuklang.'),{code:'UNSUPPORTED_MEDIA'}))});
const listingUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:16*1024*1024,files:10,fields:2,parts:12,fieldSize:20000},fileFilter:(_req,file,cb)=>['image/jpeg','image/png'].includes(file.mimetype)?cb(null,true):cb(Object.assign(new Error('E’lon uchun JPG yoki PNG rasm yuklang.'),{code:'UNSUPPORTED_MEDIA'}))});
const documentUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1,fields:2,parts:3,fieldSize:1024},fileFilter:(_req,file,cb)=>file.mimetype==='application/pdf'?cb(null,true):cb(Object.assign(new Error('Auksion hujjati PDF formatida bo‘lishi kerak.'),{code:'UNSUPPORTED_DOCUMENT'}))});
function imageDimensions(file){const b=file.buffer;if(file.mimetype==='image/png'&&b.length>=24)return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};if(file.mimetype==='image/jpeg'&&b.length>=4){let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue}while(b[i]===0xff)i++;const marker=b[i++];if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(i+2>b.length)break;const length=b.readUInt16BE(i);if(length<2||i+length>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return{height:b.readUInt16BE(i+3),width:b.readUInt16BE(i+5)};i+=length}}return null}
app.post(`${API}/properties/with-images`,requireAuth,listingUpload.array('images',10),asyncRoute(async(req,res)=>{
  let payload;try{payload=JSON.parse(req.body.listing||'')}catch{return fail(res,400,'INVALID_LISTING','E’lon ma’lumotlarini qayta tekshiring.')}
  const parsed=postListingSchema.safeParse(payload);
  if(!parsed.success)return fail(res,422,'VALIDATION_ERROR','E’lon maydonlarini tekshiring.',errorFields(parsed));
  const files=req.files||[];if(files.length<1||files.length>10)return fail(res,422,'IMAGE_COUNT','1 tadan 10 tagacha rasm qo‘shing.');
  for(const file of files){if(!storage.validateImage(file))return fail(res,415,'UNSUPPORTED_MEDIA','Rasm fayli buzilgan yoki formati noto‘g‘ri.');const size=imageDimensions(file);if(!size||size.width<300||size.height<300)return fail(res,422,'IMAGE_DIMENSIONS','Rasmlar kamida 300 × 300 piksel bo‘lishi kerak.')}
  const d=parsed.data;if(!hasCoordinatePair(d.latitude,d.longitude))return fail(res,422,'INVALID_COORDINATES','Xaritadagi joylashuvni tekshiring.');if(d.status==='pending'&&(d.latitude==null||d.longitude==null))return fail(res,422,'LOCATION_REQUIRED','E’lonni yuborishdan oldin xaritadan uchrashuv joyini belgilang.');
  const saved=[];let client,committed=false;
  try{
    for(const file of files)saved.push(await storage.save(file));
    client=await pool.connect();await client.query('BEGIN');
    const {rows}=await client.query(`INSERT INTO properties(owner_id,title,description,type,deal,price,area,area_unit,rooms,region,district,address,landmark,latitude,longitude,amenities,seller_telegram,viewing_available,status,floor_number,total_floors,condition,documents_info,electricity_available,water_available,gas_available,publish_phone,currency,price_negotiable) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING *`,[req.user.id,d.title,d.description,d.type,d.deal,d.price,d.area,d.areaUnit,d.rooms||null,d.region,d.district,d.address,d.landmark,d.latitude??null,d.longitude??null,JSON.stringify(d.amenities),d.sellerTelegram||null,d.viewingAvailable,d.status,d.floorNumber??null,d.totalFloors??null,d.condition,d.documentsInfo,d.electricityAvailable??null,d.waterAvailable??null,d.gasAvailable??null,d.publishPhone,d.currency,d.priceNegotiable]);
    for(let i=0;i<saved.length;i++)await client.query('INSERT INTO property_images(property_id,url,position) VALUES($1,$2,$3)',[rows[0].id,saved[i],i]);
    if(d.status==='pending')await client.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',[req.user.id,'E’lon tekshiruvga yuborildi','Tekshiruv yakunlangach, natija haqida xabar beramiz.']);
    const result=await client.query(`${PROPERTY_SELECT} WHERE p.id=$1`,[rows[0].id]);await client.query('COMMIT');committed=true;res.status(201).json({property:mapProperty(result.rows[0])});
  }catch(error){if(client&&!committed)await client.query('ROLLBACK').catch(()=>{});if(!committed)await Promise.all(saved.map(url=>storage.deleteImage(url).catch(()=>{})));throw error}finally{client?.release()}
}));
const authorizePropertyImageUpload=asyncRoute(async(req,res,next)=>{
  const own=await pool.query('SELECT owner_id FROM properties WHERE id=$1',[req.params.id]);
  if(!own.rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');
  if(own.rows[0].owner_id!==req.user.id && req.user.role!=='admin')return fail(res,403,'FORBIDDEN','Rasm yuklash huquqi yo‘q.');
  if(req.user.role==='admin'&&!hasAdminOrigin(req))return fail(res,403,'ADMIN_HOST_REQUIRED','Amalga ruxsat berilmadi.');
  next();
});
app.post(`${API}/properties/:id/images`, requireAuth, authorizePropertyImageUpload, upload.array('images',12), asyncRoute(async(req,res)=>{
  for(const file of req.files||[])if(!storage.validateImage(file))return fail(res,415,'UNSUPPORTED_MEDIA','Rasm fayli buzilgan yoki formati noto‘g‘ri.');
  const images=[]; for(const file of req.files||[]){const url=await storage.save(file);const {rows}=await pool.query('INSERT INTO property_images(property_id,url,position) VALUES($1,$2,(SELECT count(*) FROM property_images WHERE property_id=$1)) RETURNING id,url,position',[req.params.id,url]);images.push(rows[0]);}
  res.status(201).json({images});
}));
app.get(`${API}/properties/:id/contact`, requireAuth, asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT u.phone,u.telegram_id,p.seller_telegram FROM properties p JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND p.status='active'`,[req.params.id]);
  if(!rows[0])return fail(res,404,'NOT_FOUND','Ommaga ochiq e’lon topilmadi.');
  const telegram=rows[0].seller_telegram||'';
  res.json({phone:rows[0].phone||null,telegram:/^@?[A-Za-z0-9_]{5,32}$/.test(telegram)?telegram:null});
}));
app.put(`${API}/me/favorites/:id`,requireAuth,asyncRoute(async(req,res)=>{const check=await pool.query("SELECT id FROM properties WHERE id=$1 AND status='active'",[req.params.id]);if(!check.rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');await pool.query('INSERT INTO favorites(user_id,property_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);res.json({saved:true});}));
app.delete(`${API}/me/favorites/:id`,requireAuth,asyncRoute(async(req,res)=>{await pool.query('DELETE FROM favorites WHERE user_id=$1 AND property_id=$2',[req.user.id,req.params.id]);res.json({saved:false});}));
app.get(`${API}/me/favorites`,requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query(`${PROPERTY_SELECT} JOIN favorites f ON f.property_id=p.id WHERE f.user_id=$1 AND p.status='active' ORDER BY f.created_at DESC`,[req.user.id]);res.json({items:rows.map(mapProperty)});}));
app.post(`${API}/me/saved-searches`,requireAuth,asyncRoute(async(req,res)=>{const s=z.object({name:z.string().trim().min(1).max(100),filters:z.record(z.any())}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Qidiruv nomi va filtrlari kerak.');const {rows}=await pool.query('INSERT INTO saved_searches(user_id,name,filters) VALUES($1,$2,$3) RETURNING *',[req.user.id,s.data.name,JSON.stringify(s.data.filters)]);res.status(201).json({item:rows[0]});}));
app.get(`${API}/me/saved-searches`,requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM saved_searches WHERE user_id=$1 ORDER BY created_at DESC',[req.user.id]);res.json({items:rows});}));

app.post(`${API}/conversations`,requireAuth,asyncRoute(async(req,res)=>{const s=z.object({propertyId:z.string().uuid()}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','E’lon identifikatori noto‘g‘ri.');const p=await pool.query("SELECT owner_id FROM properties WHERE id=$1 AND status='active'",[s.data.propertyId]);if(!p.rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');if(p.rows[0].owner_id===req.user.id)return fail(res,409,'SELF_CONTACT','O‘z e’loningizga murojaat qilib bo‘lmaydi.');const {rows}=await pool.query('INSERT INTO conversations(property_id,buyer_id,seller_id) VALUES($1,$2,$3) ON CONFLICT(property_id,buyer_id) DO UPDATE SET property_id=excluded.property_id RETURNING *',[s.data.propertyId,req.user.id,p.rows[0].owner_id]);res.status(201).json({conversation:rows[0]});}));
app.get(`${API}/conversations`,requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT c.*,p.title property_title,CASE WHEN c.buyer_id=$1 THEN s.name ELSE b.name END other_name,
 (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,
 (SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) last_message_at,
 (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL) unread_count
 FROM conversations c JOIN properties p ON p.id=c.property_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id
 WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY COALESCE((SELECT created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1),c.created_at) DESC`,[req.user.id]);res.json({items:rows});}));
app.get(`${API}/conversations/:id/messages`,requireAuth,asyncRoute(async(req,res)=>{const c=await pool.query('SELECT id FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',[req.params.id,req.user.id]);if(!c.rows[0])return fail(res,404,'NOT_FOUND','Suhbat topilmadi.');await pool.query('UPDATE messages SET read_at=now() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL',[req.params.id,req.user.id]);const {rows}=await pool.query('SELECT id,sender_id,body,created_at,read_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT 500',[req.params.id]);res.json({items:rows});}));
app.post(`${API}/conversations/:id/messages`,requireAuth,asyncRoute(async(req,res)=>{const s=z.object({text:z.string().trim().min(1).max(4000)}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Xabar matnini tekshiring.');const c=await pool.query('SELECT * FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',[req.params.id,req.user.id]);if(!c.rows[0])return fail(res,404,'NOT_FOUND','Suhbat topilmadi.');const {rows}=await pool.query('INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING *',[req.params.id,req.user.id,s.data.text]);const receiver=c.rows[0].buyer_id===req.user.id?c.rows[0].seller_id:c.rows[0].buyer_id;await pool.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',[receiver,'Yangi xabar',s.data.text.slice(0,180)]);res.status(201).json({message:rows[0]});}));
app.post(`${API}/properties/:id/viewings`,requireAuth,asyncRoute(async(req,res)=>{const s=z.object({requestedAt:z.string().datetime(),note:z.string().max(1000).default('')}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Sana va izohni tekshiring.',errorFields(s));const p=await pool.query("SELECT owner_id FROM properties WHERE id=$1 AND status='active'",[req.params.id]);if(!p.rows[0])return fail(res,404,'NOT_FOUND','E’lon topilmadi.');const {rows}=await pool.query('INSERT INTO viewing_requests(property_id,requester_id,requested_at,note) VALUES($1,$2,$3,$4) RETURNING *',[req.params.id,req.user.id,s.data.requestedAt,s.data.note]);await pool.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',[p.rows[0].owner_id,'Ko‘rish so‘rovi',`${req.user.name} mulkni ko‘rish vaqtini kelishmoqchi.`]);res.status(201).json({request:rows[0]});}));
app.post(`${API}/properties/:id/reports`,requireAuth,asyncRoute(async(req,res)=>{const s=z.object({reason:z.string().trim().min(3).max(100),details:z.string().trim().max(2000).default('')}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Shikoyat ma’lumotlarini tekshiring.');const {rows}=await pool.query('INSERT INTO reports(property_id,reporter_id,reason,details) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',[req.params.id,req.user.id,s.data.reason,s.data.details]);res.status(201).json({report:rows[0]});}));

app.get(`${API}/projects`,asyncRoute(async(_req,res)=>{const {rows}=await pool.query("SELECT * FROM projects WHERE status='active' ORDER BY created_at DESC");res.json({items:rows});}));
app.get(`${API}/lots`,asyncRoute(async(_req,res)=>{const {rows}=await pool.query("SELECT * FROM auction_lots WHERE status='active' ORDER BY deadline ASC NULLS LAST");res.json({items:rows});}));
app.get(`${API}/lots/:id`,asyncRoute(async(req,res)=>{const {rows}=await pool.query("SELECT * FROM auction_lots WHERE id=$1 AND status='active'",[req.params.id]);if(!rows[0])return fail(res,404,'NOT_FOUND','Lot topilmadi.');res.json({lot:rows[0]});}));
app.post(`${API}/lots/:id/applications`,requireAuth,asyncRoute(async(req,res)=>{const lot=await pool.query("SELECT id FROM auction_lots WHERE id=$1 AND status='active' AND (deadline IS NULL OR deadline>now())",[req.params.id]);if(!lot.rows[0])return fail(res,409,'LOT_CLOSED','Lot ariza uchun yopiq.');try{const {rows}=await pool.query('INSERT INTO auction_applications(lot_id,user_id,payload) VALUES($1,$2,$3) RETURNING *',[req.params.id,req.user.id,JSON.stringify(req.body||{})]);res.status(201).json({application:rows[0]});}catch(e){if(e.code==='23505')return fail(res,409,'ALREADY_APPLIED','Bu lot uchun ariza avval yuborilgan.');throw e;}}));
app.get(`${API}/me/notifications`,requireAuth,asyncRoute(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id]);res.json({items:rows});}));
app.patch(`${API}/me/notifications/:id/read`,requireAuth,asyncRoute(async(req,res)=>{const {rowCount}=await pool.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!rowCount)return fail(res,404,'NOT_FOUND','Bildirishnoma topilmadi.');res.json({ok:true});}));
app.post(`${API}/contact-requests`,asyncRoute(async(req,res)=>{const s=z.object({name:z.string().trim().min(2).max(100),email:z.string().email().max(254).optional().or(z.literal('')),phone:z.string().max(20).optional(),telegramUsername:z.string().trim().max(33).optional().default(''),message:z.string().trim().min(10).max(5000),type:z.enum(['general','suggestion','partnership']).default('general')}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Murojaat maydonlarini tekshiring.',errorFields(s));const telegramUsername=s.data.telegramUsername.replace(/^@/,'');if(telegramUsername&&!/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername))return fail(res,422,'VALIDATION_ERROR','Telegram username’ni tekshiring.',{telegramUsername:['@ bilan yozing, kamida 5 ta belgi kiriting.']});if(['suggestion','partnership'].includes(s.data.type)&&!telegramUsername)return fail(res,422,'VALIDATION_ERROR','Telegram username’ni kiriting.',{telegramUsername:['Telegram username majburiy.']});const {rows}=await pool.query('INSERT INTO contact_requests(name,email,phone,telegram_username,message,request_type) VALUES($1,NULLIF($2,\'\'),$3,NULLIF($4,\'\'),$5,$6) RETURNING id,status,request_type,created_at',[s.data.name,s.data.email||'',s.data.phone||'',telegramUsername,s.data.message,s.data.type]);res.status(201).json({request:rows[0]});}));

app.get(`${API}/admin/overview`,requireAdmin,asyncRoute(async(_req,res)=>{const [props,reports,contacts,users,chats,viewings,applications,projects,lots]=await Promise.all([pool.query(`SELECT count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='active')::int active,count(*) FILTER(WHERE status='rejected')::int rejected FROM properties`),pool.query("SELECT count(*)::int count FROM reports WHERE status='open'"),pool.query("SELECT count(*)::int count FROM contact_requests WHERE status='open'"),pool.query('SELECT count(*)::int total,count(*) FILTER(WHERE blocked_at IS NOT NULL)::int blocked FROM users'),pool.query('SELECT count(*)::int count FROM conversations'),pool.query("SELECT count(*)::int count FROM viewing_requests WHERE status='pending'"),pool.query("SELECT count(*)::int count FROM auction_applications WHERE status IN ('submitted','reviewing')"),pool.query("SELECT count(*)::int count FROM projects WHERE status='active'"),pool.query("SELECT count(*)::int count FROM auction_lots WHERE status='active'")]);res.json({properties:props.rows[0],openReports:reports.rows[0].count,openContactRequests:contacts.rows[0].count,totalUsers:users.rows[0].total,blockedUsers:users.rows[0].blocked,conversations:chats.rows[0].count,pendingViewings:viewings.rows[0].count,pendingApplications:applications.rows[0].count,activeProjects:projects.rows[0].count,activeLots:lots.rows[0].count});}));
app.get(`${API}/admin/integrations`,requireAdmin,asyncRoute(async(_req,res)=>{const [heartbeat,publications,outbox]=await Promise.all([pool.query("SELECT last_seen_at>now()-interval '75 seconds' online,status_details FROM service_heartbeats WHERE service='telegram-bot'"),pool.query("SELECT status,count(*)::int count FROM channel_publications WHERE channel_id=$1 GROUP BY status",[String(process.env.TELEGRAM_CHANNEL_ID||'')]),pool.query("SELECT count(*) FILTER(WHERE failed_at IS NOT NULL)::int failed FROM outbox WHERE event_type IN ('property.approved','property.archived','auction.approved','auction.archived')")]);const latest=(await pool.query("SELECT last_error,status FROM channel_publications WHERE channel_id=$1 AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1",[String(process.env.TELEGRAM_CHANNEL_ID||'')])).rows[0]||null;res.json({sms:Boolean(process.env.SMS_PROVIDER_URL&&process.env.SMS_PROVIDER_TOKEN),telegramBot:Boolean(process.env.TELEGRAM_BOT_TOKEN),telegramBotWorkerOnline:Boolean(heartbeat.rows[0]?.online),telegramChannel:Boolean(process.env.TELEGRAM_CHANNEL_ID),telegram:heartbeat.rows[0]?.status_details||null,channelPublications:Object.fromEntries(publications.rows.map(r=>[r.status,r.count])),channelOutboxFailed:outbox.rows[0]?.failed||0,lastChannelError:latest,storage:storage.mode});}));
app.get(`${API}/admin/properties`,requireAdmin,asyncRoute(async(req,res)=>{const status=['draft','pending','active','rejected','archived'].includes(req.query.status)?req.query.status:'pending';const {rows}=await pool.query(`${PROPERTY_SELECT} WHERE p.status=$1 ORDER BY p.created_at ASC LIMIT 100`,[status]);res.json({items:rows.map(mapProperty)});}));
app.patch(`${API}/admin/properties/:id/status`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({status:z.enum(['active','rejected','archived']),reason:z.string().trim().min(3).max(1000).optional()}).superRefine((d,ctx)=>{if(d.status==='rejected'&&!d.reason)ctx.addIssue({code:z.ZodIssueCode.custom,path:['reason'],message:'Rad etish izohi majburiy.'})}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Holat yoki rad etish izohini tekshiring.');const client=await pool.connect();try{await client.query('BEGIN');const {rows}=await client.query('UPDATE properties SET status=$2,rejection_reason=$3,published_at=CASE WHEN $2=\'active\' THEN COALESCE(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=$1 AND status<>$2 RETURNING *',[req.params.id,s.data.status,s.data.reason||null]);if(!rows[0]){const check=await client.query('SELECT id FROM properties WHERE id=$1',[req.params.id]);await client.query('ROLLBACK');return check.rows[0]?fail(res,409,'STATUS_UNCHANGED','E’lon bu holatda allaqachon turibdi.'):fail(res,404,'NOT_FOUND','E’lon topilmadi.');}await client.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,\'property\',$3,$4)',[req.user.id,s.data.status,req.params.id,JSON.stringify({reason:s.data.reason||null})]);await client.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)',[rows[0].owner_id,s.data.status==='active'?'E’lon tasdiqlandi':s.data.status==='rejected'?'E’lon rad etildi':'E’lon arxivlandi',s.data.status==='rejected'?`“${rows[0].title}” e’loni rad etildi. Moderator izohi: ${s.data.reason}`:'E’lon holati yangilandi.']);if(s.data.status==='active'&&['apartment','house','land'].includes(rows[0].type))await client.query('INSERT INTO outbox(event_type,aggregate_id,payload) VALUES(\'property.approved\',$1,$2)',[req.params.id,JSON.stringify({propertyId:req.params.id})]);else if(['archived','rejected'].includes(s.data.status))await client.query('INSERT INTO outbox(event_type,aggregate_id,payload) VALUES(\'property.archived\',$1,$2)',[req.params.id,JSON.stringify({propertyId:req.params.id})]);await client.query('COMMIT');if(s.data.status==='rejected'&&process.env.TELEGRAM_BOT_TOKEN){const recipient=(await pool.query('SELECT telegram_id FROM users WHERE id=$1',[rows[0].owner_id])).rows[0]?.telegram_id;if(recipient)fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,text:`❌ “${rows[0].title}” e’loningiz rad etildi.\n\nModerator izohi: ${s.data.reason}`})}).catch(()=>{});}res.json({property:mapProperty(rows[0]),channelPublication:!['apartment','house','land'].includes(rows[0].type)?'not_applicable':process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHANNEL_ID?'queued':'queued_but_unconfigured'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.post(`${API}/admin/properties/:id/channel-post`,requireAdmin,asyncRoute(async(req,res)=>{if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.TELEGRAM_CHANNEL_ID)return fail(res,503,'TELEGRAM_CHANNEL_NOT_CONFIGURED','Telegram kanali hozir mavjud emas.');const client=await pool.connect();try{await client.query('BEGIN');const p=await client.query("SELECT id FROM properties WHERE id=$1 AND status='active' AND type IN ('apartment','house','land') FOR UPDATE",[req.params.id]);if(!p.rows[0]){await client.query('ROLLBACK');return fail(res,409,'PROPERTY_NOT_PUBLIC','Faqat tasdiqlangan uy-joy yoki yer e’loni yuboriladi.');}const current=await client.query("SELECT * FROM channel_publications WHERE listing_kind='property' AND listing_id=$1 AND channel_id=$2 FOR UPDATE",[req.params.id,String(process.env.TELEGRAM_CHANNEL_ID)]);if(current.rows[0]?.status==='sent'){await client.query('COMMIT');return res.json({status:'already_sent'});}if(current.rows[0]?.status==='unknown'||current.rows[0]?.status==='sending'){await client.query('ROLLBACK');return fail(res,409,'PUBLICATION_REVIEW_REQUIRED','Post holatini tekshirish kerak; qayta yuborish vaqtincha to‘xtatildi.');}let publication=current.rows[0];if(publication){await client.query("UPDATE channel_publications SET status='queued',last_error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1",[publication.id]);}else{publication=(await client.query("INSERT INTO channel_publications(listing_kind,listing_id,channel_id,status) VALUES('property',$1,$2,'queued') RETURNING id",[req.params.id,String(process.env.TELEGRAM_CHANNEL_ID)])).rows[0];}const {rows}=await client.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('property.approved',$1,$2) RETURNING id",[req.params.id,JSON.stringify({propertyId:req.params.id,manual:true,adminId:req.user.id})]);await client.query("INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'channel_post_queued','property',$2,$3)",[req.user.id,req.params.id,JSON.stringify({outboxId:rows[0].id})]);await client.query('COMMIT');res.status(202).json({outboxId:rows[0].id,status:'queued'});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}));
app.post(`${API}/admin/properties`,requireAdmin,asyncRoute(async(req,res)=>{const parsed=createSchema.extend({ownerId:z.string().uuid().optional()}).safeParse(req.body);if(!parsed.success)return fail(res,422,'VALIDATION_ERROR','E’lon maydonlarini tekshiring.',errorFields(parsed));const d=parsed.data;if(!hasCoordinatePair(d.latitude,d.longitude))return fail(res,422,'VALIDATION_ERROR','Xaritadagi kenglik va uzunlikni birga kiriting.');const owner=d.ownerId||req.user.id;const {rows}=await pool.query(`INSERT INTO properties(owner_id,title,description,type,deal,status,price,area,area_unit,rooms,region,district,address,landmark,latitude,longitude,amenities,seller_telegram) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,[owner,d.title,d.description,d.type,d.deal,d.price,d.area,d.areaUnit,d.rooms||null,d.region,d.district,d.address,d.landmark,d.latitude??null,d.longitude??null,JSON.stringify(d.amenities),d.sellerTelegram||null]);await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id) VALUES($1,\'created\',\'property\',$2)',[req.user.id,rows[0].id]);res.status(201).json({property:mapProperty(rows[0])});}));
app.post(`${API}/admin/projects`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({title:z.string().min(3).max(160),description:z.string().max(5000).default(''),region:z.string().min(2).max(100),developer:z.string().max(160).default(''),priceFrom:z.preprocess(v=>v===''||v==null?undefined:v,z.coerce.number().int().positive().optional()),handoverDate:z.preprocess(v=>v===''||v==null?undefined:v,z.string().date().optional()),imageUrl:z.preprocess(v=>v===''||v==null?undefined:v,z.string().url().optional())}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Majmua ma’lumotlarini tekshiring.',errorFields(s));const d=s.data;const {rows}=await pool.query('INSERT INTO projects(title,description,region,developer,price_from,handover_date,image_url) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d.title,d.description,d.region,d.developer,d.priceFrom||null,d.handoverDate||null,d.imageUrl||null]);res.status(201).json({project:rows[0]});}));
app.post(`${API}/admin/lots`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({title:z.string().trim().min(3).max(180),description:z.string().trim().max(10000).default(''),region:z.string().trim().min(2).max(100),address:z.string().trim().max(250).default(''),startingPrice:z.coerce.number().int().min(0),deposit:z.preprocess(v=>v===''||v==null?undefined:v,z.coerce.number().int().min(0).optional()),currency:z.enum(['UZS','USD','EUR']).default('UZS'),propertyType:z.enum(['','house','apartment','land']).default(''),rooms:z.preprocess(v=>v===''||v==null?undefined:v,z.coerce.number().int().min(1).max(100).optional()),area:z.preprocess(v=>v===''||v==null?undefined:v,z.coerce.number().positive().optional()),areaUnit:z.enum(['m2','sotix']).default('m2'),startsAt:z.preprocess(v=>v===''||v==null?undefined:v,z.string().datetime().optional()),deadline:z.preprocess(v=>v===''||v==null?undefined:v,z.string().datetime().optional()),sourceUrl:z.string().trim().max(2048).default('').refine(v=>!v||isHttpsUrl(v),'Rasmiy lot havolasi HTTPS bo‘lishi kerak.'),status:z.enum(['draft','active','closed']).default('draft')}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Lot ma’lumotlarini tekshiring.',errorFields(s));const d=s.data;if(d.status==='active'&&!d.propertyType)return fail(res,422,'AUCTION_TYPE_REQUIRED','Faol auksion uchun obyekt turini tanlang.');const {rows}=await pool.query('INSERT INTO auction_lots(title,description,region,address,starting_price,area,area_unit,deadline,status,property_type,deposit,starts_at,source_url,currency,rooms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[d.title,d.description,d.region,d.address,d.startingPrice,d.area||null,d.areaUnit,d.deadline||null,d.status,d.propertyType,d.deposit??null,d.startsAt||null,d.sourceUrl,d.currency,d.rooms??null]);if(d.status==='active')await pool.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('auction.approved',$1,$2)",[rows[0].id,JSON.stringify({auctionId:rows[0].id})]);res.status(201).json({lot:rows[0]});}));
app.get(`${API}/admin/users`,requireAdmin,asyncRoute(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,100),blocked=String(req.query.blocked||'all');
  const page=Math.max(1,Math.min(10000,Number.parseInt(req.query.page,10)||1)),pageSize=Math.max(1,Math.min(100,Number.parseInt(req.query.pageSize,10)||30));
  const values=[],where=[];
  if(q){values.push(`%${q}%`);where.push(`(u.name ILIKE $${values.length} OR COALESCE(u.phone,'') ILIKE $${values.length} OR COALESCE(u.email,'') ILIKE $${values.length} OR u.id::text ILIKE $${values.length})`);}
  if(blocked==='blocked')where.push('u.blocked_at IS NOT NULL');else if(blocked==='active')where.push('u.blocked_at IS NULL');
  values.push(pageSize);const limitParam=values.length;values.push((page-1)*pageSize);const offsetParam=values.length;
  const {rows}=await pool.query(`SELECT u.id,u.name,u.phone,u.email,u.role,u.region,u.blocked_at,u.blocked_reason,u.created_at,
    count(*) OVER()::int total,(SELECT count(*)::int FROM properties p WHERE p.owner_id=u.id) property_count
    FROM users u ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY u.created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,values);
  res.json({items:rows.map(({total,...u})=>({...u,total})),total:rows[0]?.total||0,page,pageSize});
}));
app.get(`${API}/admin/users/:id`,requireAdmin,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT u.id,u.name,u.phone,u.contact_phone,u.telegram_id,u.email,u.role,u.region,u.district,u.residential_address,u.blocked_at,u.blocked_reason,u.created_at,u.updated_at,
    (SELECT count(*)::int FROM properties p WHERE p.owner_id=u.id) property_count,
    (SELECT count(*)::int FROM conversations c WHERE c.buyer_id=u.id OR c.seller_id=u.id) conversation_count,
    (SELECT count(*)::int FROM auction_applications a WHERE a.user_id=u.id) application_count
    FROM users u WHERE u.id=$1`,[req.params.id]);
  if(!rows[0])return fail(res,404,'NOT_FOUND','Foydalanuvchi topilmadi.');
  const [properties,activity]=await Promise.all([
    pool.query('SELECT id,title,status,price,created_at FROM properties WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30',[req.params.id]),
    pool.query('SELECT action,entity_type,entity_id,created_at FROM admin_audit WHERE entity_type=$1 ORDER BY created_at DESC LIMIT 10',[`user:${req.params.id}`])
  ]);
  res.json({user:rows[0],properties:properties.rows,adminActivity:activity.rows});
}));
app.patch(`${API}/admin/users/:id`,requireAdmin,asyncRoute(async(req,res)=>{
  const s=z.object({name:z.string().trim().min(2).max(100),email:z.string().email().max(254).optional().or(z.literal('')),region:z.string().trim().min(2).max(100),district:z.string().trim().max(100).optional(),residentialAddress:z.string().trim().max(250).optional()}).strict().safeParse(req.body);
  if(!s.success)return fail(res,422,'VALIDATION_ERROR','Profil ma’lumotlarini tekshiring.',errorFields(s));
  const {rows}=await pool.query(`UPDATE users SET name=$2,email=NULLIF($3,''),region=$4,district=COALESCE($5,district),residential_address=COALESCE($6,residential_address),updated_at=now() WHERE id=$1 AND role<>'admin' RETURNING id,name,phone,contact_phone,telegram_id,email,role,region,district,residential_address,blocked_at,blocked_reason,created_at,updated_at`,[req.params.id,s.data.name,s.data.email||'',s.data.region,s.data.district??null,s.data.residentialAddress??null]);
  if(!rows[0]){const exists=await pool.query('SELECT id FROM users WHERE id=$1',[req.params.id]);return exists.rows[0]?fail(res,403,'ADMIN_ACCOUNT_PROTECTED','Administrator profilini bu yerdan o‘zgartirib bo‘lmaydi.'):fail(res,404,'NOT_FOUND','Foydalanuvchi topilmadi.');}
  await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'profile_updated\',$2,$3,$4)',[req.user.id,`user:${req.params.id}`,req.params.id,JSON.stringify({fields:Object.keys(s.data)})]);res.json({user:rows[0]});
}));
app.patch(`${API}/admin/users/:id/status`,requireAdmin,asyncRoute(async(req,res)=>{
  const s=z.object({blocked:z.boolean(),reason:z.string().trim().max(500).default('')}).safeParse(req.body);
  if(!s.success)return fail(res,422,'VALIDATION_ERROR','Hisob holatini tekshiring.',errorFields(s));
  if(s.data.blocked&&s.data.reason.length<3)return fail(res,422,'VALIDATION_ERROR','Cheklash sababini kamida 3 ta belgi bilan kiriting.');
  if(req.params.id===req.user.id)return fail(res,409,'SELF_ACTION','O‘z hisobingizni cheklay olmaysiz.');
  const client=await pool.connect();try{await client.query('BEGIN');
    const existing=await client.query('SELECT id,role,blocked_at FROM users WHERE id=$1 FOR UPDATE',[req.params.id]);
    if(!existing.rows[0]){await client.query('ROLLBACK');return fail(res,404,'NOT_FOUND','Foydalanuvchi topilmadi.');}
    if(existing.rows[0].role==='admin'){await client.query('ROLLBACK');return fail(res,403,'ADMIN_ACCOUNT_PROTECTED','Administrator hisobini bu yerdan cheklab bo‘lmaydi.');}
    const {rows}=await client.query(`UPDATE users SET blocked_at=CASE WHEN $2 THEN now() ELSE NULL END,blocked_reason=CASE WHEN $2 THEN $3 ELSE '' END,updated_at=now() WHERE id=$1 RETURNING id,name,phone,contact_phone,telegram_id,email,role,region,district,residential_address,blocked_at,blocked_reason,created_at,updated_at`,[req.params.id,s.data.blocked,s.data.reason]);
    if(s.data.blocked)await client.query('DELETE FROM sessions WHERE user_id=$1',[req.params.id]);
    await client.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,s.data.blocked?'blocked':'unblocked',`user:${req.params.id}`,req.params.id,JSON.stringify({reason:s.data.reason||null})]);
    await client.query('COMMIT');res.json({user:rows[0]});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get(`${API}/admin/conversations`,requireAdmin,asyncRoute(async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,100),values=[];let where='';
  if(q){values.push(`%${q}%`);where=`WHERE p.title ILIKE $1 OR b.name ILIKE $1 OR s.name ILIKE $1 OR c.id::text ILIKE $1`;}
  const {rows}=await pool.query(`SELECT c.id,c.created_at,p.id property_id,p.title property_title,b.id buyer_id,b.name buyer_name,s.id seller_id,s.name seller_name,
    (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id) message_count,
    (SELECT max(created_at) FROM messages m WHERE m.conversation_id=c.id) last_message_at
    FROM conversations c JOIN properties p ON p.id=c.property_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id
    ${where} ORDER BY COALESCE((SELECT max(created_at) FROM messages m WHERE m.conversation_id=c.id),c.created_at) DESC LIMIT 100`,values);
  res.json({items:rows});
}));
app.get(`${API}/admin/conversations/:id/messages`,requireAdmin,asyncRoute(async(req,res)=>{
  const c=await pool.query(`SELECT c.id,c.property_id,p.title property_title,b.id buyer_id,b.name buyer_name,s.id seller_id,s.name seller_name
    FROM conversations c JOIN properties p ON p.id=c.property_id JOIN users b ON b.id=c.buyer_id JOIN users s ON s.id=c.seller_id WHERE c.id=$1`,[req.params.id]);
  if(!c.rows[0])return fail(res,404,'NOT_FOUND','Suhbat topilmadi.');
  const limit=Math.max(1,Math.min(200,Number.parseInt(req.query.limit,10)||100));
  const {rows}=await pool.query(`SELECT m.id,m.sender_id,u.name sender_name,m.body,m.created_at FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=$1 ORDER BY m.created_at DESC LIMIT $2`,[req.params.id,limit]);
  await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)',[req.user.id,'read_messages','conversation',req.params.id,JSON.stringify({messageCount:rows.length,limit})]);
  res.json({conversation:c.rows[0],items:rows.reverse()});
}));
app.get(`${API}/admin/audit`,requireAdmin,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.name admin_name,u.phone admin_phone
    FROM admin_audit a JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 200`);
  res.json({items:rows});
}));
app.post(`${API}/admin/users/:id/notifications`,requireAdmin,asyncRoute(async(req,res)=>{
  const s=z.object({title:z.string().trim().min(2).max(120),body:z.string().trim().min(2).max(2000)}).safeParse(req.body);
  if(!s.success)return fail(res,422,'VALIDATION_ERROR','Bildirishnoma matnini tekshiring.',errorFields(s));
  const user=await pool.query('SELECT id FROM users WHERE id=$1',[req.params.id]);if(!user.rows[0])return fail(res,404,'NOT_FOUND','Foydalanuvchi topilmadi.');
  const {rows}=await pool.query('INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3) RETURNING id,title,body,created_at',[req.params.id,s.data.title,s.data.body]);
  await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'notification_sent\',$2,$3,$4)',[req.user.id,`user:${req.params.id}`,req.params.id,JSON.stringify({notificationId:rows[0].id})]);res.status(201).json({notification:rows[0]});
}));
app.get(`${API}/admin/projects`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query('SELECT * FROM projects ORDER BY created_at DESC');res.json({items:rows});}));
app.patch(`${API}/admin/projects/:id`,requireAdmin,asyncRoute(async(req,res)=>{
  const s=z.object({title:z.string().trim().min(3).max(160).optional(),description:z.string().max(5000).optional(),region:z.string().trim().min(2).max(100).optional(),developer:z.string().max(160).optional(),priceFrom:z.coerce.number().int().positive().nullable().optional(),handoverDate:z.string().date().nullable().optional(),imageUrl:z.string().url().nullable().optional(),status:z.enum(['active','inactive']).optional()}).strict().safeParse(req.body);
  if(!s.success)return fail(res,422,'VALIDATION_ERROR','Majmua maydonlarini tekshiring.',errorFields(s));const map={title:'title',description:'description',region:'region',developer:'developer',priceFrom:'price_from',handoverDate:'handover_date',imageUrl:'image_url',status:'status'},sets=[],vals=[];
  for(const [key,col] of Object.entries(map))if(Object.hasOwn(s.data,key)){vals.push(s.data[key]);sets.push(`${col}=$${vals.length}`)}if(!sets.length)return fail(res,422,'VALIDATION_ERROR','O‘zgarish topilmadi.');
  vals.push(req.params.id);const {rows}=await pool.query(`UPDATE projects SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);if(!rows[0])return fail(res,404,'NOT_FOUND','Majmua topilmadi.');await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'updated\',\'project\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);res.json({project:rows[0]});
}));
app.get(`${API}/admin/lots`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query('SELECT * FROM auction_lots ORDER BY created_at DESC');res.json({items:rows});}));
app.patch(`${API}/admin/lots/:id`,requireAdmin,asyncRoute(async(req,res)=>{
  const s=z.object({title:z.string().trim().min(3).max(180).optional(),description:z.string().trim().max(10000).optional(),region:z.string().trim().min(2).max(100).optional(),address:z.string().trim().max(250).optional(),startingPrice:z.coerce.number().int().min(0).optional(),deposit:z.coerce.number().int().min(0).nullable().optional(),currency:z.enum(['UZS','USD','EUR']).optional(),propertyType:z.enum(['','house','apartment','land']).optional(),rooms:z.coerce.number().int().min(1).max(100).nullable().optional(),area:z.coerce.number().positive().nullable().optional(),areaUnit:z.enum(['m2','sotix']).optional(),startsAt:z.string().datetime().nullable().optional(),deadline:z.string().datetime().nullable().optional(),sourceUrl:z.string().trim().max(2048).refine(v=>!v||isHttpsUrl(v),'Rasmiy lot havolasi HTTPS bo‘lishi kerak.').optional(),status:z.enum(['draft','active','closed','archived']).optional()}).strict().safeParse(req.body);
  if(!s.success)return fail(res,422,'VALIDATION_ERROR','Lot maydonlarini tekshiring.',errorFields(s));const map={title:'title',description:'description',region:'region',address:'address',startingPrice:'starting_price',deposit:'deposit',currency:'currency',propertyType:'property_type',rooms:'rooms',area:'area',areaUnit:'area_unit',startsAt:'starts_at',deadline:'deadline',sourceUrl:'source_url',status:'status'},sets=[],vals=[];
  for(const [key,col] of Object.entries(map))if(Object.hasOwn(s.data,key)){vals.push(s.data[key]);sets.push(`${col}=$${vals.length}`)}if(!sets.length)return fail(res,422,'VALIDATION_ERROR','O‘zgarish topilmadi.');
  const client=await pool.connect();try{await client.query('BEGIN');const before=await client.query('SELECT status,property_type FROM auction_lots WHERE id=$1 FOR UPDATE',[req.params.id]);if(!before.rows[0]){await client.query('ROLLBACK');return fail(res,404,'NOT_FOUND','Auksion loti topilmadi.')}vals.push(req.params.id);const {rows}=await client.query(`UPDATE auction_lots SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`,vals);const oldActive=before.rows[0].status==='active',newActive=rows[0].status==='active';if(newActive&&!(rows[0].property_type||'').trim()){await client.query('ROLLBACK');return fail(res,422,'AUCTION_TYPE_REQUIRED','Auksion e’lonini faollashtirishdan oldin obyekt turini tanlang.')}if(oldActive&&!newActive)await client.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('auction.archived',$1,$2)",[req.params.id,JSON.stringify({auctionId:req.params.id})]);if(newActive&&(!oldActive||Object.keys(s.data).some(key=>key!=='status')))await client.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('auction.approved',$1,$2)",[req.params.id,JSON.stringify({auctionId:req.params.id})]);await client.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'updated\',\'auction_lot\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);await client.query('COMMIT');res.json({lot:rows[0]});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));
app.get(`${API}/admin/lots/:id/documents`,requireAdmin,asyncRoute(async(req,res)=>{
  const lot=await pool.query('SELECT id FROM auction_lots WHERE id=$1',[req.params.id]);if(!lot.rows[0])return fail(res,404,'NOT_FOUND','Auksion loti topilmadi.');
  const {rows}=await pool.query('SELECT id,lot_id,title,created_at FROM lot_documents WHERE lot_id=$1 ORDER BY created_at DESC',[req.params.id]);res.json({items:rows});
}));
app.post(`${API}/admin/lots/:id/documents`,requireAdmin,documentUpload.single('document'),asyncRoute(async(req,res)=>{
  const lot=await pool.query('SELECT id FROM auction_lots WHERE id=$1',[req.params.id]);if(!lot.rows[0])return fail(res,404,'NOT_FOUND','Auksion loti topilmadi.');
  const title=String(req.body.title||'').trim();if(title.length<2||title.length>160)return fail(res,422,'VALIDATION_ERROR','Hujjat nomi 2–160 belgi bo‘lishi kerak.');
  if(!req.file||!storage.validateDocument(req.file))return fail(res,415,'UNSUPPORTED_DOCUMENT','Faqat haqiqiy PDF hujjat yuklang.');
  const key=await storage.saveDocument(req.file);try{const {rows}=await pool.query('INSERT INTO lot_documents(lot_id,title,storage_key) VALUES($1,$2,$3) RETURNING id,lot_id,title,created_at',[req.params.id,title,key]);await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'document_uploaded\',\'lot_document\',$2,$3)',[req.user.id,rows[0].id,JSON.stringify({lotId:req.params.id,title})]);res.status(201).json({document:rows[0]});}catch(e){await storage.deleteDocument(key).catch(()=>{});throw e;}
}));
app.get(`${API}/admin/documents/:id/download`,requireAdmin,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query('SELECT id,title,storage_key FROM lot_documents WHERE id=$1',[req.params.id]);if(!rows[0])return fail(res,404,'NOT_FOUND','Hujjat topilmadi.');
  let content;try{content=await storage.readDocument(rows[0].storage_key)}catch(error){if(error.code==='ENOENT'||error.name==='NoSuchKey')return fail(res,404,'DOCUMENT_FILE_NOT_FOUND','Hujjat fayli topilmadi.');throw error;}await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'document_downloaded\',\'lot_document\',$2,$3)',[req.user.id,req.params.id,JSON.stringify({title:rows[0].title})]);
  const safe=rows[0].title.replace(/[\r\n"\\]/g,'_');res.set('Content-Type','application/pdf').set('X-Content-Type-Options','nosniff').set('Cache-Control','private, no-store').set('Content-Disposition',`attachment; filename="${safe}.pdf"; filename*=UTF-8''${encodeURIComponent(rows[0].title)}.pdf`).send(content);
}));
app.delete(`${API}/admin/documents/:id`,requireAdmin,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query('SELECT id,title,storage_key,lot_id FROM lot_documents WHERE id=$1',[req.params.id]);if(!rows[0])return fail(res,404,'NOT_FOUND','Hujjat topilmadi.');
  await storage.deleteDocument(rows[0].storage_key);await pool.query('DELETE FROM lot_documents WHERE id=$1',[req.params.id]);await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'document_deleted\',\'lot_document\',$2,$3)',[req.user.id,req.params.id,JSON.stringify({lotId:rows[0].lot_id,title:rows[0].title})]);res.json({ok:true});
}));
app.get(`${API}/admin/applications`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query(`SELECT a.*,l.title lot_title,u.name user_name,u.phone user_phone FROM auction_applications a JOIN auction_lots l ON l.id=a.lot_id JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 300`);res.json({items:rows});}));
app.patch(`${API}/admin/applications/:id`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({status:z.enum(['submitted','reviewing','accepted','rejected'])}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Ariza holatini tekshiring.');const {rows}=await pool.query('UPDATE auction_applications SET status=$2 WHERE id=$1 RETURNING *',[req.params.id,s.data.status]);if(!rows[0])return fail(res,404,'NOT_FOUND','Ariza topilmadi.');await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'status_changed\',\'application\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);res.json({application:rows[0]});}));
app.get(`${API}/admin/viewings`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query(`SELECT v.*,p.title property_title,u.name requester_name,u.phone requester_phone FROM viewing_requests v JOIN properties p ON p.id=v.property_id JOIN users u ON u.id=v.requester_id ORDER BY v.created_at DESC LIMIT 300`);res.json({items:rows});}));
app.patch(`${API}/admin/viewings/:id`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({status:z.enum(['pending','accepted','declined','cancelled'])}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Uchrashuv holatini tekshiring.');const {rows}=await pool.query('UPDATE viewing_requests SET status=$2 WHERE id=$1 RETURNING *',[req.params.id,s.data.status]);if(!rows[0])return fail(res,404,'NOT_FOUND','Uchrashuv so‘rovi topilmadi.');await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'status_changed\',\'viewing\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);res.json({request:rows[0]});}));
app.patch(`${API}/admin/reports/:id`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({status:z.enum(['open','resolved','dismissed'])}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Shikoyat holatini tekshiring.');const {rows}=await pool.query('UPDATE reports SET status=$2 WHERE id=$1 RETURNING *',[req.params.id,s.data.status]);if(!rows[0])return fail(res,404,'NOT_FOUND','Shikoyat topilmadi.');await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'status_changed\',\'report\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);res.json({report:rows[0]});}));
app.patch(`${API}/admin/contact-requests/:id`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({status:z.enum(['open','closed'])}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Murojaat holatini tekshiring.');const {rows}=await pool.query('UPDATE contact_requests SET status=$2 WHERE id=$1 RETURNING *',[req.params.id,s.data.status]);if(!rows[0])return fail(res,404,'NOT_FOUND','Murojaat topilmadi.');await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'status_changed\',\'contact_request\',$2,$3)',[req.user.id,req.params.id,JSON.stringify(s.data)]);res.json({request:rows[0]});}));
app.post(`${API}/admin/contact-requests/:id/reply`,requireAdmin,asyncRoute(async(req,res)=>{const s=z.object({message:z.string().trim().min(1).max(4000)}).safeParse(req.body);if(!s.success)return fail(res,422,'VALIDATION_ERROR','Javob matnini tekshiring.',errorFields(s));if(!process.env.TELEGRAM_BOT_TOKEN)return fail(res,503,'TELEGRAM_UNAVAILABLE','Javob yuborilmadi. Qayta urinib ko‘ring.');const ticket=(await pool.query("SELECT id,telegram_user_id,status FROM contact_requests WHERE id=$1",[req.params.id])).rows[0];if(!ticket)return fail(res,404,'NOT_FOUND','Murojaat topilmadi.');if(ticket.status!=='open')return fail(res,409,'CONTACT_CLOSED','Yopilgan murojaatga javob yuborib bo‘lmaydi.');if(!ticket.telegram_user_id)return fail(res,409,'TELEGRAM_NOT_LINKED','Foydalanuvchi Telegram suhbatini hali boshlamagan.');const tg=await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:ticket.telegram_user_id,text:`Uy Joyla jamoasidan javob:\n\n${s.data.message}`})});let result;try{result=await tg.json()}catch{result=null}if(!tg.ok||!result?.ok)return fail(res,502,'TELEGRAM_SEND_FAILED','Telegram orqali javob yuborilmadi. Birozdan keyin qayta urinib ko‘ring.');const actor=(await pool.query('SELECT telegram_id FROM users WHERE id=$1',[req.user.id])).rows[0]?.telegram_id||0;const {rows}=await pool.query("INSERT INTO support_messages(request_id,sender_role,telegram_id,body) VALUES($1,'admin',$2,$3) RETURNING id,sender_role,telegram_id,body,created_at",[ticket.id,String(actor),s.data.message]);await pool.query("INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,'contact_reply_sent','contact_request',$2,$3)",[req.user.id,ticket.id,JSON.stringify({telegramMessageId:result.result?.message_id})]);res.status(201).json({message:rows[0]});}));
app.get(`${API}/admin/reports`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query('SELECT r.*,p.title property_title,u.name reporter_name FROM reports r JOIN properties p ON p.id=r.property_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200');res.json({items:rows});}));
app.get(`${API}/admin/contact-requests`,requireAdmin,asyncRoute(async(_req,res)=>{const {rows}=await pool.query('SELECT * FROM contact_requests ORDER BY created_at DESC LIMIT 200');res.json({items:rows});}));
app.get(`${API}/admin/contact-requests/:id/messages`,requireAdmin,asyncRoute(async(req,res)=>{const ticket=(await pool.query('SELECT id,telegram_user_id,status FROM contact_requests WHERE id=$1',[req.params.id])).rows[0];if(!ticket)return fail(res,404,'NOT_FOUND','Murojaat topilmadi.');const {rows}=await pool.query('SELECT id,sender_role,telegram_id,body,created_at FROM support_messages WHERE request_id=$1 ORDER BY created_at ASC LIMIT 500',[ticket.id]);await pool.query('INSERT INTO admin_audit(admin_id,action,entity_type,entity_id,details) VALUES($1,\'read_messages\',\'contact_request\',$2,$3)',[req.user.id,ticket.id,JSON.stringify({messageCount:rows.length})]);res.json({items:rows,telegramLinked:Boolean(ticket.telegram_user_id),status:ticket.status});}));

app.use((err,_req,res,_next)=>{
  console.error(err);
  if(err instanceof multer.MulterError) return fail(res,413,'UPLOAD_ERROR',err.code==='LIMIT_FILE_SIZE'?'Rasm hajmi ruxsat etilgan chegaradan katta.':'Rasm yuklash limiti oshdi.');
  if(err.code==='UNSUPPORTED_MEDIA')return fail(res,415,'UNSUPPORTED_MEDIA',err.message);
  if(err.code==='UNSUPPORTED_DOCUMENT')return fail(res,415,'UNSUPPORTED_DOCUMENT',err.message);
  if(err.code==='LIMIT_FILE_SIZE')return fail(res,413,'UPLOAD_TOO_LARGE','PDF hujjat 25 MB dan kichik bo‘lishi kerak.');
  if(err.code==='23503')return fail(res,422,'REFERENCE_ERROR','Bog‘langan yozuv topilmadi.');
  if(err.code==='23514'||err.code==='22P02')return fail(res,422,'VALIDATION_ERROR','Ma’lumot formati noto‘g‘ri.');
  fail(res,500,'INTERNAL_ERROR','Serverda xatolik yuz berdi.');
});

const server=app.listen(PORT,()=>console.log(`e-uylar API listening on :${PORT}`));
async function shutdown(){server.close();await pool.end();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
