'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const {getSecret}=require('./jwt');
const STORE='site-config-v1',KEY='config';
const defaults={
 general:{siteName:'Nutretium',tagline:'Nutrición & Rendimiento',phone:'633 753 517',email:'',address:'C/ La Albericia 1, Santander',hours:'Lun – Sáb 09:30 – 22:00',maintenance:false},
 appearance:{announcementEnabled:false,announcementText:'',announcementUrl:'',announcementBg:'#d4af37',announcementTextColor:'#080808'},
 navigation:{items:[{label:'Inicio',url:'/'},{label:'Suplementación',url:'/#productos'},{label:'Açaí & Smoothies',url:'/#comida-saludable'},{label:'Ayuda',url:'/ayuda'}]},
 homepage:{heroTitle:'',heroSubtitle:'',heroCtaLabel:'',heroCtaUrl:'',showCategories:true,showProducts:true,showReviews:true},
 social:{instagram:'',tiktok:'',facebook:'',youtube:''},
 seo:{title:'',description:''},
 shipping:{enabled:false,label:'Envío',rateCents:null,freeFromCents:5000,country:'España',deliveryText:'',pickupEnabled:true,pickupLabel:'Recogida en tienda'},
 payment:{provider:'redsys',enabled:false,environment:'test',merchantCode:'',terminal:'1',commerceLive:false,hasSecret:false}
};
const clone=v=>JSON.parse(JSON.stringify(v));
const text=(v,max=180)=>String(v??'').trim().replace(/[<>]/g,'').slice(0,max);
const url=(v,max=500)=>{const s=String(v||'').trim().slice(0,max);if(!s)return'';if(s.startsWith('/')||s.startsWith('#'))return s;try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return''}};
const cents=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)):null);
function normalize(src={}){
 const s=src&&typeof src==='object'?src:{},g=s.general||{},a=s.appearance||{},n=s.navigation||{},h=s.homepage||{},so=s.social||{},seo=s.seo||{},sh=s.shipping||{},p=s.payment||{};
 return{
  general:{siteName:text(g.siteName,'Nutretium',80)||'Nutretium',tagline:text(g.tagline,120),phone:text(g.phone,30),email:text(g.email,120),address:text(g.address,180),hours:text(g.hours,120),maintenance:Boolean(g.maintenance)},
  appearance:{announcementEnabled:Boolean(a.announcementEnabled),announcementText:text(a.announcementText,220),announcementUrl:url(a.announcementUrl),announcementBg:/^#[0-9a-f]{6}$/i.test(a.announcementBg||'')?a.announcementBg:'#d4af37',announcementTextColor:/^#[0-9a-f]{6}$/i.test(a.announcementTextColor||'')?a.announcementTextColor:'#080808'},
  navigation:{items:(Array.isArray(n.items)?n.items:[]).slice(0,12).map(i=>({label:text(i.label,50),url:url(i.url,300),enabled:i.enabled!==false})).filter(i=>i.label&&i.url)},
  homepage:{heroTitle:text(h.heroTitle,120),heroSubtitle:text(h.heroSubtitle,240),heroCtaLabel:text(h.heroCtaLabel,50),heroCtaUrl:url(h.heroCtaUrl,300),showCategories:h.showCategories!==false,showProducts:h.showProducts!==false,showReviews:h.showReviews!==false},
  social:{instagram:url(so.instagram),tiktok:url(so.tiktok),facebook:url(so.facebook),youtube:url(so.youtube)},
  seo:{title:text(seo.title,70),description:text(seo.description,170)},
  shipping:{enabled:Boolean(sh.enabled),label:text(sh.label,60)||'Envío',rateCents:cents(sh.rateCents),freeFromCents:cents(sh.freeFromCents),country:text(sh.country,60)||'España',deliveryText:text(sh.deliveryText,120),pickupEnabled:sh.pickupEnabled!==false,pickupLabel:text(sh.pickupLabel,60)||'Recogida en tienda'},
  payment:{provider:'redsys',enabled:Boolean(p.enabled),environment:p.environment==='production'?'production':'test',merchantCode:text(p.merchantCode,20).replace(/\D/g,''),terminal:text(p.terminal,4).replace(/\D/g,'')||'1',commerceLive:Boolean(p.commerceLive),hasSecret:Boolean(p.hasSecret)}
 };
}
function versionOf(v){return crypto.createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex').slice(0,24)}
async function readWithVersion(){const st=getBlobStore(STORE);if(!st)return{config:clone(defaults),version:versionOf(defaults)};const raw=await st.get(KEY,{type:'json',consistency:'strong'}).catch(()=>null);const config=normalize(raw||defaults);return{config,version:versionOf(config)}}
async function write(v,expectedVersion){const st=getBlobStore(STORE);if(!st||typeof st.getWithMetadata!=='function')throw Object.assign(new Error('site config unavailable'),{code:'UNAVAILABLE'});const entry=await st.getWithMetadata(KEY,{type:'json',consistency:'strong'}).catch(()=>null),current=normalize(entry?.data||defaults),currentVersion=versionOf(current);if(expectedVersion&&expectedVersion!==currentVersion)throw Object.assign(new Error('conflict'),{code:'CONFLICT',currentVersion});const next=normalize(v),opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true},res=await st.setJSON(KEY,next,opts);if(res?.modified!==true)throw Object.assign(new Error('conflict'),{code:'CONFLICT'});return{config:next,version:versionOf(next)}}
function vaultKey(){return crypto.createHash('sha256').update(getSecret()).update('|nutretium-site-config-v1|').digest()}
function encrypt(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',vaultKey(),iv),data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return{v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}}
function decrypt(box){if(!box?.iv||!box?.tag||!box?.data)return'';const d=crypto.createDecipheriv('aes-256-gcm',vaultKey(),Buffer.from(box.iv,'base64'));d.setAuthTag(Buffer.from(box.tag,'base64'));return Buffer.concat([d.update(Buffer.from(box.data,'base64')),d.final()]).toString('utf8')}
async function setPaymentSecret(secret){const st=getBlobStore(STORE);if(!st)throw new Error('vault unavailable');const clean=String(secret||'').trim();if(!clean)throw new Error('Clave Redsys vacía');await st.setJSON('secret/redsys',encrypt(clean));return true}
async function paymentRuntime(){const {config}=await readWithVersion(),p=config.payment,st=getBlobStore(STORE);let secret='';if(st)secret=decrypt(await st.get('secret/redsys',{type:'json',consistency:'strong'}).catch(()=>null));return{enabled:p.enabled,environment:p.environment,merchantCode:p.merchantCode,terminal:p.terminal,commerceLive:p.commerceLive,secret:secret||process.env.REDSYS_SECRET_KEY||'',source:secret?'panel':'environment'}}
function publicConfig(config){const c=normalize(config);return{general:c.general,appearance:c.appearance,navigation:c.navigation,homepage:c.homepage,social:c.social,seo:c.seo,shipping:c.shipping,payment:{provider:'redsys',enabled:c.payment.enabled,environment:c.payment.environment,ready:Boolean(c.payment.enabled&&c.payment.merchantCode&&c.payment.hasSecret)}}}
module.exports={STORE,defaults,normalize,versionOf,readWithVersion,write,setPaymentSecret,paymentRuntime,publicConfig};
