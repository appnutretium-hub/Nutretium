'use strict';
const { cabecerasCORS }=require('../lib/cors');
const { exigePermiso }=require('../lib/staff');
const shipping=require('../lib/shipping');
const { NUTRETIUM_PRODUCTS=[] }=require('../../products-data.js');
const CORS=cabecerasCORS('GET, OPTIONS');
function value(name){return String(process.env[name]||'').trim()}
function set(name){return Boolean(value(name))}
function emails(name){return value(name).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)}
function catalogAudit(){
 const active=NUTRETIUM_PRODUCTS.filter(p=>p&&p.active!==false);
 const missingImage=active.filter(p=>!p.image).length;
 const unknownStock=active.filter(p=>p.stock===null||p.stock===undefined).length;
 const missingDescription=active.filter(p=>!String(p.description||'').trim()).length;
 return{active:active.length,missingImage,unknownStock,missingDescription};
}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const staff=exigePermiso(event,'analytics');if(!staff.ok)return{statusCode:staff.statusCode,headers:CORS,body:JSON.stringify({error:staff.error})};
 const admins=emails('ADMIN_EMAILS'),publicEmails=new Set([...emails('CONTACT_EMAIL'),...emails('ORDER_NOTIFICATION_EMAIL')]);
 const adminIsolation=admins.length>0&&admins.every(e=>!publicEmails.has(e));
 const sender=value('ORDER_EMAIL_FROM').toLowerCase();
 const emailDomain=sender.includes('@nutretium.com');
 const checks={
  jwt:set('JWT_SECRET'),admin:set('ADMIN_EMAILS'),adminIsolation,github:set('GITHUB_TOKEN'),blobs:set('NETLIFY_API_TOKEN'),
  redsysSecret:set('REDSYS_SECRET_KEY'),redsysMerchant:set('REDSYS_MERCHANT_CODE'),redsysProduction:value('REDSYS_ENV')==='production',
  commerceLive:value('COMMERCE_LIVE')==='true',shipping:shipping.configured(),
  emailProvider:set('RESEND_API_KEY'),emailRecipient:set('ORDER_NOTIFICATION_EMAIL'),emailFrom:set('ORDER_EMAIL_FROM'),emailDomain,
  staffRoles:set('STAFF_ROLES_JSON')
 };
 const critical=['jwt','admin','adminIsolation','github','blobs','redsysSecret','redsysMerchant','redsysProduction','commerceLive','shipping','emailProvider','emailRecipient','emailFrom','emailDomain'];
 const ready=critical.every(k=>checks[k]);
 const missing=critical.filter(k=>!checks[k]);
 return{statusCode:200,headers:CORS,body:JSON.stringify({ready,environment:value('REDSYS_ENV')||'test',checks,missing,catalog:catalogAudit()})};
};
