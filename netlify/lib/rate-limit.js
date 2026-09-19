'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
function ipOf(event){return String(event?.headers?.['x-nf-client-connection-ip']||event?.headers?.['x-forwarded-for']||event?.headers?.['client-ip']||'').split(',')[0].trim()}
function keyFor(scope,event,extra=''){return crypto.createHash('sha256').update(`${scope}|${ipOf(event)}|${String(extra).toLowerCase()}`).digest('hex')}
async function consume({scope,event,extra='',limit=10,windowMs=10*60*1000}){
 const store=getBlobStore(`rate-${scope}`);if(!store||typeof store.getWithMetadata!=='function')return{allowed:false,degraded:true,retryAfter:60};
 const key=keyFor(scope,event,extra),now=Date.now();
 for(let attempt=0;attempt<10;attempt++){
  let entry=null;try{entry=await store.getWithMetadata(key,{type:'json',consistency:'strong'})}catch{return{allowed:false,degraded:true,retryAfter:60}}
  let state=entry?.data;
  if(!state||!Number.isFinite(Number(state.startedAt))||now-Number(state.startedAt)>=windowMs)state={startedAt:now,count:0};
  const count=Number(state.count)||0;
  if(count>=limit)return{allowed:false,retryAfter:Math.max(1,Math.ceil((windowMs-(now-Number(state.startedAt)))/1000))};
  const next={startedAt:Number(state.startedAt),count:count+1};
  const opts=entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true};
  const write=await store.setJSON(key,next,opts).catch(()=>null);
  if(write?.modified===true)return{allowed:true,remaining:Math.max(0,limit-next.count)};
 }
 return{allowed:false,degraded:true,retryAfter:5};
}
module.exports={consume,ipOf};