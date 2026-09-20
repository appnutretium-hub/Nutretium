'use strict';
const {getBlobStore}=require('./blob-store');
const STORE='product-content-v1';
const MAX={description:5000,ingredients:8000,nutrition:8000,allergens:3000,instructions:5000,warnings:5000,seoTitle:80,metaDescription:200,size:120,format:120,ean:14,video:500};
const FIELDS=Object.keys(MAX);
const ARRAY_FIELDS=['flavors','gallery','relatedCodes','upsellCodes','crossSellCodes'];
const cleanCode=v=>String(v||'').trim().toUpperCase().slice(0,80);
const keyFor=code=>'product/'+Buffer.from(cleanCode(code)).toString('base64url');
function store(){return getBlobStore(STORE)}
function cleanText(v,max){return String(v??'').trim().slice(0,max)}
function cleanArray(v,maxItems=30,maxLen=500){const source=Array.isArray(v)?v:String(v||'').split(/\r?\n|,/);return[...new Set(source.map(x=>String(x||'').trim().slice(0,maxLen)).filter(Boolean))].slice(0,maxItems)}
function validate(code,raw={}){
 const productCode=cleanCode(code);if(!productCode)return{ok:false,error:'Falta el código del producto.'};const data={code:productCode};
 for(const field of FIELDS)data[field]=cleanText(raw[field],MAX[field]);
 data.flavors=cleanArray(raw.flavors,50,100);data.gallery=cleanArray(raw.gallery,12,500);data.relatedCodes=cleanArray(raw.relatedCodes,20,80).map(cleanCode);data.upsellCodes=cleanArray(raw.upsellCodes,20,80).map(cleanCode);data.crossSellCodes=cleanArray(raw.crossSellCodes,20,80).map(cleanCode);
 if(data.ean&&!/^\d{8,14}$/.test(data.ean))return{ok:false,error:'EAN/GTIN debe tener entre 8 y 14 dígitos.'};
 if(data.video){try{const u=new URL(data.video);if(!['https:'].includes(u.protocol))return{ok:false,error:'El vídeo debe usar HTTPS.'}}catch{return{ok:false,error:'La URL de vídeo no es válida.'}};
 for(const url of data.gallery){if(url.startsWith('/'))continue;try{const u=new URL(url);if(u.protocol!=='https:')return{ok:false,error:'Las imágenes externas de galería deben usar HTTPS.'}}catch{return{ok:false,error:'Hay una URL de galería no válida.'}}}
 data.updatedAt=new Date().toISOString();return{ok:true,data};
}
async function read(code){const s=store();if(!s)return null;return s.get(keyFor(code),{type:'json',consistency:'strong'}).catch(()=>null)}
async function save(code,raw,actor){const checked=validate(code,raw);if(!checked.ok)throw Object.assign(new Error(checked.error),{statusCode:400});const s=store();if(!s)throw Object.assign(new Error('Contenido de producto no disponible.'),{statusCode:503});const previous=await read(code),next={...checked.data,createdAt:previous?.createdAt||new Date().toISOString(),updatedBy:String(actor||'').toLowerCase()};await s.setJSON(keyFor(code),next);return next}
async function list(){const s=store();if(!s)return[];const found=await s.list({prefix:'product/'}).catch(()=>({blobs:[]}));const rows=[];for(const item of found.blobs||[]){const value=await s.get(item.key,{type:'json',consistency:'strong'}).catch(()=>null);if(value)rows.push(value)}return rows.sort((a,b)=>String(a.code).localeCompare(String(b.code),'es'))}
async function replaceAll(rows=[]){const s=store();if(!s)throw new Error('Contenido de producto no disponible.');const current=await s.list({prefix:'product/'}).catch(()=>({blobs:[]}));for(const item of current.blobs||[])await s.delete(item.key).catch(()=>{});for(const row of rows){const checked=validate(row.code,row);if(!checked.ok)throw new Error(`Contenido inválido para ${row.code}: ${checked.error}`);await s.setJSON(keyFor(row.code),{...checked.data,createdAt:row.createdAt||new Date().toISOString(),updatedBy:row.updatedBy||'restore'})}return rows.length}
module.exports={FIELDS,ARRAY_FIELDS,cleanCode,keyFor,validate,read,save,list,replaceAll};
