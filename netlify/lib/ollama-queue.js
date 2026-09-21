'use strict';

const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='ai-ollama-jobs-v1';
const MAX_ATTEMPTS=5;
const DEFAULT_LEASE_MS=2*60*1000;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const nowIso=()=>new Date().toISOString();
const safe=(v,max=200)=>String(v??'').trim().slice(0,max);
const digest=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

function store(){const s=getBlobStore(STORE);if(!s)throw new Error('Cola Ollama no disponible.');return s}
function jobId(dedupeKey){return `ollama_${digest(dedupeKey).slice(0,40)}`}
function leaseExpired(job,now=Date.now()){const t=Date.parse(job?.leaseExpiresAt||0);return !Number.isFinite(t)||t<=now}
function runnable(job,now=Date.now()){
 if(!job)return false;
 if(job.status==='pending')return !job.notBefore||Date.parse(job.notBefore)<=now;
 return job.status==='processing'&&leaseExpired(job,now);
}

async function enqueue({agent,action,messages,model=null,validation='NO_VALIDADO',requiredSources=[],dedupeKey}){
 const key=safe(dedupeKey,500);if(!key)throw new Error('Ollama job requiere dedupeKey.');
 const id=jobId(key),createdAt=nowIso(),job={id,status:'pending',agent:safe(agent,80),action:safe(action,120),model:safe(model,120)||null,
  messages:Array.isArray(messages)?messages.slice(0,20).map(m=>({role:['system','user','assistant'].includes(m?.role)?m.role:'user',content:safe(m?.content,30000)})):[],
  validation:safe(validation,30),requiredSources:Array.isArray(requiredSources)?requiredSources.slice(0,50).map(x=>safe(x,80)):[],attempts:0,
  createdAt,updatedAt:createdAt,leaseId:null,leaseOwner:null,leaseExpiresAt:null,completedAt:null,failedAt:null,result:null,error:null};
 const write=await store().setJSON(id,job,{onlyIfNew:true}).catch(()=>null);
 if(write?.modified===true)return{created:true,job};
 const existing=await store().get(id,{type:'json',consistency:'strong'}).catch(()=>null);
 return{created:false,job:existing||job};
}

async function list({limit=200}={}){
 const s=store(),page=await s.list().catch(()=>({blobs:[]})),keys=(page.blobs||[]).map(x=>x.key).slice(0,Math.max(1,Math.min(1000,Number(limit)||200)));
 const rows=await Promise.all(keys.map(k=>s.get(k,{type:'json',consistency:'strong'}).catch(()=>null)));
 return rows.filter(Boolean).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}

async function claim({runnerId,leaseMs=DEFAULT_LEASE_MS}={}){
 const owner=safe(runnerId,120);if(!owner)throw new Error('runnerId obligatorio.');
 const s=store(),page=await s.list().catch(()=>({blobs:[]})),now=Date.now();
 for(const blob of (page.blobs||[]).slice(0,500)){
  const entry=await s.getWithMetadata(blob.key,{type:'json',consistency:'strong'}).catch(()=>null),job=entry?.data;
  if(!job||!entry?.etag||!runnable(job,now)||Number(job.attempts||0)>=MAX_ATTEMPTS)continue;
  const leaseId=crypto.randomUUID(),next={...job,status:'processing',attempts:Number(job.attempts||0)+1,leaseId,leaseOwner:owner,
   leaseExpiresAt:new Date(now+Math.max(30000,Math.min(10*60*1000,Number(leaseMs)||DEFAULT_LEASE_MS))).toISOString(),updatedAt:nowIso(),error:null};
  const write=await s.setJSON(blob.key,next,{onlyIfMatch:entry.etag}).catch(()=>null);
  if(write?.modified===true)return clone(next);
 }
 return null;
}

async function mutateLeased(id,leaseId,mutator){
 const s=store(),entry=await s.getWithMetadata(safe(id,120),{type:'json',consistency:'strong'}).catch(()=>null);
 if(!entry?.data||!entry?.etag)return{ok:false,code:'NOT_FOUND'};
 const current=entry.data;if(current.status!=='processing'||current.leaseId!==safe(leaseId,120))return{ok:false,code:'LEASE_MISMATCH'};
 const next=mutator(clone(current)),write=await s.setJSON(current.id,next,{onlyIfMatch:entry.etag}).catch(()=>null);
 return write?.modified===true?{ok:true,job:next}:{ok:false,code:'CONFLICT'};
}

async function heartbeat({id,leaseId,runnerId,leaseMs=DEFAULT_LEASE_MS}){
 return mutateLeased(id,leaseId,current=>({...current,leaseOwner:safe(runnerId,120)||current.leaseOwner,leaseExpiresAt:new Date(Date.now()+Math.max(30000,Math.min(10*60*1000,Number(leaseMs)||DEFAULT_LEASE_MS))).toISOString(),updatedAt:nowIso()}));
}
async function complete({id,leaseId,result,model}){
 return mutateLeased(id,leaseId,current=>({...current,status:'completed',result:safe(result,50000),model:safe(model,120)||current.model,completedAt:nowIso(),updatedAt:nowIso(),leaseId:null,leaseOwner:null,leaseExpiresAt:null,error:null}));
}
async function fail({id,leaseId,error,retryDelayMs=30000}){
 return mutateLeased(id,leaseId,current=>{
  const terminal=Number(current.attempts||0)>=MAX_ATTEMPTS,at=nowIso();
  return{...current,status:terminal?'failed':'pending',error:safe(error,2000),failedAt:terminal?at:null,notBefore:terminal?null:new Date(Date.now()+Math.max(5000,Math.min(60*60*1000,Number(retryDelayMs)||30000))).toISOString(),updatedAt:at,leaseId:null,leaseOwner:null,leaseExpiresAt:null};
 });
}
async function stats(){const rows=await list({limit:500}),counts={pending:0,processing:0,completed:0,failed:0};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;const lastCompleted=rows.filter(x=>x.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)))[0]||null;return{...counts,total:rows.length,lastCompletedAt:lastCompleted?.completedAt||null,lastModel:lastCompleted?.model||null}}

module.exports={STORE,MAX_ATTEMPTS,DEFAULT_LEASE_MS,enqueue,list,claim,heartbeat,complete,fail,stats,jobId,leaseExpired,runnable};
