'use strict';
const settings=require('./settings');
const vault=require('./config-vault');
const clean=(v,max=240)=>String(v||'').trim().slice(0,max);
async function resolve(){
 const stored=await settings.read().catch(()=>null),p=stored?.payment||{},managed=Boolean(p.managed);
 const secret=managed?await vault.readPayment().catch(()=>null):null;
 const environment=managed?(p.environment==='production'?'production':'test'):(process.env.REDSYS_ENV==='production'?'production':'test');
 const enabled=managed?Boolean(p.enabled):true;
 const commerceLive=managed?Boolean(p.commerceLive):String(process.env.COMMERCE_LIVE||'').toLowerCase()==='true';
 const merchantCode=managed?clean(secret?.merchantCode,32):clean(process.env.REDSYS_MERCHANT_CODE,32);
 const secretKey=managed?clean(secret?.secretKey,512):clean(process.env.REDSYS_SECRET_KEY,512);
 const terminal=managed?clean(p.terminal||'1',8):clean(process.env.REDSYS_TERMINAL||'1',8);
 const merchantUrl=managed?clean(p.merchantUrl,300):clean(process.env.MERCHANT_URL,300);
 const urlOk=managed?clean(p.urlOk,300):clean(process.env.URL_OK,300);
 const urlKo=managed?clean(p.urlKo,300):clean(process.env.URL_KO,300);
 return{managed,enabled,provider:'redsys',environment,commerceLive,merchantCode,secretKey,terminal,merchantUrl,urlOk,urlKo,label:clean(p.label||'Tarjeta · Redsys',80),merchantName:clean(p.merchantName||'Nutretium',80),credentialsConfigured:Boolean(merchantCode&&secretKey),ready:Boolean(enabled&&merchantCode&&secretKey&&(environment!=='production'||commerceLive))};
}
async function applyRuntime(){const p=await resolve();if(!p.managed)return p;process.env.REDSYS_ENV=p.environment;process.env.COMMERCE_LIVE=p.commerceLive?'true':'false';process.env.REDSYS_MERCHANT_CODE=p.merchantCode||'';process.env.REDSYS_SECRET_KEY=p.secretKey||'';process.env.REDSYS_TERMINAL=p.terminal||'1';for(const[name,value]of[['MERCHANT_URL',p.merchantUrl],['URL_OK',p.urlOk],['URL_KO',p.urlKo]]){if(value)process.env[name]=value;else delete process.env[name]}return p}
async function publicStatus(){const p=await resolve();return{managed:p.managed,enabled:p.enabled,provider:p.provider,environment:p.environment,commerceLive:p.commerceLive,terminal:p.terminal,label:p.label,merchantName:p.merchantName,credentialsConfigured:p.credentialsConfigured,ready:p.ready}}
module.exports={resolve,applyRuntime,publicStatus};
