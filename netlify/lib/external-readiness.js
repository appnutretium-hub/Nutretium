'use strict';

function asBool(value){return String(value||'').trim().toLowerCase()==='true'}
function clean(value){return String(value||'').trim()}
function senderDomain(value){
 const raw=clean(value||'noreply@nutretium.com');
 const match=raw.match(/<([^<>]+)>\s*$/);
 const address=(match?match[1]:raw).trim().toLowerCase();
 const at=address.lastIndexOf('@');
 return at>0?address.slice(at+1):'';
}
function shippingState(shipping={}){
 const managed=shipping.managed===true,enabled=shipping.enabled===true,rate=shipping.rateCents;
 const ready=managed&&enabled&&Number.isInteger(rate)&&rate>=0;
 return{ready,managed,enabled,reason:ready?'configured':!managed?'not-managed':!enabled?'disabled':'missing-valid-rate'};
}
function paymentsState(env={}){
 const mode=clean(env.REDSYS_ENV||'test').toLowerCase();
 const live=asBool(env.COMMERCE_LIVE);
 const credentials=Boolean(clean(env.REDSYS_SECRET_KEY)&&clean(env.REDSYS_MERCHANT_CODE));
 const ready=mode==='production'&&live&&credentials;
 return{ready,mode,live,credentialsConfigured:credentials,reason:ready?'production-ready':mode!=='production'?'test-mode':!live?'commerce-live-disabled':'missing-credentials'};
}
function tpvState(env={}){
 const mode=clean(env.TPVSOL_SYNC_MODE).toLowerCase();
 const validated=asBool(env.TPVSOL_SYNC_VALIDATED);
 const supported=new Set(['api','file-export']);
 const ready=validated&&supported.has(mode);
 return{ready,mode:mode||null,validated,reason:ready?'validated-transport':!validated?'transport-not-validated':'unsupported-transport'};
}
async function fetchJson(url,{headers={},timeoutMs=5000}={},fetchImpl=global.fetch){
 if(typeof fetchImpl!=='function')throw new Error('fetch unavailable');
 const controller=typeof AbortController==='function'?new AbortController():null;
 const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
 try{
  const response=await fetchImpl(url,{headers,signal:controller?.signal});
  if(!response||response.ok!==true)throw new Error(`HTTP ${response?.status||'error'}`);
  return await response.json();
 }finally{if(timer)clearTimeout(timer)}
}
async function githubDeploymentState(env={},fetchImpl=global.fetch){
 const repo=clean(env.GITHUB_REPOSITORY||env.GITHUB_REPO);
 const token=clean(env.GITHUB_TOKEN);
 const deployedSha=clean(env.COMMIT_REF||env.DEPLOY_COMMIT_REF);
 const context=clean(env.CONTEXT).toLowerCase();
 const branch=clean(env.BRANCH);
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))return{ready:false,reason:'invalid-repository',context:context||null,branch:branch||null,deployedSha:deployedSha||null};
 if(!/^[0-9a-f]{40}$/i.test(deployedSha))return{ready:false,reason:'missing-or-invalid-deploy-sha',context:context||null,branch:branch||null,deployedSha:deployedSha||null};
 if(!token)return{ready:false,reason:'missing-github-token',context:context||null,branch:branch||null,deployedSha};
 try{
  const data=await fetchJson(`https://api.github.com/repos/${repo}/branches/main`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'}},fetchImpl);
  const mainSha=clean(data?.commit?.sha);
  const exact=Boolean(mainSha&&mainSha===deployedSha);
  const production=context==='production'&&branch==='main';
  return{ready:production&&exact,reason:production?(exact?'exact-main-sha':'sha-mismatch'):'not-production-main',context:context||null,branch:branch||null,deployedSha,mainSha:mainSha||null,exact};
 }catch(error){return{ready:false,reason:'github-check-failed',context:context||null,branch:branch||null,deployedSha,error:String(error.message||'error').slice(0,120)}}
}
async function resendState(env={},fetchImpl=global.fetch){
 const key=clean(env.RESEND_API_KEY),domain=senderDomain(env.ORDER_EMAIL_FROM);
 if(!key)return{ready:false,reason:'missing-resend-key',domain:domain||null};
 if(!domain)return{ready:false,reason:'invalid-sender-domain',domain:null};
 try{
  const data=await fetchJson('https://api.resend.com/domains?limit=100',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'}},fetchImpl);
  const domains=Array.isArray(data?.data)?data.data:Array.isArray(data)?data:[];
  const match=domains.find(item=>clean(item?.name).toLowerCase()===domain);
  const status=clean(match?.status).toLowerCase();
  return{ready:status==='verified',reason:status==='verified'?'verified':match?'domain-not-verified':'domain-not-found',domain,status:status||null};
 }catch(error){return{ready:false,reason:'resend-check-failed',domain,error:String(error.message||'error').slice(0,120)}}
}
async function assessExternalReadiness({env=process.env,shipping={},fetchImpl=global.fetch}={}){
 const [deployment,email]=await Promise.all([githubDeploymentState(env,fetchImpl),resendState(env,fetchImpl)]);
 const payments=paymentsState(env),delivery=shippingState(shipping),tpv=tpvState(env);
 const checks={deployment,email,payments,shipping:delivery,tpv};
 const blockers=Object.entries(checks).filter(([,value])=>!value.ready).map(([key,value])=>({key,reason:value.reason}));
 return{ready:blockers.length===0,checks,blockers,checkedAt:new Date().toISOString()};
}
module.exports={asBool,senderDomain,shippingState,paymentsState,tpvState,githubDeploymentState,resendState,assessExternalReadiness};
