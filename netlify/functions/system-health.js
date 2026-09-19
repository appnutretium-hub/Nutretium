'use strict';
const { cabecerasCORS }=require('../lib/cors');
const { exigePermiso }=require('../lib/staff');
const CORS=cabecerasCORS('GET, OPTIONS');
function set(name){return Boolean(String(process.env[name]||'').trim())}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const staff=exigePermiso(event,'analytics');if(!staff.ok)return{statusCode:staff.statusCode,headers:CORS,body:JSON.stringify({error:staff.error})};
 const checks={
  jwt:set('JWT_SECRET'),admin:set('ADMIN_EMAILS'),github:set('GITHUB_TOKEN'),blobs:set('NETLIFY_API_TOKEN'),
  redsysSecret:set('REDSYS_SECRET_KEY'),redsysMerchant:set('REDSYS_MERCHANT_CODE'),
  emailProvider:set('RESEND_API_KEY'),emailRecipient:set('ORDER_NOTIFICATION_EMAIL'),emailFrom:set('ORDER_EMAIL_FROM'),
  staffRoles:set('STAFF_ROLES_JSON'),coupons:set('NUTRETIUM_COUPONS_JSON')
 };
 const critical=['jwt','admin','blobs','redsysSecret','redsysMerchant'];
 const ready=critical.every(k=>checks[k]);
 return{statusCode:200,headers:CORS,body:JSON.stringify({ready,environment:process.env.REDSYS_ENV||'test',checks})};
};
