'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
function ipOf(event){return String(event?.headers?.['x-nf-client-connection-ip']||event?.headers?.['x-forwarded-for']||event?.headers?.['client-ip']||'').split(',')[0].trim()}
function keyFor(scope,event,extra=''){return crypto.createHash('sha256').update(`${scope}|${ipOf(event)}|${String(extra).toLowerCase()}`).digest('hex')}
async function consume({scope,event,extra='',limit=10,windowMs=10*60*1000}){
 const store=getBlobStore(`rate-${scope}`);if(!store)return{allowed:true,degraded:true};
 const key=keyFor(scope,event,extra),now=Date.now();let state=null;try{state=await store.get(key,{type:'json'})}catch{}
 if(!state||!Number.isFinite(Number(state.startedAt))||now-Number(state.startedAt)>=windowMs)state={startedAt:now,count:0};
 const count=Number(state.count)||0;if(count>=limit)return{allowed:false,retryAfter:Math.max(1,Math.ceil((windowMs-(now-Number(state.startedAt)))/1000))};
 await store.setJSON(key,{startedAt:Number(state.startedAt),count:count+1});return{allowed:true};
}
module.exports={consume,ipOf};