'use strict';
const settings=require('./settings');
const vault=require('./config-vault');
const clean=(v,max=500)=>String(v||'').trim().slice(0,max);
const yes=v=>String(v||'').trim().toLowerCase()==='true';
function senderDomain(value){const raw=clean(value,180),match=raw.match(/<([^<>]+)>\s*$/),address=clean(match?match[1]:raw,180).toLowerCase(),at=address.lastIndexOf('@');return at>0?address.slice(at+1):''}
async function email(env=process.env){
 const stored=await settings.read().catch(()=>settings.defaults),cfg=stored?.integrations?.email||{},managed=Boolean(cfg.managed);
 if(managed){
  const [secret,status]=await Promise.all([vault.readSecret('resend').catch(()=>null),vault.secretStatus('resend').catch(()=>({dedicatedKeyConfigured:false,apiKeyConfigured:false,credentialsConfigured:false}))]);
  const from=clean(cfg.from,180),apiKey=clean(secret?.apiKey,1024),enabled=Boolean(cfg.enabled),credentialsConfigured=Boolean(apiKey),dedicatedVaultKey=Boolean(status.dedicatedKeyConfigured),ready=Boolean(enabled&&from&&credentialsConfigured&&dedicatedVaultKey);
  return{managed:true,enabled,provider:'resend',from,orderNotificationEmail:clean(cfg.orderNotificationEmail,180),apiKey,domain:senderDomain(from),credentialsConfigured,dedicatedVaultKey,ready};
 }
 const apiKey=clean(env.RESEND_API_KEY,1024),from=clean(env.ORDER_EMAIL_FROM,180),orderNotificationEmail=clean(env.ORDER_NOTIFICATION_EMAIL,180),credentialsConfigured=Boolean(apiKey),enabled=Boolean(apiKey&&from);
 return{managed:false,enabled,provider:'resend',from,orderNotificationEmail,apiKey,domain:senderDomain(from),credentialsConfigured,dedicatedVaultKey:true,ready:Boolean(enabled&&credentialsConfigured)};
}
async function tpvsol(env=process.env){
 const stored=await settings.read().catch(()=>settings.defaults),cfg=stored?.integrations?.tpvsol||{},managed=Boolean(cfg.managed);
 if(managed){
  const [secret,status]=await Promise.all([vault.readSecret('tpvsol').catch(()=>null),vault.secretStatus('tpvsol').catch(()=>({dedicatedKeyConfigured:false,tokenConfigured:false,credentialsConfigured:false}))]);
  const token=clean(secret?.token,1024),mode=clean(cfg.mode,20).toLowerCase(),endpoint=clean(cfg.endpoint,500),enabled=Boolean(cfg.enabled),validated=Boolean(cfg.validated),credentialsConfigured=Boolean(token),dedicatedVaultKey=Boolean(status.dedicatedKeyConfigured),ready=Boolean(enabled&&validated&&['api','middleware'].includes(mode)&&/^https:\/\//i.test(endpoint)&&credentialsConfigured&&dedicatedVaultKey);
  return{managed:true,enabled,provider:'tpvsol',mode,endpoint,token,validated,credentialsConfigured,dedicatedVaultKey,ready};
 }
 const mode=clean(env.TPVSOL_SYNC_MODE,20).toLowerCase(),endpoint=clean(env.TPVSOL_SYNC_ENDPOINT,500),token=clean(env.TPVSOL_SYNC_TOKEN,1024),validated=yes(env.TPVSOL_CONNECTION_VALIDATED),credentialsConfigured=Boolean(token),enabled=Boolean(mode||endpoint||token||validated),ready=Boolean(validated&&['api','middleware'].includes(mode)&&/^https:\/\//i.test(endpoint)&&credentialsConfigured);
 return{managed:false,enabled,provider:'tpvsol',mode,endpoint,token,validated,credentialsConfigured,dedicatedVaultKey:true,ready};
}
async function publicStatus(env=process.env){const [mail,tpv]=await Promise.all([email(env),tpvsol(env)]);return{email:{managed:mail.managed,enabled:mail.enabled,provider:mail.provider,from:mail.from,orderNotificationEmail:mail.orderNotificationEmail,domain:mail.domain,credentialsConfigured:mail.credentialsConfigured,dedicatedVaultKey:mail.dedicatedVaultKey,ready:mail.ready},tpvsol:{managed:tpv.managed,enabled:tpv.enabled,provider:tpv.provider,mode:tpv.mode,endpointConfigured:/^https:\/\//i.test(tpv.endpoint),validated:tpv.validated,credentialsConfigured:tpv.credentialsConfigured,dedicatedVaultKey:tpv.dedicatedVaultKey,ready:tpv.ready}}}
module.exports={email,tpvsol,publicStatus,senderDomain};
