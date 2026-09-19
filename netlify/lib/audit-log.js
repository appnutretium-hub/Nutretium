'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const STORE='security-audit';
const HEAD='chain-head';
const MAX_META_BYTES=4096;
const REDACT=/pass(word)?|token|secret|authorization|cookie|base64|card|pan|cvv/i;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function stable(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return'['+value.map(stable).join(',')+']';
 return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
function digest(value){return crypto.createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex')}
function sanitize(value,depth=0){
 if(depth>5)return'[depth-limit]';
 if(value==null||['string','number','boolean'].includes(typeof value))return typeof value==='string'?value.slice(0,500):value;
 if(Array.isArray(value))return value.slice(0,50).map(v=>sanitize(v,depth+1));
 if(typeof value==='object'){
  const out={};for(const [k,v] of Object.entries(value).slice(0,50))out[k]=REDACT.test(k)?'[REDACTED]':sanitize(v,depth+1);
  return out;
 }
 return String(value).slice(0,200);
}
function ipHash(event){const raw=String(event?.headers?.['x-nf-client-connection-ip']||event?.headers?.['x-forwarded-for']||'').split(',')[0].trim();return raw?digest(raw).slice(0,24):null}
function eventHash(event){const copy={...event};delete copy.hash;return digest(copy)}
async function append({event,actor='system',action,resource='',outcome='SUCCESS',metadata={}}){
 const store=getBlobStore(STORE);if(!store||typeof store.getWithMetadata!=='function')throw new Error('Audit store no disponible');
 let clean=sanitize(metadata);let encoded=stable(clean);if(Buffer.byteLength(encoded)>MAX_META_BYTES)clean={truncated:true,digest:digest(encoded)};
 for(let attempt=0;attempt<12;attempt++){
  const headEntry=await store.getWithMetadata(HEAD,{type:'json',consistency:'strong'}).catch(()=>null);const head=headEntry?.data||null;
  const id=crypto.randomUUID(),key=`event-${String(Number(head?.seq||0)+1).padStart(12,'0')}-${id}`;
  const record={version:1,id,seq:Number(head?.seq||0)+1,at:new Date().toISOString(),actor:String(actor||'system').toLowerCase().slice(0,160),action:String(action||'UNKNOWN').slice(0,120),resource:String(resource||'').slice(0,220),outcome:String(outcome||'SUCCESS').slice(0,40),ipHash:ipHash(event),metadata:clean,previousHash:head?.hash||null,previousKey:head?.key||null};
  record.hash=eventHash(record);
  const eventWrite=await store.setJSON(key,record,{onlyIfNew:true}).catch(()=>null);if(eventWrite?.modified!==true)continue;
  const nextHead={version:1,seq:record.seq,hash:record.hash,key,updatedAt:record.at};
  const opts=headEntry?.etag?{onlyIfMatch:headEntry.etag}:{onlyIfNew:true};
  const headWrite=await store.setJSON(HEAD,nextHead,opts).catch(()=>null);
  if(headWrite?.modified===true)return clone(record);
  await store.delete(key).catch(()=>{});
 }
 throw new Error('Conflicto concurrente en auditoría');
}
async function recent(limit=50){
 const store=getBlobStore(STORE);if(!store)return[];const head=await store.get(HEAD,{type:'json',consistency:'strong'}).catch(()=>null);let key=head?.key||null;const rows=[];
 while(key&&rows.length<Math.max(1,Math.min(200,Number(limit)||50))){const row=await store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);if(!row)break;rows.push(row);key=row.previousKey||null}
 return rows;
}
async function verify(limit=500){
 const store=getBlobStore(STORE);if(!store)return{valid:false,error:'Audit store no disponible',checked:0};const head=await store.get(HEAD,{type:'json',consistency:'strong'}).catch(()=>null);if(!head)return{valid:true,checked:0,empty:true};
 let key=head.key,expectedHash=head.hash,expectedSeq=Number(head.seq),checked=0;const max=Math.max(1,Math.min(5000,Number(limit)||500));
 while(key&&checked<max){const row=await store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);if(!row)return{valid:false,checked,error:`Falta ${key}`};if(row.hash!==expectedHash||eventHash(row)!==row.hash||Number(row.seq)!==expectedSeq)return{valid:false,checked,error:`Cadena inválida en secuencia ${expectedSeq}`};checked++;expectedHash=row.previousHash||null;expectedSeq--;key=row.previousKey||null}
 if(!key&&expectedSeq!==0)return{valid:false,checked,error:'La cadena terminó antes de la secuencia esperada'};
 return{valid:true,checked,truncated:Boolean(key),head:{seq:head.seq,hash:head.hash,updatedAt:head.updatedAt}};
}
module.exports={append,recent,verify,eventHash,sanitize};
