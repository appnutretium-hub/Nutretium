'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='commerce-settings',KEY='settings';
const defaults={content:{bannerEnabled:false,bannerText:''},couponsManaged:false,coupons:[],points:{managed:false,enabled:false,perEuro:0}};
const clone=v=>JSON.parse(JSON.stringify(v));
function normalize(v){const src=v&&typeof v==='object'?v:{};const content=src.content&&typeof src.content==='object'?src.content:{};const points=src.points&&typeof src.points==='object'?src.points:{};const coupons=Array.isArray(src.coupons)?src.coupons:[];return{content:{bannerEnabled:Boolean(content.bannerEnabled),bannerText:String(content.bannerText||'').trim().replace(/[<>]/g,'').slice(0,180)},couponsManaged:Boolean(src.couponsManaged),points:{managed:Boolean(points.managed),enabled:Boolean(points.enabled),perEuro:Math.max(0,Math.min(100,Number(points.perEuro)||0))},coupons:coupons.slice(0,100).map(c=>({code:String(c.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32),type:c.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(c.value)||0),valueCents:Math.max(0,Math.round(Number(c.valueCents)||0)),minCents:Math.max(0,Math.round(Number(c.minCents)||0)),maxDiscountCents:Math.max(0,Math.round(Number(c.maxDiscountCents)||0)),label:String(c.label||'').trim().replace(/[<>]/g,'').slice(0,80),active:c.active!==false})).filter(c=>c.code)}}
function versionOf(value){return crypto.createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex').slice(0,24)}
async function readWithVersion(){const s=getBlobStore(STORE);if(!s)return{settings:clone(defaults),version:versionOf(defaults)};const v=await s.get(KEY,{type:'json',consistency:'strong'}).catch(()=>null);const settings=normalize(v);return{settings,version:versionOf(settings)}}
async function read(){return(await readWithVersion()).settings}
async function write(v,expectedVersion=null){
 const s=getBlobStore(STORE);if(!s||typeof s.getWithMetadata!=='function')throw Object.assign(new Error('settings store unavailable'),{code:'UNAVAILABLE'});
 const n=normalize(v),entry=await s.getWithMetadata(KEY,{type:'json',consistency:'strong'}).catch(()=>null),current=normalize(entry?.data),currentVersion=versionOf(current);
 if(expectedVersion&&String(expectedVersion)!==currentVersion)throw Object.assign(new Error('settings conflict'),{code:'CONFLICT',currentVersion});
 const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};const result=await s.setJSON(KEY,n,opts).catch(()=>null);
 if(result?.modified!==true)throw Object.assign(new Error('settings conflict'),{code:'CONFLICT'});
 return{settings:n,version:versionOf(n)};
}
module.exports={read,readWithVersion,write,normalize,versionOf,defaults};
