'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='commerce-settings',KEY='settings';
const DEFAULT_NAV=[
 {id:'shop',label:'Tienda',href:'#products',enabled:true,order:10},
 {id:'categories',label:'Categorías',href:'#categories',enabled:true,order:20},
 {id:'takeaway',label:'Take Away',href:'#takeaway',enabled:true,order:30},
 {id:'about',label:'Nosotros',href:'#about',enabled:true,order:40},
 {id:'contact',label:'Contacto',href:'#contact',enabled:true,order:50},
];
const defaults={
 content:{bannerEnabled:false,bannerText:'',infoBarEnabled:true,infoBarText:'Tienda física en Santander · Atención personalizada',heroEnabled:true,heroBadge:'Nueva temporada 2026',heroTitle:'LLEVA TU RENDIMIENTO AL LÍMITE',heroSubtitle:'Suplementación deportiva, alimentación saludable y atención cercana desde nuestra tienda física en Santander.',heroPrimaryLabel:'Ver Productos',heroPrimaryHref:'#products',heroSecondaryLabel:'Explorar Categorías',heroSecondaryHref:'#categories',footerAbout:'En Nutretium seleccionamos nutrición deportiva y alimentación saludable con información clara y atención cercana.'},
 navigation:{managed:false,items:DEFAULT_NAV},
 contact:{phone:'633753517',email:'appnutretium@gmail.com',hours:'Lun – Sáb 09:30 – 22:00',address:'Calle La Albericia 1, Santander'},
 seo:{siteTitle:'NUTRETIUM | Nutrición Deportiva Premium',metaDescription:'Nutretium: suplementación deportiva, alimentación saludable, açaí, smoothies y nutrición en Santander.'},
 features:{trainer:true,takeaway:true,reviews:true,wishlist:true,compare:true,search:true},
 couponsManaged:false,coupons:[],points:{managed:false,enabled:false,perEuro:0},
 shipping:{managed:false,enabled:false,rateCents:null,freeFromCents:5000,country:'España',label:'Envío',methods:[]},
 payment:{managed:false,enabled:false,provider:'redsys',environment:'test',commerceLive:false,terminal:'1',merchantName:'Nutretium',label:'Tarjeta · Redsys',merchantUrl:'',urlOk:'',urlKo:''},
 integrations:{
  email:{managed:false,enabled:false,provider:'resend',from:'',orderNotificationEmail:''},
  tpvsol:{managed:false,enabled:false,mode:'',endpoint:'',validated:false}
 }
};
const clone=v=>JSON.parse(JSON.stringify(v));
function nullableCents(v,fallback=null){if(v===null||v===undefined||v==='')return fallback;const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n):fallback}
function safeText(v,fallback='',max=180){const clean=String(v??fallback).trim().replace(/[<>]/g,'').slice(0,max);return clean||fallback}
function safeHref(v,fallback='#'){const raw=String(v??fallback).trim().slice(0,300);if(!raw)return fallback;if(/^#[A-Za-z0-9_-]+$/.test(raw)||/^\/[A-Za-z0-9_./?#=&%-]*$/.test(raw)||/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_./?#=&%-]*)?$/.test(raw))return raw;return fallback}
function safeUrl(v){const raw=String(v||'').trim().slice(0,500);if(!raw)return'';try{const u=new URL(raw);return u.protocol==='https:'?u.toString():''}catch{return''}}
function safeEmail(v,fallback=''){const raw=String(v??fallback).trim().toLowerCase().slice(0,180);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)?raw:fallback}
function safeSender(v){const raw=String(v||'').trim().replace(/[\r\n]/g,'').slice(0,180);if(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(raw))return raw;if(/^[^<>]{1,80}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(raw))return raw;return''}
function normalizeNav(items){const src=Array.isArray(items)?items:DEFAULT_NAV;return src.slice(0,24).map((item,i)=>({id:String(item?.id||`item-${i+1}`).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||`item-${i+1}`,label:safeText(item?.label,'Enlace',50),href:safeHref(item?.href,'#'),enabled:item?.enabled!==false,order:Number.isFinite(Number(item?.order))?Math.round(Number(item.order)):((i+1)*10)})).filter(x=>x.label&&x.href).sort((a,b)=>a.order-b.order)}
function postalPrefixes(v){const src=Array.isArray(v)?v:String(v||'').split(',');return [...new Set(src.map(x=>String(x||'').trim().replace(/[^0-9A-Za-z-]/g,'').slice(0,10)).filter(Boolean))].slice(0,40)}
function normalizeShippingMethods(items){return(Array.isArray(items)?items:[]).slice(0,20).map((m,i)=>({id:String(m?.id||`method-${i+1}`).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||`method-${i+1}`,name:safeText(m?.name,'Envío',60),enabled:m?.enabled!==false,country:safeText(m?.country,'España',60),postalPrefixes:postalPrefixes(m?.postalPrefixes),rateCents:nullableCents(m?.rateCents,null),freeFromCents:nullableCents(m?.freeFromCents,null),eta:safeText(m?.eta,'',80),order:Number.isFinite(Number(m?.order))?Math.round(Number(m.order)):((i+1)*10)})).filter(m=>m.name).sort((a,b)=>a.order-b.order)}
function normalize(v){
 const src=v&&typeof v==='object'?v:{};
 const content=src.content&&typeof src.content==='object'?src.content:{};
 const navigation=src.navigation&&typeof src.navigation==='object'?src.navigation:{};
 const contact=src.contact&&typeof src.contact==='object'?src.contact:{};
 const seo=src.seo&&typeof src.seo==='object'?src.seo:{};
 const features=src.features&&typeof src.features==='object'?src.features:{};
 const points=src.points&&typeof src.points==='object'?src.points:{};
 const shipping=src.shipping&&typeof src.shipping==='object'?src.shipping:{};
 const payment=src.payment&&typeof src.payment==='object'?src.payment:{};
 const integrations=src.integrations&&typeof src.integrations==='object'?src.integrations:{};
 const email=integrations.email&&typeof integrations.email==='object'?integrations.email:{};
 const tpvsol=integrations.tpvsol&&typeof integrations.tpvsol==='object'?integrations.tpvsol:{};
 const coupons=Array.isArray(src.coupons)?src.coupons:[];
 return{
  content:{bannerEnabled:Boolean(content.bannerEnabled),bannerText:safeText(content.bannerText,'',180),infoBarEnabled:content.infoBarEnabled!==false,infoBarText:safeText(content.infoBarText,defaults.content.infoBarText,140),heroEnabled:content.heroEnabled!==false,heroBadge:safeText(content.heroBadge,defaults.content.heroBadge,80),heroTitle:safeText(content.heroTitle,defaults.content.heroTitle,120),heroSubtitle:safeText(content.heroSubtitle,defaults.content.heroSubtitle,260),heroPrimaryLabel:safeText(content.heroPrimaryLabel,defaults.content.heroPrimaryLabel,50),heroPrimaryHref:safeHref(content.heroPrimaryHref,defaults.content.heroPrimaryHref),heroSecondaryLabel:safeText(content.heroSecondaryLabel,defaults.content.heroSecondaryLabel,50),heroSecondaryHref:safeHref(content.heroSecondaryHref,defaults.content.heroSecondaryHref),footerAbout:safeText(content.footerAbout,defaults.content.footerAbout,500)},
  navigation:{managed:Boolean(navigation.managed),items:normalizeNav(navigation.items)},
  contact:{phone:String(contact.phone||defaults.contact.phone).replace(/[^0-9+]/g,'').slice(0,20)||defaults.contact.phone,email:safeEmail(contact.email,defaults.contact.email),hours:safeText(contact.hours,defaults.contact.hours,100),address:safeText(contact.address,defaults.contact.address,180)},
  seo:{siteTitle:safeText(seo.siteTitle,defaults.seo.siteTitle,120),metaDescription:safeText(seo.metaDescription,defaults.seo.metaDescription,260)},
  features:{trainer:features.trainer!==false,takeaway:features.takeaway!==false,reviews:features.reviews!==false,wishlist:features.wishlist!==false,compare:features.compare!==false,search:features.search!==false},
  couponsManaged:Boolean(src.couponsManaged),
  points:{managed:Boolean(points.managed),enabled:Boolean(points.enabled),perEuro:Math.max(0,Math.min(100,Number(points.perEuro)||0))},
  shipping:{managed:Boolean(shipping.managed),enabled:Boolean(shipping.enabled),rateCents:nullableCents(shipping.rateCents,null),freeFromCents:nullableCents(shipping.freeFromCents,shipping.freeFromCents===undefined?5000:null),country:safeText(shipping.country,'España',60),label:safeText(shipping.label,'Envío',60),methods:normalizeShippingMethods(shipping.methods)},
  payment:{managed:Boolean(payment.managed),enabled:Boolean(payment.enabled),provider:'redsys',environment:payment.environment==='production'?'production':'test',commerceLive:Boolean(payment.commerceLive),terminal:String(payment.terminal||'1').replace(/[^0-9]/g,'').slice(0,8)||'1',merchantName:safeText(payment.merchantName,'Nutretium',80),label:safeText(payment.label,'Tarjeta · Redsys',80),merchantUrl:safeUrl(payment.merchantUrl),urlOk:safeUrl(payment.urlOk),urlKo:safeUrl(payment.urlKo)},
  integrations:{
   email:{managed:Boolean(email.managed),enabled:Boolean(email.enabled),provider:'resend',from:safeSender(email.from),orderNotificationEmail:safeEmail(email.orderNotificationEmail,'')},
   tpvsol:{managed:Boolean(tpvsol.managed),enabled:Boolean(tpvsol.enabled),mode:['api','middleware'].includes(String(tpvsol.mode||'').toLowerCase())?String(tpvsol.mode).toLowerCase():'',endpoint:safeUrl(tpvsol.endpoint),validated:Boolean(tpvsol.validated)}
  },
  coupons:coupons.slice(0,100).map(c=>({code:String(c.code||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32),type:c.type==='fixed'?'fixed':'percent',value:Math.max(0,Number(c.value)||0),valueCents:Math.max(0,Math.round(Number(c.valueCents)||0)),minCents:Math.max(0,Math.round(Number(c.minCents)||0)),maxDiscountCents:Math.max(0,Math.round(Number(c.maxDiscountCents)||0)),label:safeText(c.label,'',80),active:c.active!==false})).filter(c=>c.code)
 };
}
function versionOf(value){return crypto.createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex').slice(0,24)}
async function readWithVersion(){const s=getBlobStore(STORE);if(!s)return{settings:clone(defaults),version:versionOf(defaults)};const v=await s.get(KEY,{type:'json',consistency:'strong'}).catch(()=>null);const settings=normalize(v);return{settings,version:versionOf(settings)}}
async function read(){return(await readWithVersion()).settings}
async function write(v,expectedVersion=null){const s=getBlobStore(STORE);if(!s||typeof s.getWithMetadata!=='function')throw Object.assign(new Error('settings store unavailable'),{code:'UNAVAILABLE'});const n=normalize(v),entry=await s.getWithMetadata(KEY,{type:'json',consistency:'strong'}).catch(()=>null),current=normalize(entry?.data),currentVersion=versionOf(current);if(expectedVersion&&String(expectedVersion)!==currentVersion)throw Object.assign(new Error('settings conflict'),{code:'CONFLICT',currentVersion});const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};const result=await s.setJSON(KEY,n,opts).catch(()=>null);if(result?.modified!==true)throw Object.assign(new Error('settings conflict'),{code:'CONFLICT'});return{settings:n,version:versionOf(n)}}
module.exports={read,readWithVersion,write,normalize,versionOf,defaults,normalizeNav,normalizeShippingMethods};
