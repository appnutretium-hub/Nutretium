'use strict';
const crypto=require('crypto');
const enterprise=require('./enterprise-store');
const SYSTEM={email:'ai-memory@nutretium.local',role:'system'};
const TYPES=new Set(['fact','operational','strategic','learning']);
const safe=v=>String(v||'').trim();

async function remember({type='learning',agent,subject,content,evidence=[],confidence='medium',outcome=null}){
 if(!TYPES.has(type))throw new Error('Tipo de memoria no permitido.');
 const text=safe(content);if(!text)throw new Error('Memoria vacía.');
 const id=crypto.randomUUID(),record={id,type,agent:safe(agent),subject:safe(subject),content:text.slice(0,12000),evidence:Array.isArray(evidence)?evidence.slice(0,50):[],confidence:safe(confidence).toLowerCase(),outcome,createdAt:new Date().toISOString(),status:type==='fact'?'pending_validation':'active'};
 await enterprise.save('ai-memory',record,SYSTEM,{id,create:true,reason:'ai-memory-create'});return record;
}
async function recent(limit=100){return enterprise.list('ai-memory',{limit:Math.max(1,Math.min(500,Number(limit)||100))}).catch(()=>[])}
async function promoteFact(id,validation){
 const current=await enterprise.get('ai-memory',id);if(!current||current.type!=='fact')throw new Error('Memoria factual no encontrada.');
 if(!validation||validation.status!=='VALIDADO'||!Array.isArray(validation.sources)||!validation.sources.length)throw new Error('Un hecho requiere evidencia validada.');
 return enterprise.save('ai-memory',{...current,status:'validated',validation,validatedAt:new Date().toISOString()},SYSTEM,{id,reason:'ai-memory-fact-validated'});
}
module.exports={TYPES,remember,recent,promoteFact,SYSTEM};
