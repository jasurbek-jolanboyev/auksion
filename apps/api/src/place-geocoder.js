'use strict';

const cache = new Map();
const pending = new Map();
let lastRequestAt = 0;

async function geocodePlace(query) {
  const endpoint=String(process.env.LOCATION_GEOCODER_URL||'').trim();
  const place=String(query||'').trim().slice(0,100);
  if(!endpoint||place.length<2)return null;
  const key=place.normalize('NFKC').toLocaleLowerCase();
  const cached=cache.get(key);
  if(cached&&cached.until>Date.now())return cached.point;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    const wait=Math.max(0,1100-(Date.now()-lastRequestAt));
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    lastRequestAt=Date.now();
    try{
      const url=new URL(endpoint);url.searchParams.set('q',place);url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');url.searchParams.set('countrycodes','uz');
      const response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':`UyJoyla/1.0 (${process.env.PUBLIC_SITE_URL||'https://uyjoyla.uz'})`},signal:AbortSignal.timeout(3500)});
      if(!response.ok)throw new Error(`Geocoder returned ${response.status}`);
      const data=await response.json(),hit=Array.isArray(data)?data[0]:data?.features?.[0];
      const lat=Number(hit?.lat??hit?.geometry?.coordinates?.[1]),lng=Number(hit?.lon??hit?.geometry?.coordinates?.[0]);
      const point=Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180?{lat,lng}:null;
      cache.set(key,{point,until:Date.now()+6*60*60*1000});return point;
    }catch{return null;}
  })();
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}

module.exports={geocodePlace};
