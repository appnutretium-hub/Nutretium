'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const FALLBACK_ROOT=globalThis.__NUTRETIUM_RATE_LIMIT_FALLBACK__||(globalThis.__NUTRETIUM_RATE_LIMIT_FALLBACK__=new Map());
function ipOf(event){return String(event?.headers?.['x-nf-client-connection-ip']||event?.headers?.['x-forwarded-for']||event?.headers?.['client-ip']||'').split(',')[0].trim()}
function keyFor(scope,event,extra=''){return crypto.createHash('sha256').update(`${scope}|${ipOf(event)}|${String(extra).toLowerCase()}`).digest('hex')}
function fallbackConsume({scope,event,extra='',limit=10,windowMs=10*60*1000}){
 const key=`${scope}:${keyFor(scope,event,extra)}`,now=Date.now();let state=FALLBACK_ROOT.get(key);
 if(!state||!Number.isFinite(Number(state.startedAt))||now-Number(state.startedAt)>=windowMs)state={startedAt:now,count:0};
 if(Number(state.count)>=limit)return{allowed:false,degraded:true,retryAfter:Math.max(1,Math.ceil((windowMs-(now-Number(state.startedAt)))/1000)),fallback:true};
 state={startedAt:Number(state.startedAt),count:Number(state.count||0)+1};FALLBACK_ROOT.set(key,state);
 return{allowed:true,degraded:true,remaining:Math.max(0,limit-state.count),fallback:true};
}
function degradedResult({scope,event,extra,limit,windowMs,allowDegradedFallback}){
 return allowDegradedFallback===true?fallbackConsume({scope,event,extra,limit,windowMs}):{allowed:false,degraded:true,retryAfter:60};
}
async function consume({scope,event,extra='',limit=10,windowMs=10*60*1000,allowDegradedFallback=false}){
 const store=getBlobStore(`rate-${scope}`);if(!store||typeof store.getWithMetadata!=='function')return degradedResult({scope,event,extra,limit,windowMs,allowDegradedFallback});
 const key=keyFor(scope,event,extra),now=Date.now();
 for(let attempt=0;attempt<10;attempt++){
  let entry=null;try{entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'})}catch{return degradedResult({scope,event,extra,limit,windowMs,allowDegradedFallback})}
  let state=entry?.data;
  if(!state||!Number.isFinite(Number(state.startedAt))||now-Number(state.startedAt)>=windowMs)state={startedAt:now,count:0};
  const count=Number(state.count)||0;
  if(count>=limit)return{allowed:false,retryAfter:Math.max(1,Math.ceil((windowMs-(now-Number(state.startedAt)))/1000))};
  const next={startedAt:Number(state.startedAt),count:count+1};
  const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};
  const write=await store.setJSON(key,next,opts).catch(()=>null);
  if(write?.modified===true)return{allowed:true,remaining:Math.max(0,limit-next.count)};
 }
 return degradedResult({scope,event,extra,limit,windowMs,allowDegradedFallback});
}
// Mira si la clave ya está castigada SIN gastar un intento. Sirve para frenar
// antes de comprobar la contraseña: si no, acertar durante el castigo entraba
// igual y el freno no frenaba nada. Si el almacén no responde devuelve
// degraded y quien llama decide; el login sigue fallando cerrado con consume().
async function consulta({scope,event,extra='',limit=10,windowMs=10*60*1000}){
 const store=getBlobStore(`rate-${scope}`);if(!store||typeof store.getWithMetadata!=='function')return{blocked:false,degraded:true};
 let entry=null;try{entry=await store.getWithMetadata(keyFor(scope,event,extra),{type:'json',consistency:'strong'})}catch{return{blocked:false,degraded:true}}
 const state=entry?.data,now=Date.now();
 if(!state||!Number.isFinite(Number(state.startedAt))||now-Number(state.startedAt)>=windowMs)return{blocked:false};
 if((Number(state.count)||0)<limit)return{blocked:false};
 return{blocked:true,retryAfter:Math.max(1,Math.ceil((windowMs-(now-Number(state.startedAt)))/1000))};
}
async function reset({scope,event,extra=''}){
 const rawKey=keyFor(scope,event,extra);FALLBACK_ROOT.delete(`${scope}:${rawKey}`);
 const store=getBlobStore(`rate-${scope}`);if(!store)return true;
 try{await store.delete(rawKey);return true}catch{return false}
}
module.exports={consume,consulta,reset,ipOf,keyFor,fallbackConsume,degradedResult};
