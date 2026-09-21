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
function weight(record){
 if(record?.type==='fact'&&record?.status==='validated')return 1;
 if(record?.type==='operational')return 0.75;
 if(record?.type==='strategic')return 0.65;
 if(record?.type==='learning')return 0.4;
 return 0.2;
}
async function learningContext({subject='',agent='',limit=20}={}){
 const rows=await recent(Math.max(50,Number(limit)||20));
 const s=safe(subject).toLowerCase(),a=safe(agent).toLowerCase();
 const filtered=rows.filter(r=>{
   if(r?.archivedAt)return false;
   if(r?.type==='fact'&&r?.status!=='validated')return false;
   if(a&&safe(r.agent).toLowerCase()!==a&&safe(r.agent).toLowerCase()!=='ai_federation')return false;
   if(!s)return true;
   const hay=`${safe(r.subject)} ${safe(r.content)}`.toLowerCase();
   return hay.includes(s)||s.split(/\s+/).filter(x=>x.length>3).some(x=>hay.includes(x));
 }).sort((x,y)=>weight(y)-weight(x)||String(y.createdAt||'').localeCompare(String(x.createdAt||''))).slice(0,Math.max(1,Math.min(50,Number(limit)||20)));
 return filtered.map(r=>({id:r.id,type:r.type,status:r.status,subject:r.subject,content:safe(r.content).slice(0,2000),evidence:Array.isArray(r.evidence)?r.evidence.slice(0,20):[],confidence:r.confidence,weight:weight(r),createdAt:r.createdAt}));
}
module.exports={TYPES,remember,recent,promoteFact,learningContext,weight,SYSTEM};
