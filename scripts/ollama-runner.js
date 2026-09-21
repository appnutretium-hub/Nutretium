'use strict';

const os=require('os');
const BASE='https://nutretium.com';
const TOKEN=String(process.env.AI_OLLAMA_RUNNER_TOKEN||'');
const OLLAMA='http://127.0.0.1:11434';
const MODEL=String(process.env.AI_OLLAMA_MODEL||'').trim();
const RUNNER_ID=String(process.env.AI_OLLAMA_RUNNER_ID||os.hostname()).slice(0,120);
const ENDPOINT=`${BASE}/.netlify/functions/ai-ollama-runner`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function assertConfig(){if(TOKEN.length<24)throw new Error('AI_OLLAMA_RUNNER_TOKEN debe tener al menos 24 caracteres.');if(!MODEL)throw new Error('AI_OLLAMA_MODEL es obligatorio.');}
async function bridge(body){
 const response=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-nutretium-runner-token':TOKEN},body:JSON.stringify({...body,runnerId:RUNNER_ID})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Bridge ${response.status}: ${data.error||data.code||'error'}`);return data;
}
async function askOllama(job){
 const response=await fetch(`${OLLAMA}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:job.model||MODEL,messages:job.messages,stream:false})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`Ollama ${response.status}: ${data.error||'error'}`);
 const result=String(data?.message?.content||'').trim();if(!result)throw new Error('Ollama devolvió una respuesta vacía.');return{model:data.model||job.model||MODEL,result};
}
async function processJob(job){
 try{const output=await askOllama(job);await bridge({action:'complete',id:job.id,leaseId:job.leaseId,model:output.model,result:output.result});console.log(`[ollama-runner] completed ${job.agent}/${job.action}`)}
 catch(error){await bridge({action:'fail',id:job.id,leaseId:job.leaseId,error:String(error?.message||error).slice(0,1500)}).catch(()=>{});console.error(`[ollama-runner] failed ${job.agent}/${job.action}: ${String(error?.message||error).slice(0,300)}`)}
}
async function health(){const response=await fetch(`${OLLAMA}/api/tags`).catch(()=>null);if(!response?.ok)throw new Error('Ollama no responde en localhost:11434.');}
async function main(){assertConfig();await health();console.log(`[ollama-runner] ${RUNNER_ID} conectado a Nutretium`);for(;;){try{const {job}=await bridge({action:'claim',leaseMs:120000});if(job)await processJob(job);else await sleep(7000)}catch(error){console.error(`[ollama-runner] ${String(error?.message||error).slice(0,300)}`);await sleep(10000)}}}
if(require.main===module)main().catch(error=>{console.error(`[ollama-runner] fatal: ${error.message}`);process.exit(1)});
module.exports={assertConfig,bridge,askOllama,processJob,health};
