'use strict';

const enterprise=require('./enterprise-store');
const memory=require('./ai-memory');
const zeroCost=require('./zero-cost-policy');

const SYSTEM={email:'ai-federation@nutretium.local',role:'system'};
const DAY=()=>new Date().toISOString().slice(0,10);
const truthy=v=>['1','true','yes','on'].includes(String(v||'').trim().toLowerCase());
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));

const PROVIDERS=Object.freeze({
  gemini_free:Object.freeze({
    label:'Google Gemini Free Tier',kind:'external-free',dailyCap:20,timeoutMs:8000,
    enabled:env=>Boolean(env.GEMINI_API_KEY)&&truthy(env.GEMINI_FREE_TIER_CONFIRMED),
    model:env=>String(env.GEMINI_FREE_MODEL||'gemini-3.8-flash').trim(),
  }),
  groq_free:Object.freeze({
    label:'Groq Free Tier',kind:'external-free',dailyCap:100,timeoutMs:7000,
    enabled:env=>Boolean(env.GROQ_API_KEY)&&truthy(env.GROQ_FREE_TIER_CONFIRMED),
    model:env=>String(env.GROQ_FREE_MODEL||'openai/gpt-oss-20b').trim(),
  }),
  openrouter_free:Object.freeze({
    label:'OpenRouter Free',kind:'external-free',dailyCap:40,timeoutMs:8000,
    enabled:env=>Boolean(env.OPENROUTER_API_KEY)&&truthy(env.OPENROUTER_FREE_PLAN_CONFIRMED),
    model:()=> 'openrouter/free',
  }),
  cloudflare_free:Object.freeze({
    label:'Cloudflare Workers AI Free',kind:'external-free',dailyCap:20,timeoutMs:7000,
    enabled:env=>Boolean(env.CLOUDFLARE_ACCOUNT_ID&&env.CLOUDFLARE_API_TOKEN)&&truthy(env.CLOUDFLARE_WORKERS_FREE_PLAN_CONFIRMED),
    model:env=>String(env.CLOUDFLARE_FREE_MODEL||'@cf/google/gemma-4-26b-a4b-it').trim(),
  }),
  ollama_local:Object.freeze({
    label:'Ollama Local',kind:'self-hosted',dailyCap:500,timeoutMs:10000,
    enabled:env=>Boolean(env.AI_OLLAMA_GATEWAY_URL&&env.AI_OLLAMA_GATEWAY_TOKEN)&&truthy(env.AI_ZERO_COST_SELF_HOSTED_ALLOWED),
    model:env=>String(env.AI_OLLAMA_MODEL||'').trim()||null,
  }),
});

const FREE_MODEL_ALLOWLIST=Object.freeze({
  gemini_free:new Set(['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash']),
  groq_free:new Set(['openai/gpt-oss-20b','openai/gpt-oss-120b','qwen/qwen3.8-27b']),
  openrouter_free:new Set(['openrouter/free']),
  cloudflare_free:new Set(['@cf/google/gemma-4-26b-a4b-it','@cf/zai-org/glm-4.7-flash','@cf/nvidia/nemotron-3-120b-a12b']),
});

function assertProviderFree(id,env=process.env){
  zeroCost.assertZeroSpend(env);
  const p=PROVIDERS[id];if(!p)throw new Error(`Proveedor federado no reconocido: ${id}`);
  if(!p.enabled(env))throw new Error(`Proveedor ${id} no está habilitado como nivel gratuito confirmado.`);
  const model=p.model(env);
  if(FREE_MODEL_ALLOWLIST[id]&&!FREE_MODEL_ALLOWLIST[id].has(model))throw new Error(`ZERO_COST_POLICY: modelo ${model} no está en la allowlist gratuita de ${id}.`);
  return{id,label:p.label,kind:p.kind,model,dailyCap:p.dailyCap,timeoutMs:p.timeoutMs};
}

function externalSensitive(text=''){
  const s=String(text);
  const patterns=[
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b(?:\+?34)?[6789]\d{8}\b/,
    /\b(?:\d[ -]*?){13,19}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i,
    /\b(?:api[_-]?key|secret|password|contrase(?:ña|na)|token)\s*[:=]\s*\S+/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/,
  ];
  return patterns.some(r=>r.test(s));
}

function sanitizePayload({question='',context={},task='analysis'}={}){
  const q=String(question||'').trim().slice(0,5000);
  if(!q)throw new Error('Pregunta federada vacía.');
  if(externalSensitive(q))return{ok:false,reason:'SENSITIVE_INPUT_BLOCKED'};
  const safeContext={};
  const allowed=['generatedAt','dataQuality','inventory','orders','catalog','compliance','suppliers','purchasing','logistics','returns','finance','digital','operations'];
  for(const k of allowed)if(Object.prototype.hasOwnProperty.call(context||{},k))safeContext[k]=context[k];
  const raw=JSON.stringify(safeContext);
  if(externalSensitive(raw))return{ok:false,reason:'SENSITIVE_CONTEXT_BLOCKED'};
  return{ok:true,payload:{task:String(task||'analysis').slice(0,50),question:q,context:safeContext}};
}

async function usage(id){return enterprise.get('ai-provider-usage',`${id}:${DAY()}`).catch(()=>null)}
async function claim(id,env=process.env){
  const p=assertProviderFree(id,env),recordId=`${id}:${DAY()}`;
  const current=await usage(id),used=Number(current?.calls||0);
  if(used>=p.dailyCap)return{ok:false,reason:'FREE_DAILY_CAP_REACHED',provider:p,used};
  const next={id:recordId,provider:id,date:DAY(),calls:used+1,freeTierOnly:true,externalSpendLimitEur:0};
  await enterprise.save('ai-provider-usage',next,SYSTEM,{id:recordId,reason:'zero-cost-provider-call'});
  return{ok:true,provider:p,used:used+1,remaining:p.dailyCap-used-1};
}

function systemPrompt(){return [
  'Eres un revisor independiente dentro de Nutretium AI Federation.',
  'No inventes hechos ni cites fuentes que no hayas recibido.',
  'Tu respuesta no es evidencia: sirve para contraste entre modelos.',
  'Distingue DATO_INTERNO, INFERENCIA, HIPOTESIS e IDEA.',
  'Si no puedes sostener una afirmación con el contexto recibido, marca NO_VALIDADO.',
  'No solicites ni expongas datos personales, secretos, credenciales o información de pago.',
  'Devuelve JSON compacto con: summary, claims[], risks[], ideas[], confidence (0..1).'
].join(' ')}

function parseJsonText(text){
  const s=String(text||'').trim();
  try{return JSON.parse(s)}catch{}
  const start=s.indexOf('{'),end=s.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(s.slice(start,end+1))}catch{}}
  return{summary:s.slice(0,6000),claims:[],risks:[],ideas:[],confidence:0.3};
}

async function timedFetch(url,options,timeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}

async function callGemini(p,payload,env){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const body={contents:[{role:'user',parts:[{text:`${systemPrompt()}\nINPUT=${JSON.stringify(payload)}`}]}],generationConfig:{temperature:0.2,maxOutputTokens:900,responseMimeType:'application/json'}};
  const r=await timedFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},p.timeoutMs);
  if(!r.ok)throw new Error(`Gemini ${r.status}`);const j=await r.json();return parseJsonText(j?.candidates?.[0]?.content?.parts?.[0]?.text||'');
}
async function openAiCompatible(url,key,model,payload,timeoutMs,extraHeaders={}){
  const body={model,messages:[{role:'system',content:systemPrompt()},{role:'user',content:JSON.stringify(payload)}],temperature:0.2,max_tokens:900,response_format:{type:'json_object'}};
  const r=await timedFetch(url,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json',...extraHeaders},body:JSON.stringify(body)},timeoutMs);
  if(!r.ok)throw new Error(`AI provider ${r.status}`);const j=await r.json();return parseJsonText(j?.choices?.[0]?.message?.content||'');
}
async function callGroq(p,payload,env){return openAiCompatible('https://api.groq.com/openai/v1/chat/completions',env.GROQ_API_KEY,p.model,payload,p.timeoutMs)}
async function callOpenRouter(p,payload,env){return openAiCompatible('https://openrouter.ai/api/v1/chat/completions',env.OPENROUTER_API_KEY,p.model,payload,p.timeoutMs,{'HTTP-Referer':'https://nutretium.com','X-Title':'Nutretium AI Federation'})}
async function callCloudflare(p,payload,env){
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${p.model}`;
  const body={messages:[{role:'system',content:systemPrompt()},{role:'user',content:JSON.stringify(payload)}],max_tokens:900,temperature:0.2};
  const r=await timedFetch(url,{method:'POST',headers:{authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(body)},p.timeoutMs);
  if(!r.ok)throw new Error(`Cloudflare ${r.status}`);const j=await r.json();return parseJsonText(j?.result?.response||j?.result?.text||j?.result||'');
}
async function callOllama(p,payload,env){
  const base=String(env.AI_OLLAMA_GATEWAY_URL||'').replace(/\/$/,'');
  if(!base.startsWith('https://'))throw new Error('Ollama Gateway debe usar HTTPS.');
  const r=await timedFetch(`${base}/api/chat`,{method:'POST',headers:{authorization:`Bearer ${env.AI_OLLAMA_GATEWAY_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({model:p.model||undefined,stream:false,messages:[{role:'system',content:systemPrompt()},{role:'user',content:JSON.stringify(payload)}]})},p.timeoutMs);
  if(!r.ok)throw new Error(`Ollama ${r.status}`);const j=await r.json();return parseJsonText(j?.message?.content||'');
}
const CALLERS={gemini_free:callGemini,groq_free:callGroq,openrouter_free:callOpenRouter,cloudflare_free:callCloudflare,ollama_local:callOllama};

function tokens(text){return new Set(String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{4,}/g)||[])}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let common=0;for(const x of A)if(B.has(x))common++;return common/Math.max(1,A.size+B.size-common)}
function summaryOf(answer){return typeof answer?.summary==='string'?answer.summary:JSON.stringify(answer||{}).slice(0,6000)}
function consensus(results){
  const good=results.filter(x=>x.status==='ok');
  if(!good.length)return{status:'NO_EXTERNAL_CONSENSUS',confidence:0,agreement:0,selected:null,providers:[]};
  if(good.length===1)return{status:'SINGLE_MODEL_HYPOTHESIS',confidence:0.25,agreement:0,selected:good[0].answer,providers:[good[0].provider]};
  let best=null,bestScore=-1,total=0,pairs=0;
  for(let i=0;i<good.length;i++)for(let j=i+1;j<good.length;j++){const s=similarity(summaryOf(good[i].answer),summaryOf(good[j].answer));total+=s;pairs++;}
  const agreement=pairs?total/pairs:0;
  for(const item of good){let score=0;for(const other of good)if(other!==item)score+=similarity(summaryOf(item.answer),summaryOf(other.answer));if(score>bestScore){bestScore=score;best=item}}
  const status=agreement>=0.42?'MULTI_MODEL_CONSENSUS_HYPOTHESIS':agreement>=0.18?'PARTIAL_CONSENSUS':'MODEL_DISAGREEMENT';
  const confidence=clamp(0.25+agreement*0.55+(good.length>=3?0.1:0),0,0.85);
  return{status,confidence:Number(confidence.toFixed(3)),agreement:Number(agreement.toFixed(3)),selected:best?.answer||null,providers:good.map(x=>x.provider)};
}

function available(env=process.env){
  zeroCost.assertZeroSpend(env);
  return Object.entries(PROVIDERS).map(([id,p])=>{let enabled=false,reason=null,model=null;try{const v=assertProviderFree(id,env);enabled=true;model=v.model}catch(e){reason=String(e.message||e)}return{id,label:p.label,kind:p.kind,enabled,model,reason,dailyCap:p.dailyCap}});
}

async function query({question,context={},task='analysis',minModels=2,maxModels=3,env=process.env,learn=true}={}){
  zeroCost.assertZeroSpend(env);
  const safe=sanitizePayload({question,context,task});
  if(!safe.ok)return{status:safe.reason,externalSpendLimitEur:0,results:[],consensus:{status:'BLOCKED',confidence:0}};
  const enabled=available(env).filter(x=>x.enabled);
  const selected=enabled.slice(0,Math.max(1,Math.min(Number(maxModels)||3,4)));
  const results=[];
  for(const meta of selected){
    try{
      const grant=await claim(meta.id,env);if(!grant.ok){results.push({provider:meta.id,status:'quota_exhausted',reason:grant.reason});continue;}
      const answer=await CALLERS[meta.id](grant.provider,safe.payload,env);
      results.push({provider:meta.id,model:grant.provider.model,status:'ok',answer,remaining:grant.remaining});
    }catch(error){results.push({provider:meta.id,status:'failed',error:String(error.message||error).slice(0,300)});}
  }
  const c=consensus(results),okCount=results.filter(x=>x.status==='ok').length;
  const response={generatedAt:new Date().toISOString(),task:safe.payload.task,status:okCount>=Math.max(1,Number(minModels)||2)?c.status:(okCount?'INSUFFICIENT_QUORUM':'NO_FREE_PROVIDER_AVAILABLE'),externalSpendLimitEur:0,freeTierOnly:true,results,consensus:c,note:'El acuerdo entre modelos es una hipótesis de contraste, no una fuente factual independiente.'};
  if(learn&&c.selected&&okCount>=2){
    await memory.remember({type:'learning',agent:'ai_federation',subject:safe.payload.task,content:JSON.stringify({question:safe.payload.question,consensusStatus:c.status,agreement:c.agreement,selected:c.selected}).slice(0,12000),evidence:c.providers.map(p=>`model-consensus:${p}`),confidence:c.confidence>=0.65?'medium':'low',outcome:'hypothesis-not-fact'}).catch(()=>{});
  }
  return response;
}

module.exports={SYSTEM,PROVIDERS,FREE_MODEL_ALLOWLIST,assertProviderFree,externalSensitive,sanitizePayload,usage,claim,available,consensus,query};
