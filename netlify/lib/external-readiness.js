'use strict';
const integrationConfig=require('./integration-config');
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
 const managed=shipping.managed===true,enabled=shipping.enabled===true,rate=shipping.rateCents,methods=Array.isArray(shipping.methods)?shipping.methods:[];
 const methodReady=methods.some(m=>m?.enabled&&Number.isInteger(m.rateCents)&&m.rateCents>=0);
 const rateReady=Number.isInteger(rate)&&rate>=0;
 const ready=enabled&&(rateReady||methodReady);
 return{ready,managed,enabled,reason:ready?'configured':!enabled?'disabled':'missing-valid-rate'};
}
function paymentsState(env={},override=null){
 const managed=override?.managed===true;
 const enabled=override?override.enabled===true:true;
 const mode=clean(override?.environment??env.REDSYS_ENV??'test').toLowerCase();
 const live=override?override.commerceLive===true:asBool(env.COMMERCE_LIVE);
 const credentials=override
  ? Boolean(override.credentialsConfigured??(clean(override.secretKey)&&clean(override.merchantCode)))
  : Boolean(clean(env.REDSYS_SECRET_KEY)&&clean(env.REDSYS_MERCHANT_CODE));
 const dedicated=managed?override?.dedicatedVaultKey===true:true;
 const ready=enabled&&mode==='production'&&live&&credentials&&dedicated;
 const reason=ready?'production-ready':!enabled?'disabled':mode!=='production'?'test-mode':!live?'commerce-live-disabled':!credentials?'missing-credentials':!dedicated?'missing-dedicated-vault-key':'not-ready';
 return{ready,managed,enabled,mode,live,credentialsConfigured:credentials,dedicatedVaultKey:dedicated,reason};
}
function tpvState(env={},override=null){
 const mode=clean(override?.mode??env.TPVSOL_SYNC_MODE).toLowerCase();
 const endpoint=clean(override?.endpoint??env.TPVSOL_SYNC_ENDPOINT),token=Boolean(clean(override?.token??env.TPVSOL_SYNC_TOKEN));
 const validated=override?Boolean(override.validated):asBool(env.TPVSOL_CONNECTION_VALIDATED),enabled=override?override.enabled!==false:true,dedicated=override?override.dedicatedVaultKey!==false:true;
 let endpointConfigured=false;try{endpointConfigured=Boolean(endpoint&&new URL(endpoint).protocol==='https:')}catch{}
 const supported=new Set(['api','middleware']);
 const ready=enabled&&validated&&supported.has(mode)&&endpointConfigured&&token&&dedicated;
 const reason=ready?'validated-transport':!enabled?'disabled':!supported.has(mode)?'unsupported-transport':!endpointConfigured?'missing-https-endpoint':!token?'missing-token':!dedicated?'missing-dedicated-vault-key':!validated?'transport-not-validated':'not-ready';
 return{ready,mode:mode||null,validated,endpointConfigured,tokenConfigured:token,dedicatedVaultKey:dedicated,reason};
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
async function resendState(env={},fetchImpl=global.fetch,override=null){
 const key=clean(override?.apiKey??env.RESEND_API_KEY),from=clean(override?.from??env.ORDER_EMAIL_FROM),domain=senderDomain(from),enabled=override?override.enabled!==false:true,dedicated=override?override.dedicatedVaultKey!==false:true;
 if(!enabled)return{ready:false,reason:'disabled',domain:domain||null};
 if(!key)return{ready:false,reason:'missing-resend-key',domain:domain||null};
 if(!dedicated)return{ready:false,reason:'missing-dedicated-vault-key',domain:domain||null};
 if(!domain)return{ready:false,reason:'invalid-sender-domain',domain:null};
 try{
  const data=await fetchJson('https://api.resend.com/domains?limit=100',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'}},fetchImpl);
  const domains=Array.isArray(data?.data)?data.data:Array.isArray(data)?data:[];
  const match=domains.find(item=>clean(item?.name).toLowerCase()===domain);
  const status=clean(match?.status).toLowerCase();
  return{ready:status==='verified',reason:status==='verified'?'verified':match?'domain-not-verified':'domain-not-found',domain,status:status||null};
 }catch(error){return{ready:false,reason:'resend-check-failed',domain,error:String(error.message||'error').slice(0,120)}}
}
async function managedIntegrationStates({env=process.env,fetchImpl=global.fetch}={}){const [mailCfg,tpvCfg]=await Promise.all([integrationConfig.email(env),integrationConfig.tpvsol(env)]);const [email,tpv]=await Promise.all([resendState(env,fetchImpl,mailCfg),Promise.resolve(tpvState(env,tpvCfg))]);return{email,tpv}}
async function assessExternalReadiness({env=process.env,shipping={},payment=null,fetchImpl=global.fetch}={}){
 const [deployment,integrations]=await Promise.all([githubDeploymentState(env,fetchImpl),managedIntegrationStates({env,fetchImpl})]);
 const payments=paymentsState(env,payment),delivery=shippingState(shipping),email=integrations.email,tpv=integrations.tpv;
 const checks={deployment,email,payments,shipping:delivery,tpv};
 const blockers=Object.entries(checks).filter(([,value])=>!value.ready).map(([key,value])=>({key,reason:value.reason}));
 return{ready:blockers.length===0,checks,blockers,checkedAt:new Date().toISOString()};
}
module.exports={asBool,senderDomain,shippingState,paymentsState,tpvState,githubDeploymentState,resendState,managedIntegrationStates,assessExternalReadiness};
