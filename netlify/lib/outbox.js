'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='commerce-outbox-v1';
const MAX_ATTEMPTS=8;
const safe=(v,n=300)=>String(v??'').slice(0,n);
function storeOrThrow(){const store=getBlobStore(STORE);if(!store)throw Object.assign(new Error('Outbox no disponible'),{code:'OUTBOX_UNAVAILABLE'});return store}
function jobId(type,key){return crypto.createHash('sha256').update(`${safe(type,80)}|${safe(key,500)}`).digest('hex')}
function jobKey(type,key){return`job/${safe(type,80).replace(/[^a-zA-Z0-9._-]/g,'-')}/${jobId(type,key)}`}
function nowIso(){return new Date().toISOString()}
function nextDelayMs(attempt){return Math.min(6*60*60*1000,Math.max(15*1000,Math.pow(2,Math.max(0,attempt-1))*30*1000))}
async function enqueue(type,key,payload={}){
 const store=storeOrThrow(),path=jobKey(type,key),existing=await store.get(path,{type:'json',consistency:'strong'}).catch(()=>null);
 if(existing)return existing;
 const at=nowIso(),job={id:jobId(type,key),type:safe(type,80),key:safe(key,500),status:'pending',attempts:0,payload,createdAt:at,updatedAt:at,nextAttemptAt:at};
 const write=await store.setJSON(path,job,{onlyIfNew:true}).catch(()=>null);
 if(write?.modified===false)return store.get(path,{type:'json',consistency:'strong'});
 return job;
}
async function due(limit=25){
 const store=storeOrThrow(),found=await store.list({prefix:'job/'}),now=Date.now(),rows=[];
 for(const blob of(found.blobs||[])){
  if(rows.length>=Math.max(1,Math.min(100,Number(limit)||25)))break;
  const job=await store.get(blob.key,{type:'json',consistency:'strong'}).catch(()=>null);
  if(!job||!['pending','retry'].includes(job.status))continue;
  const next=Date.parse(job.nextAttemptAt||job.createdAt||0);if(Number.isFinite(next)&&next>now)continue;
  rows.push({path:blob.key,job});
 }
 return rows.sort((a,b)=>String(a.job.nextAttemptAt||'').localeCompare(String(b.job.nextAttemptAt||'')));
}
async function claim(path){
 const store=storeOrThrow();if(typeof store.getWithMetadata!=='function')throw new Error('Outbox requiere control de concurrencia');
 const entry=await store.getWithMetadata(path,{type:'json',consistency:'strong'}).catch(()=>null),job=entry?.data;
 if(!job||!['pending','retry'].includes(job.status))return null;
 if(Date.parse(job.nextAttemptAt||0)>Date.now())return null;
 const claimId=crypto.randomUUID(),next={...job,status:'processing',claimId,claimedAt:nowIso(),updatedAt:nowIso()};
 const write=await store.setJSON(path,next,{onlyIfMatch:entry.etag}).catch(()=>null);if(write?.modified!==true)return null;
 return{path,job:next,claimId};
}
async function finish(path,claimId,{ok,error=''}={}){
 const store=storeOrThrow();
 for(let i=0;i<6;i++){
  const entry=await store.getWithMetadata(path,{type:'json',consistency:'strong'}).catch(()=>null),job=entry?.data;
  if(!job||job.claimId!==claimId)return false;
  const attempts=Number(job.attempts||0)+(ok?0:1),at=nowIso();
  const next=ok?{...job,status:'completed',completedAt:at,updatedAt:at,claimId:null,claimedAt:null}:{...job,status:attempts>=MAX_ATTEMPTS?'failed':'retry',attempts,lastError:safe(error,1000),updatedAt:at,claimId:null,claimedAt:null,nextAttemptAt:new Date(Date.now()+nextDelayMs(attempts)).toISOString()};
  const write=await store.setJSON(path,next,{onlyIfMatch:entry.etag}).catch(()=>null);if(write?.modified===true)return true;
 }
 return false;
}
async function stats(){
 const store=storeOrThrow(),found=await store.list({prefix:'job/'}),counts={pending:0,retry:0,processing:0,completed:0,failed:0,total:0};
 for(const blob of(found.blobs||[])){const job=await store.get(blob.key,{type:'json'}).catch(()=>null);if(!job)continue;counts.total++;if(counts[job.status]!==undefined)counts[job.status]++;}
 return counts;
}
module.exports={STORE,MAX_ATTEMPTS,jobId,jobKey,enqueue,due,claim,finish,stats,nextDelayMs};
