'use strict';

const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');

const STORE='ai-ollama-pairing-v1';
const CONFIG_KEY='config';
const PAIR_TTL_MS=10*60*1000;
const safe=(v,max=160)=>String(v??'').trim().slice(0,max);
const nowIso=()=>new Date().toISOString();
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
const randomCode=()=>crypto.randomBytes(6).toString('hex').toUpperCase();
const randomToken=()=>crypto.randomBytes(32).toString('base64url');
function store(){const s=getBlobStore(STORE);if(!s)throw new Error('Emparejamiento Ollama no disponible.');return s}

async function readConfig(){
 const cfg=await store().get(CONFIG_KEY,{type:'json',consistency:'strong'}).catch(()=>null);
 return cfg&&typeof cfg==='object'?cfg:{enabled:false,model:'qwen3:4b',runnerCount:0,updatedAt:null};
}
async function writeConfig(patch={}){
 const s=store(),entry=await s.getWithMetadata(CONFIG_KEY,{type:'json',consistency:'strong'}).catch(()=>null),current=entry?.data||{enabled:false,model:'qwen3:4b',runnerCount:0};
 const next={...current,...patch,model:safe(patch.model??current.model,120)||'qwen3:4b',updatedAt:nowIso()};
 const write=entry?.etag?await s.setJSON(CONFIG_KEY,next,{onlyIfMatch:entry.etag}).catch(()=>null):await s.setJSON(CONFIG_KEY,next,{onlyIfNew:true}).catch(()=>null);
 if(write?.modified===true)return next;
 throw new Error('Conflicto al actualizar configuración Ollama.');
}

async function createPairing({createdBy,model='qwen3:4b'}={}){
 const code=randomCode(),id=`pair_${crypto.randomUUID()}`,createdAt=Date.now(),record={id,codeHash:hash(code),createdBy:safe(createdBy,180),createdAt:new Date(createdAt).toISOString(),expiresAt:new Date(createdAt+PAIR_TTL_MS).toISOString(),usedAt:null};
 await store().setJSON(id,record,{onlyIfNew:true});
 await writeConfig({model,enabled:true});
 return{code,expiresAt:record.expiresAt,model:safe(model,120)||'qwen3:4b'};
}

async function consumePairing({code,runnerId}){
 const candidate=hash(safe(code,64)),owner=safe(runnerId,120);if(!candidate||!owner)return{ok:false,code:'INVALID_PAIRING'};
 const s=store(),page=await s.list().catch(()=>({blobs:[]}));
 for(const blob of (page.blobs||[]).filter(x=>String(x.key).startsWith('pair_')).slice(-100)){
  const entry=await s.getWithMetadata(blob.key,{type:'json',consistency:'strong'}).catch(()=>null),rec=entry?.data;
  if(!rec||!entry?.etag||rec.usedAt||Date.parse(rec.expiresAt)<=Date.now()||rec.codeHash!==candidate)continue;
  const used={...rec,usedAt:nowIso(),runnerId:owner};const mark=await s.setJSON(blob.key,used,{onlyIfMatch:entry.etag}).catch(()=>null);if(mark?.modified!==true)continue;
  const token=randomToken(),runnerKey=`runner_${hash(owner).slice(0,32)}`,runner={id:runnerKey,runnerId:owner,tokenHash:hash(token),createdAt:nowIso(),lastSeenAt:null,revokedAt:null};
  const existing=await s.getWithMetadata(runnerKey,{type:'json',consistency:'strong'}).catch(()=>null);
  const wr=existing?.etag?await s.setJSON(runnerKey,runner,{onlyIfMatch:existing.etag}).catch(()=>null):await s.setJSON(runnerKey,runner,{onlyIfNew:true}).catch(()=>null);
  if(wr?.modified!==true)return{ok:false,code:'RUNNER_CONFLICT'};
  const cfg=await readConfig();await writeConfig({enabled:true,runnerCount:Math.max(Number(cfg.runnerCount||0),0)+(existing?.data?0:1)}).catch(()=>{});
  return{ok:true,token,runnerId:owner,config:await readConfig()};
 }
 return{ok:false,code:'INVALID_OR_EXPIRED'};
}

async function authenticate({token,runnerId,touch=true}){
 const owner=safe(runnerId,120),presented=hash(token);if(!owner||!token)return false;
 const s=store(),key=`runner_${hash(owner).slice(0,32)}`,entry=await s.getWithMetadata(key,{type:'json',consistency:'strong'}).catch(()=>null),rec=entry?.data;
 if(!rec||rec.revokedAt||rec.tokenHash!==presented)return false;
 if(touch&&entry?.etag){const now=nowIso();await s.setJSON(key,{...rec,lastSeenAt:now},{onlyIfMatch:entry.etag}).catch(()=>null)}
 return true;
}

async function status(){
 const cfg=await readConfig(),page=await store().list().catch(()=>({blobs:[]})),runnerKeys=(page.blobs||[]).map(x=>x.key).filter(k=>String(k).startsWith('runner_'));
 const runners=(await Promise.all(runnerKeys.slice(0,50).map(k=>store().get(k,{type:'json',consistency:'strong'}).catch(()=>null)))).filter(Boolean).map(r=>({runnerId:r.runnerId,lastSeenAt:r.lastSeenAt,createdAt:r.createdAt,revoked:Boolean(r.revokedAt)}));
 return{...cfg,runners};
}

module.exports={STORE,PAIR_TTL_MS,readConfig,writeConfig,createPairing,consumePairing,authenticate,status,hash};
