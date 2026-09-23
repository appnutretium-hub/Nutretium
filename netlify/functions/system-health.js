'use strict';
const { cabecerasCORS }=require('../lib/cors');
const { exigePermiso }=require('../lib/staff');
const { blobStoreReady }=require('../lib/blob-store');
const { connectBlobs }=require('../lib/netlify-blobs-runtime');
const shipping=require('../lib/shipping');
const paymentConfig=require('../lib/payment-config');
const integrationConfig=require('../lib/integration-config');
const staffMfa=require('../lib/staff-mfa-readiness');
const { NUTRETIUM_PRODUCTS=[] }=require('../../products-data.js');
const CORS=cabecerasCORS('GET, OPTIONS');
function value(name){return String(process.env[name]||'').trim()}
function set(name){return Boolean(value(name))}
function yes(name){return value(name).toLowerCase()==='true'}
function emails(name){return value(name).split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
function catalogAudit(){const active=NUTRETIUM_PRODUCTS.filter(p=>p&&p.active!==false);return{active:active.length,missingImage:active.filter(p=>!p.image).length,unknownStock:active.filter(p=>p.stock===null||p.stock===undefined).length,missingDescription:active.filter(p=>!String(p.description||'').trim()).length}}
function paymentChecks(payment={}){return{paymentManaged:payment.managed===true,paymentEnabled:payment.enabled===true,redsysSecret:Boolean(String(payment.secretKey||'').trim()),redsysMerchant:Boolean(String(payment.merchantCode||'').trim()),redsysProduction:payment.environment==='production',commerceLive:payment.commerceLive===true,paymentDedicatedVault:payment.managed!==true||payment.dedicatedVaultKey===true}}
function emailChecks(email={}){return{emailManaged:email.managed===true,emailEnabled:email.enabled===true,emailProvider:email.credentialsConfigured===true,emailRecipient:Boolean(String(email.orderNotificationEmail||'').trim()),emailFrom:Boolean(String(email.from||'').trim()),emailDomain:String(email.domain||'').toLowerCase()==='nutretium.com',emailDedicatedVault:email.managed!==true||email.dedicatedVaultKey===true}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 connectBlobs(event);
 const staff=await exigePermiso(event,'analytics.read');if(!staff.ok)return{statusCode:staff.statusCode,headers:CORS,body:JSON.stringify({error:staff.error})};
 const admins=emails('ADMIN_EMAILS'),publicEmails=new Set([...emails('CONTACT_EMAIL'),...emails('ORDER_NOTIFICATION_EMAIL')]);
 const adminIsolation=admins.length>0&&admins.every(e=>!publicEmails.has(e));
 const [blobs,shippingReady,mfa,payment,email]=await Promise.all([
  blobStoreReady('system-health-probe'),
  shipping.configured().catch(()=>false),
  staffMfa.status().catch(()=>({required:yes('REQUIRE_STAFF_MFA'),ready:false,targets:[],missing:[]})),
  paymentConfig.resolve().catch(()=>({managed:false,enabled:false,environment:'test',commerceLive:false,merchantCode:'',secretKey:'',dedicatedVaultKey:false})),
  integrationConfig.email(process.env).catch(()=>({managed:false,enabled:false,from:'',orderNotificationEmail:'',domain:'',credentialsConfigured:false,dedicatedVaultKey:false}))
 ]);
 const staffMfaRequired=mfa.required===true,staffTotp=mfa.ready===true;
 const checks={jwt:set('JWT_SECRET'),admin:set('ADMIN_EMAILS'),adminIsolation,staffMfaRequired,staffTotp,github:set('GITHUB_TOKEN'),blobs,...paymentChecks(payment),shipping:shippingReady,...emailChecks(email),staffRoles:set('STAFF_ROLES_JSON'),maintenance:yes('MAINTENANCE_MODE')};
 const platformCritical=['jwt','admin','adminIsolation','staffMfaRequired','staffTotp','github','blobs'];
 const paymentCritical=['paymentEnabled','redsysSecret','redsysMerchant','redsysProduction','commerceLive','paymentDedicatedVault','shipping'];
 const emailCritical=['emailEnabled','emailProvider','emailRecipient','emailFrom','emailDomain','emailDedicatedVault'];
 const platformReady=platformCritical.every(k=>checks[k]);
 const paymentsReady=paymentCritical.every(k=>checks[k])&&!checks.maintenance;
 const emailReady=emailCritical.every(k=>checks[k]);
 const ready=platformReady&&paymentsReady&&emailReady;
 const critical=[...platformCritical,...paymentCritical,...emailCritical];
 const missing=critical.filter(k=>!checks[k]);
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({ready,platformReady,paymentsReady,emailReady,maintenance:checks.maintenance,environment:payment.environment||'test',checks,missing,mfa:{targets:mfa.targets||[],missing:mfa.missing||[]},catalog:catalogAudit()})};
};
exports._test={paymentChecks,emailChecks};
