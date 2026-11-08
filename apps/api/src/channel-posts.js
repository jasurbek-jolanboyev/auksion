'use strict';

const TASHKENT = 'Asia/Tashkent';
const DEFAULT_SIGNATURE = '👉 UyJoyla — uy, yer va auksion e’lonlari!';

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString().replace(/\/$/, '') : '';
  } catch { return ''; }
}

function isPublicSiteUrl(value) {
  const urlText = safeUrl(value);
  if (!urlText) return false;
  const url = new URL(urlText);
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '[::1]' || host === '0.0.0.0' || /^127\./.test(host)) return false;
  if (/^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

function oneLine(value) { return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function shortText(value, max) {
  const text = oneLine(value);
  if (max < 1) return '';
  if (Array.from(text).length <= max) return text;
  const clipped = Array.from(text).slice(0, Math.max(0, max - 1)).join('');
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > max * 0.55 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
}

function money(value, currency='UZS') {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const code = ['UZS','USD','EUR'].includes(String(currency).toUpperCase()) ? String(currency).toUpperCase() : 'UZS';
  const locale = code === 'UZS' ? 'uz-UZ' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n).replace(/[\u00a0\u202f]/g, code === 'UZS' ? ' ' : ',');
  return code === 'UZS' ? `${formatted} so‘m` : `${formatted} ${code}`;
}

function dateTashkent(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:TASHKENT, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`;
}

function configuredLinks({siteUrl, botUsername='uy_joylabot', channelUrl='https://t.me/uyjoyla_uz', signature=DEFAULT_SIGNATURE}={}) {
  const bot = String(botUsername || '').replace(/^@/, '').trim();
  const channel = safeUrl(channelUrl);
  const channelHandle = channel ? `@${new URL(channel).pathname.split('/').filter(Boolean)[0]}` : '';
  return {
    siteUrl: isPublicSiteUrl(siteUrl) ? safeUrl(siteUrl) : '',
    botUsername: /^[A-Za-z0-9_]{5,32}$/.test(bot) ? bot : '',
    channelUrl: channel,
    channelHandle: channelHandle && /^@[A-Za-z0-9_]{5,32}$/.test(channelHandle) ? channelHandle : '',
    signature: String(signature || DEFAULT_SIGNATURE).trim() || DEFAULT_SIGNATURE
  };
}

function fitCaption({headline, fields, description, footer, maxLength=1024}) {
  const visibleFields=fields.filter(Boolean),visibleFooter=footer.filter(Boolean);
  const coreSections=[headline,visibleFields.join('\n'),visibleFooter.join('\n')].filter(Boolean);
  const coreText=coreSections.join('\n\n');
  if (Array.from(coreText).length > maxLength) {
    const error = new Error('Kanal posti uchun sarlavha va asosiy maydonlar caption limitidan uzun.');
    error.code = 'CHANNEL_CAPTION_TOO_LONG';
    throw error;
  }
  const descriptionPrefix=description?`📝 `:'';
  const available=maxLength-Array.from(coreText).length-(description?Array.from(descriptionPrefix).length+2:0)-2;
  const clipped=shortText(description,Math.max(0,available));
  return [headline,visibleFields.join('\n'),clipped?`📝 ${clipped}`:'',visibleFooter.join('\n')].filter(Boolean).join('\n\n');
}

function propertyPost(property, options={}) {
  if (!['apartment','house','land'].includes(property.type)) {
    const error = new Error('Kanalga faqat uy-joy yoki yer e’lonlari chiqariladi.'); error.code='CHANNEL_UNSUPPORTED_PROPERTY_TYPE'; throw error;
  }
  const links = configuredLinks(options);
  const category = property.type === 'land' ? 'YER UCHASTKASI' : property.type === 'apartment' ? 'KVARTIRA' : 'HOVLI UY';
  const deal = property.deal === 'rent' ? 'IJARAGA BERILADI' : 'SOTILADI';
  const title = oneLine(property.title);
  const headline = property.type === 'land'
    ? `🌿 ${category} ${deal}`
    : `🏡 ${title ? title.toLocaleUpperCase('uz-UZ') : category}${/sotil|ijara/i.test(title) ? '' : ` ${deal}`}`;
  const address = [property.region, property.district, property.address].map(oneLine).filter(Boolean).join(', ');
  const fields = [];
  if (property.type === 'land' && title) fields.push(`📌 ${title}`);
  if (address) fields.push(`📍 Manzil: ${address}`);
  if (oneLine(property.landmark)) fields.push(`🧭 Mo‘ljal: ${oneLine(property.landmark)}`);
  const price = money(property.price, property.currency);
  if (price) fields.push(`💰 Narxi: ${price}`);
  if (property.price_negotiable === true) fields.push('🤝 Kelishiladi');
  if (property.deal === 'rent') fields.push('🤝 Ijara');
  if (property.rooms != null) fields.push(`🛏 Xonalar: ${property.rooms} ta`);
  if (property.area != null) fields.push(`📐 Umumiy maydon: ${property.area} ${property.area_unit === 'sotix' ? 'sotix' : 'm²'}`);
  if (property.floor_number != null && property.total_floors != null) fields.push(`🏢 Qavat: ${property.floor_number} / ${property.total_floors}`);
  else if (property.floor_number != null) fields.push(`🏢 Qavat: ${property.floor_number}`);
  if (oneLine(property.condition)) fields.push(`🛠 Ta’miri: ${oneLine(property.condition)}`);
  const amenities=Array.isArray(property.amenities)?property.amenities.map(oneLine).filter(Boolean):[];
  if(amenities.length)fields.push(`✨ Qulayliklar: ${amenities.join(', ')}`);
  if (property.type === 'land') {
    if (oneLine(property.documents_info)) fields.push(`📄 Hujjatlar: ${oneLine(property.documents_info)}`);
    for (const [key,label,emoji] of [['electricity_available','Elektr','⚡'],['water_available','Suv','💧'],['gas_available','Gaz','🔥']]) {
      if (property[key] === true) fields.push(`${emoji} ${label}: mavjud`);
      else if (property[key] === false) fields.push(`${emoji} ${label}: mavjud emas`);
    }
  }
  if(property.latitude!=null&&property.longitude!=null&&Number.isFinite(Number(property.latitude))&&Number.isFinite(Number(property.longitude)))fields.push(`🗺 Xarita: https://www.google.com/maps?q=${encodeURIComponent(`${property.latitude},${property.longitude}`)}`);
  if(property.viewing_available===true)fields.push('📅 Ko‘rish vaqtini kelishish mumkin');
  const phone = property.publish_phone && oneLine(property.seller_phone) ? `📞 Aloqa: ${oneLine(property.seller_phone)}` : '';
  const footer = [phone, links.signature, links.channelHandle ? `📢 Kanal: ${links.channelHandle}` : '', links.botUsername ? `🤖 E’lon berish: @${links.botUsername}` : ''];
  return fitCaption({headline,fields,description:property.description,footer});
}

function auctionPost(lot, options={}) {
  const links = configuredLinks(options);
  const types = {house:'UY-JOY',apartment:'KVARTIRA',land:'YER UCHASTKASI'};
  const objectType = types[lot.property_type] || '';
  const headline = `⚖️ AUKSIONDA${objectType ? ` — ${objectType}` : ''}`;
  const address = [lot.region,lot.district,lot.address].map(oneLine).filter(Boolean).join(', ');
  const fields = [];
  if (oneLine(lot.title)) fields.push(`📌 ${oneLine(lot.title)}`);
  if (address) fields.push(`📍 Manzil: ${address}`);
  const price = money(lot.starting_price, lot.currency);
  if (price) fields.push(`💰 Boshlang‘ich narx: ${price}`);
  const deposit = money(lot.deposit, lot.currency);
  if (deposit) fields.push(`💳 Zakalat: ${deposit}`);
  if (lot.area != null) fields.push(`📐 Maydon: ${lot.area} ${lot.area_unit === 'sotix' ? 'sotix' : 'm²'}`);
  if (lot.rooms != null) fields.push(`🛏 Xonalar: ${lot.rooms} ta`);
  const starts = dateTashkent(lot.starts_at);
  const deadline = dateTashkent(lot.deadline);
  if (starts) fields.push(`📅 Auksion boshlanishi: ${starts}`);
  if (deadline) fields.push(`⏳ Arizalar muddati: ${deadline}`);
  if (lot.source_lot_number || lot.id) fields.push(`🔢 Lot raqami: ${lot.source_lot_number || lot.id}`);
  const footer = [links.signature,links.channelHandle?`📢 Kanal: ${links.channelHandle}`:'',links.botUsername?`🤖 E’lon berish: @${links.botUsername}`:''];
  return fitCaption({headline,fields,description:lot.description,footer});
}

function propertyButtons(id, options={}, property={}) {
  const links = configuredLinks(options);
  const rows=[];
  rows.push([{text:'📩 Ariza / bog‘lanish',url:'https://t.me/serinaqu'}]);
  if (links.siteUrl) rows.push([{text:'🏠 E’lonni ko‘rish · aloqa',url:`${links.siteUrl}/#/property/${encodeURIComponent(id)}`}]);
  const sellerTelegram=String(property.seller_telegram||'').replace(/^@/,'').trim();
  if(/^[A-Za-z0-9_]{5,32}$/.test(sellerTelegram))rows.push([{text:'✉️ Telegram’da yozish',url:`https://t.me/${sellerTelegram}`}]);
  else if(links.botUsername)rows.push([{text:'💬 Egasiga yozish',url:`https://t.me/${links.botUsername}?start=ask_${encodeURIComponent(id)}`}]);
  return rows;
}

function auctionButtons(lot, options={}) {
  const links = configuredLinks(options);
  const rows=[];
  if (links.siteUrl) rows.push([{text:'🏡 E’lonni ko‘rish',url:`${links.siteUrl}/#/auction/${encodeURIComponent(lot.id)}`}]);
  if (/^https:\/\//i.test(String(lot.source_url||'')) && safeUrl(lot.source_url)) rows.push([{text:'⚖️ Auksionga o‘tish',url:safeUrl(lot.source_url)}]);
  return rows;
}

function mediaPlan(images) {
  const urls = (Array.isArray(images) ? images : []).map(image => typeof image === 'string' ? image : image?.url).filter(Boolean).slice(0, 10);
  return {mode:urls.length===0?'text':urls.length===1?'photo':'album',urls};
}

function publicationDisposition(status) {
  return status === 'queued' ? 'send' : 'skip';
}

module.exports={DEFAULT_SIGNATURE,auctionButtons,auctionPost,configuredLinks,dateTashkent,fitCaption,isPublicSiteUrl,mediaPlan,money,propertyButtons,propertyPost,publicationDisposition,safeUrl,shortText,oneLine};
