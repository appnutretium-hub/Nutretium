'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const {sendEmail}=require('./email');
const STORE='ops-observability-v1';
const MAX_TEXT=800;
const safe=(v,n=MAX_TEXT)=>String(v??'').replace(/[<>]/g,'').slice(0,n);
const day=(value=Date.now())=>new Date(value).toISOString().slice(0,10);
const stamp=()=>new Date().toISOString();
function store(){return getBlobStore(STORE)}
function eventKey(type,at,id){return`event/${day(at)}/${String(at).replace(/[:.]/g,'-')}/${safe(type,60)}/${id}`}
async function record(type,payload={}){
 const s=store();if(!s)return null;const at=stamp(),id=crypto.randomUUID();
 const record={id,type:safe(type,60),at,severity:safe(payload.severity||'info',20),source:safe(payload.source||'platform',80),message:safe(payload.message||'',MAX_TEXT),metric:Number.isFinite(Number(payload.metric))?Number(payload.metric):null,tags:payload.tags&&typeof payload.tags==='object'?Object.fromEntries(Object.entries(payload.tags).slice(0,20).map(([k,v])=>[safe(k,60),safe(v,160)])):{}};
 await s.setJSON(eventKey(record.type,at,id),record,{onlyIfNew:true}).catch(()=>{});return record;
}
async function healthSnapshot(state={}){const s=store();if(!s)return null;const at=stamp(),record={at,ready:Boolean(state.ready),missing:Array.isArray(state.missing)?state.missing.map(v=>safe(v,100)).slice(0,50):[],checks:state.checks&&typeof state.checks==='object'?state.checks:{}};await s.setJSON(`health/${day(at)}/${at.replace(/[:.]/g,'-')}`,record).catch(()=>{});await s.setJSON('health/latest',record).catch(()=>{});return record}
async function recent({days=2,limit=250,type=''}={}){const s=store();if(!s)return[];const dates=[];for(let i=0;i<Math.max(1,Math.min(14,Number(days)||2));i++)dates.push(day(Date.now()-i*86400000));const rows=[];for(const d of dates){const found=await s.list({prefix:`event/${d}/`}).catch(()=>({blobs:[]}));for(const item of found.blobs||[]){const value=await s.get(item.key,{type:'json',consistency:'strong'}).catch(()=>null);if(value&&(!type||value.type===type))rows.push(value)}}return rows.sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,Math.max(1,Math.min(1000,Number(limit)||250)))}
async function postWebhook(alert){const url=String(process.env.OPS_ALERT_WEBHOOK_URL||'').trim();if(!url)return{skipped:true,reason:'not-configured'};let parsed;try{parsed=new URL(url)}catch{return{skipped:true,reason:'invalid-url'}}if(parsed.protocol!=='https:')return{skipped:true,reason:'https-required'};const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(alert),signal:controller.signal});return{ok:r.ok,status:r.status}}catch(err){return{ok:false,error:safe(err.message,200)}}finally{clearTimeout(timer)}}
async function alert({severity='warning',title,message,dedupeKey=''}){
 const payload={severity:safe(severity,20),title:safe(title,160),message:safe(message,MAX_TEXT),dedupeKey:safe(dedupeKey,160),at:stamp()};await record('alert',{severity:payload.severity,source:'alerting',message:`${payload.title}: ${payload.message}`,tags:{dedupeKey:payload.dedupeKey}});
 const results={webhook:await postWebhook(payload)};const to=String(process.env.OPS_ALERT_EMAIL||process.env.ORDER_NOTIFICATION_EMAIL||'').trim();if(to){results.email=await sendEmail({to,subject:`[NUTRETIUM][${payload.severity.toUpperCase()}] ${payload.title}`,html:`<p><strong>${payload.title}</strong></p><p>${payload.message}</p><p>${payload.at}</p>`,idempotencyKey:`ops-alert:${payload.dedupeKey||payload.title}:${day()}`}).catch(err=>({ok:false,error:safe(err.message,200)}))}else results.email={skipped:true,reason:'not-configured'};return results
}
module.exports={STORE,record,healthSnapshot,recent,alert,safe};
