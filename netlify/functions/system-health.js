'use strict';
const { cabecerasCORS }=require('../lib/cors');
const { exigePermiso }=require('../lib/staff');
const { blobStoreReady }=require('../lib/blob-store');
const shipping=require('../lib/shipping');
const {assessCommerceDependencies}=require('../lib/commerce-readiness');
const CORS=cabecerasCORS('GET, OPTIONS');
function value(name){return String(process.env[name]||'').trim()}
function set(name){return Boolean(value(name))}
function yes(name){return value(name).toLowerCase()==='true'}
function emails(name){return value(name).split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const staff=await exigePermiso(event,'analytics.read');if(!staff.ok)return{statusCode:staff.statusCode,headers:CORS,body:JSON.stringify({error:staff.error})};
 const admins=emails('ADMIN_EMAILS'),publicEmails=new Set([...emails('CONTACT_EMAIL'),...emails('ORDER_NOTIFICATION_EMAIL')]);
 const adminIsolation=admins.length>0&&admins.every(e=>!publicEmails.has(e));
 const sender=value('ORDER_EMAIL_FROM').toLowerCase(),emailDomain=sender.includes('@nutretium.com');
 const [blobs,shippingReady,dependencies]=await Promise.all([
  blobStoreReady('system-health-probe'),
  shipping.configured().catch(()=>false),
  assessCommerceDependencies().catch(()=>({ready:false,catalog:{ready:false},compliance:{ready:false},factusol:{ready:false}})),
 ]);
 const staffMfaRequired=yes('REQUIRE_STAFF_MFA'),staffTotp=set('STAFF_TOTP_SECRETS');
 const checks={jwt:set('JWT_SECRET'),admin:set('ADMIN_EMAILS'),adminIsolation,staffMfaRequired,staffTotp,github:set('GITHUB_TOKEN'),blobs,redsysSecret:set('REDSYS_SECRET_KEY'),redsysMerchant:set('REDSYS_MERCHANT_CODE'),redsysProduction:value('REDSYS_ENV')==='production',commerceLive:yes('COMMERCE_LIVE'),shipping:shippingReady,factusol:dependencies.factusol?.ready===true,catalog:dependencies.catalog?.ready===true,compliance:dependencies.compliance?.ready===true,emailProvider:set('RESEND_API_KEY'),emailRecipient:set('ORDER_NOTIFICATION_EMAIL'),emailFrom:set('ORDER_EMAIL_FROM'),emailDomain,staffRoles:set('STAFF_ROLES_JSON'),maintenance:yes('MAINTENANCE_MODE')};
 const platformCritical=['jwt','admin','adminIsolation','staffMfaRequired','staffTotp','github','blobs'];
 const paymentCritical=['redsysSecret','redsysMerchant','redsysProduction','commerceLive','shipping'];
 const emailCritical=['emailProvider','emailRecipient','emailFrom','emailDomain'];
 const commerceDataCritical=['factusol','catalog','compliance'];
 const platformReady=platformCritical.every(k=>checks[k]);
 const paymentsReady=paymentCritical.every(k=>checks[k])&&!checks.maintenance;
 const emailReady=emailCritical.every(k=>checks[k]);
 const commerceDataReady=commerceDataCritical.every(k=>checks[k]);
 const ready=platformReady&&paymentsReady&&emailReady&&commerceDataReady;
 const critical=[...platformCritical,...paymentCritical,...emailCritical,...commerceDataCritical];
 const missing=critical.filter(k=>!checks[k]);
 return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({ready,platformReady,paymentsReady,emailReady,commerceDataReady,maintenance:checks.maintenance,environment:value('REDSYS_ENV')||'test',checks,missing,catalog:dependencies.catalog,compliance:dependencies.compliance,factusol:dependencies.factusol})};
};
