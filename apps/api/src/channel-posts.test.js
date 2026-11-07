'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const posts=require('./channel-posts');
const config={siteUrl:'https://uyjoyla.uz',botUsername:'@uy_joylabot',channelUrl:'https://t.me/uyjoyla_uz',signature:'👉 UyJoyla — uy, yer va auksion e’lonlari!'};

test('house listing uses only present fields and requires consent before showing phone',()=>{
  const caption=posts.propertyPost({id:'12345',type:'apartment',deal:'sale',title:'Toshkentda 3 xonali kvartira sotiladi',region:'Toshkent shahri',district:'Chilonzor tumani',price:65000,currency:'USD',rooms:3,area:'72',area_unit:'m2',floor_number:4,total_floors:9,condition:'yaxshi',description:'Ta’miri yaxshi, yaqinida barcha qulayliklar bor.',seller_phone:'+998 XX XXX XX XX',publish_phone:false,gas_available:null},config);
  assert.match(caption,/🏡 TOSHKENTDA 3 XONALI KVARTIRA SOTILADI/);
  assert.match(caption,/65,000 USD/);
  assert.match(caption,/Qavat: 4 \/ 9/);
  assert.doesNotMatch(caption,/Aloqa|mavjud emas|Elektr|Gaz/);
  assert.match(posts.propertyPost({id:'1',type:'house',deal:'rent',title:'Hovli ijaraga',price:1,area:100,area_unit:'m2',publish_phone:true,seller_phone:'+998 90 000 00 00'},config),/Aloqa: \+998 90 000 00 00/);
});

test('land listing includes explicitly entered utilities and omits unknown values',()=>{
  const caption=posts.propertyPost({id:'land-2',type:'land',deal:'sale',region:'Toshkent viloyati',district:'Qibray tumani',address:'Amir Temur ko‘chasi, 12',landmark:'maktab yonida',amenities:['Elektr tarmog‘i','Asfalt yo‘l'],price:25000,currency:'USD',area:6,area_unit:'sotix',documents_info:'Kadastr bor',electricity_available:true,water_available:false,gas_available:null,description:'Qurilishga tayyor yer maydoni.'},config);
  assert.match(caption,/YER UCHASTKASI/);assert.match(caption,/6 sotix/);assert.match(caption,/Hujjatlar: Kadastr bor/);assert.match(caption,/Elektr: mavjud/);assert.match(caption,/Suv: mavjud emas/);assert.doesNotMatch(caption,/Gaz/);
  assert.match(caption,/Manzil: Toshkent viloyati, Qibray tumani, Amir Temur ko‘chasi, 12/);assert.match(caption,/Mo‘ljal: maktab yonida/);assert.match(caption,/Qulayliklar: Elektr tarmog‘i, Asfalt yo‘l/);
});

test('auction formats Tashkent dates, uses actual values and allows only an HTTPS original lot URL',()=>{
  const lot={id:'lot-3',title:'Kadastrli uy',property_type:'house',region:'Samarqand shahri',starting_price:350000000,currency:'UZS',deposit:35000000,area:90,area_unit:'m2',rooms:3,starts_at:'2026-10-30T05:00:00Z',deadline:'2026-10-29T13:00:00Z',description:'Uy bo‘yicha qisqa ma’lumot.'};
  const caption=posts.auctionPost(lot,config);assert.match(caption,/AUKSIONDA — UY-JOY/);assert.match(caption,/350 000 000 so‘m/);assert.match(caption,/30\.10\.2026, 10:00/);assert.match(caption,/29\.10\.2026, 18:00/);
  assert.equal(posts.auctionButtons({...lot,source_url:'http://not-secure.example/lot'},config).some(row=>row[0].text.includes('Auksionga')),false);
  assert.equal(posts.auctionButtons({...lot,source_url:'https://auction.example/lot/3'},config).some(row=>row[0].url==='https://auction.example/lot/3'),true);
});

test('caption clips long descriptions at word boundaries but preserves core and stays within Telegram limit',()=>{
  const caption=posts.propertyPost({id:'long',type:'house',deal:'sale',title:'Uy sotiladi',region:'Toshkent',price:123,area:90,description:'Xususiyat '.repeat(500)},config);
  assert.ok(Array.from(caption).length<=1024);assert.match(caption,/💰 Narxi: 123 so‘m/);assert.doesNotMatch(caption,/🆔 E’lon:/);assert.match(caption,/…/);
  assert.throws(()=>posts.fitCaption({headline:'X'.repeat(1025),fields:[],footer:[],description:''}),{code:'CHANNEL_CAPTION_TOO_LONG'});
});

test('literal user markup is safe without parse mode; localhost routes are hidden',()=>{
  const caption=posts.propertyPost({id:'markup',type:'house',deal:'sale',title:'Uy <sotiladi> & tayyor',price:100,area:100,description:'Matn <b>belgilar</b> & boshqa.'},config);
  assert.match(caption,/<SOTILADI>/);assert.match(caption,/<b>belgilar<\/b>/);
  assert.equal(posts.isPublicSiteUrl('http://localhost:5173'),false);assert.equal(posts.isPublicSiteUrl('http://127.0.0.1:5173'),false);assert.equal(posts.isPublicSiteUrl('http://[::1]:5173'),false);
  assert.deepEqual(posts.propertyButtons('a/b',{...config,siteUrl:'http://localhost:5173'}),[[{text:'✍️ E’lon berish',url:'https://t.me/uy_joylabot'}]]);
  assert.equal(posts.propertyButtons('abc',config)[0][0].url,'https://uyjoyla.uz/#/property/abc');
});

test('empty optional money values are omitted',()=>{assert.equal(posts.money(null),'');assert.equal(posts.money(''),'');assert.equal(posts.money(0),'0 so‘m');});


test('media planning uses text without photos, one photo, and bounded albums',()=>{
  assert.deepEqual(posts.mediaPlan([]),{mode:'text',urls:[]});
  assert.deepEqual(posts.mediaPlan([{url:'/one.jpg'}]),{mode:'photo',urls:['/one.jpg']});
  assert.equal(posts.mediaPlan(Array.from({length:12},(_,i)=>`/${i}.jpg`)).mode,'album');
  assert.equal(posts.mediaPlan(Array.from({length:12},(_,i)=>`/${i}.jpg`)).urls.length,10);
});

test('only a queued publication may attempt a Telegram send',()=>{
  for(const state of ['sent','sending','failed','unknown','archived'])assert.equal(posts.publicationDisposition(state),'skip');
  assert.equal(posts.publicationDisposition('queued'),'send');
});

test('caption respects Telegram limit when core fields nearly fill it',()=>{
  for(const length of [1018,1019,1020,1021,1022,1023,1024]){
    const caption=posts.fitCaption({headline:'H'.repeat(length),fields:[],footer:[],description:'Some optional description',maxLength:1024});
    assert.ok(Array.from(caption).length<=1024,`caption length exceeded at core=${length}`);
  }
});
