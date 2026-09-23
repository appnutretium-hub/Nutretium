'use strict';
const core=require('../lib/checkout-enterprise-core');
const paymentConfig=require('../lib/payment-config');
const session=require('../lib/session');const {verifyUserToken}=session;
const {consume}=require('../lib/rate-limit');
function response(statusCode,body,headers={}){return{statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers},body:JSON.stringify(body)}}
function publicProductionHost(host){const h=String(host||'').toLowerCase().split(':')[0];return h==='nutretium.com'||h==='www.nutretium.com'}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return core.handler(event);
 if(event.httpMethod!=='POST')return core.handler(event);
 if(String(process.env.MAINTENANCE_MODE||'').toLowerCase()==='true')return response(503,{error:'La tienda online está temporalmente en mantenimiento. No se iniciará ningún cobro.'},{'Retry-After':'300'});
 const rate=await consume({scope:'checkout-enterprise',event,limit:8,windowMs:10*60*1000}).catch(()=>({allowed:false,degraded:true,retryAfter:60}));
 if(!rate.allowed)return response(rate.degraded?503:429,{error:rate.degraded?'El control de seguridad del checkout no está disponible. Reintenta en un minuto.':'Demasiados intentos de checkout seguidos. Espera unos minutos antes de volver a intentarlo.'},{'Retry-After':String(rate.retryAfter||60)});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 // La sesión puede llegar en la cookie HttpOnly, no solo en el cuerpo: se
 // comprueba la misma que usará el núcleo, para que una sesión revocada no
 // pase por venir por cookie.
 const tokenCliente=session.customerEventToken(event,body.token);
 if(tokenCliente){try{await verifyUserToken(tokenCliente,{requireUser:true})}catch{return response(401,{error:'La sesión no es válida, ha sido revocada o ha caducado. Inicia sesión de nuevo.'})}}
 const payment=await paymentConfig.resolve().catch(()=>null);
 if(body.action==='pay'){
  const host=event.headers?.['x-forwarded-host']||event.headers?.host||'';
  const gate=paymentHostAllowed(host,payment);
  if(!gate.ok&&gate.reason==='unconfigured')return response(503,{error:'La pasarela de pago no está configurada.'});
  if(!gate.ok&&gate.reason==='live-not-authorized')return response(503,{error:'Los cobros reales están bloqueados hasta autorizar COMMERCE_LIVE desde Administración.'});
  if(payment.environment==='production'&&payment.dedicatedVaultKey!==true&&payment.managed)return response(503,{error:'La bóveda de pagos de producción no tiene una clave dedicada configurada.'});
 }
 return core.handler(event,{payment});
};
function paymentHostAllowed(host,payment){if(!payment?.enabled||!payment?.credentialsConfigured)return{ok:false,reason:'unconfigured'};if(payment.environment==='production'&&payment.commerceLive!==true)return{ok:false,reason:'live-not-authorized'};return{ok:true,mode:payment.environment==='production'?'live':'test'};}
exports._test={publicProductionHost,paymentHostAllowed};