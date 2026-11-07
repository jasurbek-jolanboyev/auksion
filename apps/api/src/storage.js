const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const mode=process.env.STORAGE_DRIVER||'local';
const IMAGE_TYPES={
  'image/jpeg':{ext:'.jpg',valid:b=>b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
  'image/png':{ext:'.png',valid:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))},
  'image/webp':{ext:'.webp',valid:b=>b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'}
};
const DOCUMENT_TYPES={'application/pdf':{ext:'.pdf',valid:b=>b.length>=5&&b.subarray(0,5).toString('ascii')==='%PDF-'}};
let client,commands;
if(mode==='s3'){
  const {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
  commands={PutObjectCommand,GetObjectCommand,DeleteObjectCommand};
  client=new S3Client({region:process.env.S3_REGION||'us-east-1',endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true',credentials:process.env.S3_ACCESS_KEY_ID?{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}:undefined});
}
async function save(file){
  const imageType=IMAGE_TYPES[file.mimetype];
  if(!imageType||!Buffer.isBuffer(file.buffer)||!imageType.valid(file.buffer))throw Object.assign(new Error('Rasm formati noto‘g‘ri.'),{code:'UNSUPPORTED_MEDIA'});
  const ext=imageType.ext;
  const key=`properties/${crypto.randomUUID()}${ext}`;
  if(mode==='s3'){
    if(!process.env.S3_BUCKET||!process.env.S3_PUBLIC_BASE_URL)throw new Error('S3_BUCKET and S3_PUBLIC_BASE_URL are required for S3 storage.');
    await client.send(new commands.PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:file.buffer,ContentType:file.mimetype,CacheControl:'public,max-age=604800,immutable'}));
    return `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/,'')}/${key}`;
  }
  const folder=path.resolve(process.env.UPLOAD_DIR||'./uploads');await fs.mkdir(folder,{recursive:true});
  if(file.path)return `/uploads/${path.basename(file.path)}`;
  await fs.writeFile(path.join(folder,path.basename(key)),file.buffer,{flag:'wx'});
  return `/uploads/${path.basename(key)}`;
}
async function deleteImage(imageUrl){
  let key='';
  if(mode==='s3'){const base=(process.env.S3_PUBLIC_BASE_URL||'').replace(/\/$/,'')+'/';if(!base||!String(imageUrl).startsWith(base))return;key=String(imageUrl).slice(base.length);if(!/^properties\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key))return;await client.send(new commands.DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));return}
  const name=path.basename(String(imageUrl||''));if(!/^([0-9a-f-]{36})\.(jpg|png|webp)$/i.test(name))return;await fs.unlink(path.join(path.resolve(process.env.UPLOAD_DIR||'./uploads'),name)).catch(error=>{if(error.code!=='ENOENT')throw error});
}
async function saveDocument(file){
  const type=DOCUMENT_TYPES[file.mimetype];if(!type||!Buffer.isBuffer(file.buffer)||!type.valid(file.buffer))throw Object.assign(new Error('Faqat haqiqiy PDF hujjat qabul qilinadi.'),{code:'UNSUPPORTED_DOCUMENT'});
  const key=`documents/${crypto.randomUUID()}${type.ext}`;
  if(mode==='s3'){if(!process.env.S3_BUCKET)throw new Error('S3_BUCKET is required for private document storage.');await client.send(new commands.PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:file.buffer,ContentType:file.mimetype,CacheControl:'private,no-store',ServerSideEncryption:'AES256'}));return `s3:${key}`;}
  const base=path.resolve(process.env.UPLOAD_DIR||'./uploads'),folder=path.join(base,'documents');await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(base,key),file.buffer,{flag:'wx',mode:0o600});return key;
}
async function readDocument(storageKey){
  if(typeof storageKey!=='string'||!/^((s3:)?documents\/[0-9a-f-]{36}\.pdf)$/i.test(storageKey))throw Object.assign(new Error('Hujjat topilmadi.'),{code:'ENOENT'});
  if(storageKey.startsWith('s3:')){if(!client||!process.env.S3_BUCKET)throw new Error('S3 hujjat ombori sozlanmagan.');const obj=await client.send(new commands.GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:storageKey.slice(3)}));return Buffer.from(await obj.Body.transformToByteArray());}
  return fs.readFile(path.join(path.resolve(process.env.UPLOAD_DIR||'./uploads'),storageKey));
}
async function deleteDocument(storageKey){
  if(typeof storageKey!=='string'||!/^((s3:)?documents\/[0-9a-f-]{36}\.pdf)$/i.test(storageKey))throw Object.assign(new Error('Hujjat topilmadi.'),{code:'ENOENT'});
  if(storageKey.startsWith('s3:')){if(!client||!process.env.S3_BUCKET)throw new Error('S3 hujjat ombori sozlanmagan.');await client.send(new commands.DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:storageKey.slice(3)}));return;}
  await fs.unlink(path.join(path.resolve(process.env.UPLOAD_DIR||'./uploads'),storageKey));
}
module.exports={mode,save,deleteImage,saveDocument,readDocument,deleteDocument,validateImage:file=>{const imageType=IMAGE_TYPES[file.mimetype];return Boolean(imageType&&Buffer.isBuffer(file.buffer)&&imageType.valid(file.buffer))},validateDocument:file=>{const type=DOCUMENT_TYPES[file.mimetype];return Boolean(type&&Buffer.isBuffer(file.buffer)&&type.valid(file.buffer))}};
