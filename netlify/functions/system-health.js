'use strict';
const { cabecerasCORS }=require('../lib/cors');
const { exigePermiso }=require('../lib/staff');
const CORS=cabecerasCORS('GET, OPTIONS');
const set=name=>Boolean(String(process.env[name]||'').trim());
const yes=name=>String(process.env[name]||'').trim().toLowerCase()==='true';
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const staff=exigePermiso(event,'analytics');if(!staff.ok)return{statusCode:staff.statusCode,headers:CORS,body:JSON.stringify({error:staff.error})};
 const checks={
  jwt:set('JWT_SECRET'),admin:set('ADMIN_EMAILS'),github:set('GITHUB_TOKEN'),blobs:set('NETLIFY_API_TOKEN'),
  redsysSecret:set('REDSYS_SECRET_KEY'),redsysMerchant:set('REDSYS_MERCHANT_CODE'),redsysProduction:String(process.env.REDSYS_ENV||'test')==='production',commerceLive:yes('COMMERCE_LIVE'),
  emailProvider:set('RESEND_API_KEY'),emailRecipient:set('ORDER_NOTIFICATION_EMAIL'),emailFrom:set('ORDER_EMAIL_FROM'),
  staffRoles:set('STAFF_ROLES_JSON'),coupons:set('NUTRETIUM_COUPONS_JSON'),points:set('NUTRETIUM_POINTS_PER_EURO'),maintenance:yes('MAINTENANCE_MODE')
 };
 const platformCritical=['jwt','admin','blobs'];
 const paymentCritical=['redsysSecret','redsysMerchant','redsysProduction','commerceLive'];
 const platformReady=platformCritical.every(k=>checks[k]);
 const paymentsReady=paymentCritical.every(k=>checks[k])&&!checks.maintenance;
 const emailReady=['emailProvider','emailRecipient','emailFrom'].every(k=>checks[k]);
 const ready=platformReady&&paymentsReady;
 return{statusCode:200,headers:CORS,body:JSON.stringify({ready,platformReady,paymentsReady,emailReady,maintenance:checks.maintenance,environment:process.env.REDSYS_ENV||'test',checks})};
};