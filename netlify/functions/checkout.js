'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const { verifyJWT } = require('../lib/jwt');
const { valorarCarrito } = require('../lib/catalogo');
const usuarios = require('../lib/usuarios');
const direccion = require('../lib/direccion');
const promotions = require('../lib/promotions');
const shipping = require('../lib/shipping');
const { consume } = require('../lib/rate-limit');

const CORS = cabecerasCORS('POST, OPTIONS');
const URLS={test:'https://sis-t.redsys.es:25443/sis/realizarPago',production:'https://sis.redsys.es/sis/realizarPago'};
const VERSION='HMAC_SHA256_V1';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALFABETO='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function json(statusCode,payload,extraHeaders={}){return{statusCode,headers:{...CORS,...extraHeaders},body:JSON.stringify(payload)}}
function orderNumber(seed=''){const d=new Date(),pad=n=>String(n).padStart(2,'0'),prefix=pad(d.getMonth()+1)+pad(d.getDate());if(seed){const digest=crypto.createHash('sha256').update(String(seed)).digest('hex').toUpperCase();return(prefix+digest.slice(0,8)).slice(0,12)}let s=prefix,lim=252;while(s.length<12){for(const b of crypto.randomBytes(16)){if(b>=lim)continue;s+=ALFABETO[b%36];if(s.length===12)break}}return s}
function key(secret,order){const k=Buffer.from(secret,'base64'),iv=Buffer.alloc(8,0),c=crypto.createCipheriv('des-ede3-cbc',k,iv);c.setAutoPadding(false);const b=Buffer.alloc(Math.ceil(order.length/8)*8,0);b.write(order,'utf8');return Buffer.concat([c.update(b),c.final()])}
function sign(data,k){return crypto.createHmac('sha256',k).update(data).digest('base64')}
function clean(v,max=120){return String(v||'').trim().slice(0,max)}
function guestData(g){if(!g||typeof g!=='object')return{error:'Completa tus datos para comprar como invitado.'};const email=clean(g.email,120).toLowerCase(),name=clean(g.name,60),surname=clean(g.surname,60),phone=clean(g.phone,20);if(!name||!EMAIL.test(email))return{error:'Nombre y email válidos son obligatorios.'};if(/[<>]/.test(name+surname+phone+email))return{error:'Los datos contienen caracteres no permitidos.'};const envio=direccion.normaliza(g.direccion),problem=direccion.revisa(envio);if(problem)return{error:problem};return{email,comprador:{name,surname,phone},envio,guest:true}}
function publicProductionHost(host){const h=String(host||'').toLowerCase().split(':')[0];return h==='nutretium.com'||h==='www.nutretium.com'}
function requestId(event){const raw=clean(event.headers?.['x-nutretium-request']||event.headers?.['X-Nutretium-Request'],120);return /^[A-Za-z0-9_-]{8,120}$/.test(raw)?raw:''}
function fingerprint({email,lineas,totalCents,coupon}){const stable={email:String(email||'').toLowerCase(),items:(lineas||[]).map(i=>({id:i.id,code:i.code,qty:i.qty})),totalCents:Number(totalCents),coupon:String(coupon||'')};return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')}
function redsysPayload({order,totalCents,merchant,terminal,notify,ok,ko,secret,env}){const params={Ds_Merchant_Amount:String(totalCents),Ds_Merchant_Order:order,Ds_Merchant_MerchantCode:merchant,Ds_Merchant_Currency:'978',Ds_Merchant_TransactionType:'0',Ds_Merchant_Terminal:terminal,Ds_Merchant_MerchantURL:notify,Ds_Merchant_UrlOK:ok,Ds_Merchant_UrlKO:ko};const encoded=Buffer.from(JSON.stringify(params)).toString('base64');const signature=sign(encoded,key(secret,order));return{Ds_SignatureVersion:VERSION,Ds_MerchantParameters:encoded,Ds_Signature:signature,redsysUrl:URLS[env]||URLS.test,order}}
function summary(pedido,promo,shipment,totalCents){return{subtotal:pedido.totalCents/100,discount:promo.ok?promo.discountCents/100:0,shipping:shipment.shippingCents/100,shippingLabel:shipment.label,total:totalCents/100,coupon:promo.ok?promo.code:null}}

exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
  if(String(process.env.MAINTENANCE_MODE||'').toLowerCase()==='true')return json(503,{error:'La tienda online está temporalmente en mantenimiento. No se iniciará ningún cobro.'},{'Retry-After':'300'});
  const rate=await consume({scope:'checkout',event,limit:8,windowMs:10*60*1000}).catch(()=>({allowed:true,degraded:true}));
  if(!rate.allowed)return json(429,{error:'Demasiados intentos de checkout seguidos. Espera unos minutos antes de volver a intentarlo.'},{'Retry-After':String(rate.retryAfter)});

  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  let identidad=null;
  if(body.token){try{const email=verifyJWT(body.token).email;const comprador=await usuarios.lee(email);if(comprador){const envio=direccion.normaliza(comprador.direccion),problem=direccion.revisa(envio);if(problem)return json(422,{error:problem,motivo:'sin-direccion'});identidad={email,comprador,envio,guest:false}}}catch{}}
  if(!identidad){const g=guestData(body.guest);if(g.error)return json(401,{error:g.error,motivo:'guest-required'});identidad=g}

  const pedido=valorarCarrito(body.items);if(!pedido.ok)return json(400,{error:pedido.errores[0],detalles:pedido.errores});
  const promo=body.coupon?await promotions.calculaAsync(pedido.totalCents,body.coupon):{ok:false,subtotalCents:pedido.totalCents,discountCents:0,totalCents:pedido.totalCents};
  if(body.coupon&&!promo.ok)return json(422,{error:promo.reason==='minimum'?'El pedido no alcanza el mínimo del cupón.':'Cupón no válido o no activo.',promotion:promo});
  const merchandiseCents=promo.ok?promo.totalCents:pedido.totalCents;if(merchandiseCents<=0)return json(400,{error:'El importe final no puede ser cero.'});
  const shipment=shipping.quote({subtotalCents:merchandiseCents,address:identidad.envio});
  if(!shipment.ok){console.error('[checkout] envío bloqueado:',shipment.reason);return json(503,{error:shipment.error,motivo:shipment.reason});}
  const totalCents=merchandiseCents+shipment.shippingCents;

  const secret=process.env.REDSYS_SECRET_KEY,merchant=process.env.REDSYS_MERCHANT_CODE,terminal=process.env.REDSYS_TERMINAL||'1',env=process.env.REDSYS_ENV||'test';if(!secret||!merchant)return json(503,{error:'Pasarela de pago no configurada.'});
  const host=event.headers['x-forwarded-host']||event.headers.host||'';if(publicProductionHost(host)&&(env!=='production'||process.env.COMMERCE_LIVE!=='true'))return json(503,{error:'El pago online está temporalmente desactivado mientras se completa la configuración de producción.'});
  const base=host?`https://${host}`:'',ok=process.env.URL_OK||`${base}/.netlify/functions/pago-return?result=ok`,ko=process.env.URL_KO||`${base}/.netlify/functions/pago-return?result=ko`,notify=process.env.MERCHANT_URL||`${base}/.netlify/functions/redsys-notify`;
  const reqId=requestId(event),order=orderNumber(reqId),fp=fingerprint({email:identidad.email,lineas:pedido.lineas,totalCents,coupon:promo.ok?promo.code:''});
  let payment;try{payment=redsysPayload({order,totalCents,merchant,terminal,notify,ok,ko,secret,env})}catch(e){console.error('[checkout] firma',e);return json(500,{error:'No se pudo preparar el pago.'})}

  const store=getBlobStore('redsys-orders');if(!store)return json(503,{error:'No se ha podido guardar el pedido de forma segura. No se iniciará ningún cobro.'});
  const previous=await store.get(order,{type:'json'}).catch(()=>null);
  if(previous){if(previous.checkoutFingerprint!==fp)return json(409,{error:'La referencia de este intento ya pertenece a otro carrito. Recarga el checkout antes de continuar.'});if(previous.status&&previous.status!=='PENDING')return json(409,{error:'Este pedido ya ha sido procesado. Consulta su estado antes de volver a pagar.'});return json(200,{...payment,summary:summary(pedido,promo,shipment,totalCents),idempotent:true})}

  const record={order,email:identidad.email,envio:identidad.envio,cliente:[identidad.comprador.name,identidad.comprador.surname].filter(Boolean).join(' '),telefono:identidad.comprador.phone||'',guest:Boolean(identidad.guest),items:pedido.lineas,subtotal:pedido.totalCents/100,discount:promo.ok?promo.discountCents/100:0,promotion:promo.ok?{code:promo.code,label:promo.label}:null,shipping:{amount:shipment.shippingCents/100,label:shipment.label,country:shipment.country,free:shipment.free},amount:totalCents/100,currency:'978',status:'PENDING',checkoutFingerprint:fp,checkoutRequestId:reqId||null,createdAt:new Date().toISOString()};
  try{await store.setJSON(order,record);const verify=await store.get(order,{type:'json'}).catch(()=>null);if(!verify||verify.order!==order||verify.checkoutFingerprint!==fp||Math.round(Number(verify.amount)*100)!==totalCents)throw new Error('pedido no verificable tras persistencia');if(!identidad.guest){const idx=getBlobStore('user-orders');if(idx){const prev=(await idx.get(identidad.email,{type:'json'}).catch(()=>null))||[];await idx.setJSON(identidad.email,[order,...prev.filter(x=>x!==order)].slice(0,100));}}}catch(e){console.error('[checkout] persistencia obligatoria',order,e);return json(503,{error:'No se ha podido guardar el pedido de forma segura. No se iniciará ningún cobro. Inténtalo de nuevo.'})}
  return json(200,{...payment,summary:summary(pedido,promo,shipment,totalCents)});
};
