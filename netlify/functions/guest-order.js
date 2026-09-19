'use strict';
const {getBlobStore}=require('../lib/blob-store');
const {cabecerasCORS}=require('../lib/cors');
const {verify}=require('../lib/guest-access');
const {consume}=require('../lib/rate-limit');
const CORS=cabecerasCORS('POST, OPTIONS');
const clean=(v,n)=>String(v||'').trim().slice(0,n);
function publicOrder(r){return{order:r.order,status:r.status||'PENDING',fulfilmentStatus:r.fulfilmentStatus||null,amount:Number(r.amount||0),items:Array.isArray(r.items)?r.items:[],createdAt:r.createdAt||null,receivedAt:r.receivedAt||null,tracking:r.tracking?{carrier:clean(r.tracking.carrier,80),code:clean(r.tracking.code,120),url:clean(r.tracking.url,500)}:null}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const rate=await consume({scope:'guest-order',event,limit:10,windowMs:10*60*1000}).catch(()=>({allowed:true}));if(!rate.allowed)return{statusCode:429,headers:{...CORS,'Retry-After':String(rate.retryAfter)},body:JSON.stringify({error:'Demasiadas consultas. Espera unos minutos.'})};
 let b;try{b=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:CORS,body:JSON.stringify({error:'JSON no válido.'})}};
 const order=clean(b.order,32),token=clean(b.token,200);if(!order||!token)return{statusCode:400,headers:CORS,body:JSON.stringify({error:'Faltan datos de seguimiento.'})};
 const store=getBlobStore('redsys-orders');if(!store)return{statusCode:503,headers:CORS,body:JSON.stringify({error:'Seguimiento no disponible temporalmente.'})};
 const rec=await store.get(order,{type:'json'}).catch(()=>null);if(!rec||!rec.guest||!verify(order,rec.email,token))return{statusCode:404,headers:CORS,body:JSON.stringify({error:'Pedido no encontrado o enlace no válido.'})};
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({order:publicOrder(rec)})};
};