'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');
const { verifyJWT } = require('../lib/jwt');
const { valorarCarrito } = require('../lib/catalogo');
const usuarios = require('../lib/usuarios');
const direccion = require('../lib/direccion');
const promotions = require('../lib/promotions');
const { consume } = require('../lib/rate-limit');

const CORS = cabecerasCORS('POST, OPTIONS');
const URLS={test:'https://sis-t.redsys.es:25443/sis/realizarPago',production:'https://sis.redsys.es/sis/realizarPago'};
const VERSION='HMAC_SHA256_V1';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALFABETO='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function json(statusCode,payload,extraHeaders={}){return{statusCode,headers:{...CORS,...extraHeaders},body:JSON.stringify(payload)}}
function orderNumber(){const d=new Date(),pad=n=>String(n).padStart(2,'0');let s=pad(d.getMonth()+1)+pad(d.getDate());const lim=252;while(s.length<12){for(const b of crypto.randomBytes(16)){if(b>=lim)continue;s+=ALFABETO[b%36];if(s.length===12)break}}return s}
function key(secret,order){const k=Buffer.from(secret,'base64'),iv=Buffer.alloc(8,0),c=crypto.createCipheriv('des-ede3-cbc',k,iv);c.setAutoPadding(false);const b=Buffer.alloc(Math.ceil(order.length/8)*8,0);b.write(order,'utf8');return Buffer.concat([c.update(b),c.final()])}
function sign(data,k){return crypto.createHmac('sha256',k).update(data).digest('base64')}
function clean(v,max=120){return String(v||'').trim().slice(0,max)}
function guestData(g){
  if(!g||typeof g!=='object')return{error:'Completa tus datos para comprar como invitado.'};
  const email=clean(g.email,120).toLowerCase(),name=clean(g.name,60),surname=clean(g.surname,60),phone=clean(g.phone,20);
  if(!name||!EMAIL.test(email))return{error:'Nombre y email válidos son obligatorios.'};
  if(/[<>]/.test(name+surname+phone+email))return{error:'Los datos contienen caracteres no permitidos.'};
  const envio=direccion.normaliza(g.direccion),problem=direccion.revisa(envio);
  if(problem)return{error:problem};
  return{email,comprador:{name,surname,phone},envio,guest:true};
}
function publicProductionHost(host){const h=String(host||'').toLowerCase().split(':')[0];return h==='nutretium.com'||h==='www.nutretium.com'}

exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
  if(String(process.env.MAINTENANCE_MODE||'').toLowerCase()==='true')return json(503,{error:'La tienda online está temporalmente en mantenimiento. No se iniciará ningún cobro.'},{'Retry-After':'300'});
  const rate=await consume({scope:'checkout',event,limit:8,windowMs:10*60*1000}).catch(()=>({allowed:true,degraded:true}));
  if(!rate.allowed)return json(429,{error:'Demasiados intentos de checkout seguidos. Espera unos minutos antes de volver a intentarlo.'},{'Retry-After':String(rate.retryAfter)});

  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  let identidad=null;
  if(body.token){
    try{const email=verifyJWT(body.token).email;const comprador=await usuarios.lee(email);if(comprador){const envio=direccion.normaliza(comprador.direccion),problem=direccion.revisa(envio);if(problem)return json(422,{error:problem,motivo:'sin-direccion'});identidad={email,comprador,envio,guest:false}}}catch{}
  }
  if(!identidad){const g=guestData(body.guest);if(g.error)return json(401,{error:g.error,motivo:'guest-required'});identidad=g}

  const pedido=valorarCarrito(body.items);
  if(!pedido.ok)return json(400,{error:pedido.errores[0],detalles:pedido.errores});
  const promo=body.coupon?await promotions.calculaAsync(pedido.totalCents,body.coupon):{ok:false,subtotalCents:pedido.totalCents,discountCents:0,totalCents:pedido.totalCents};
  if(body.coupon&&!promo.ok)return json(422,{error:promo.reason==='minimum'?'El pedido no alcanza el mínimo del cupón.':'Cupón no válido o no activo.',promotion:promo});
  const totalCents=promo.ok?promo.totalCents:pedido.totalCents;
  if(totalCents<=0)return json(400,{error:'El importe final no puede ser cero.'});

  const secret=process.env.REDSYS_SECRET_KEY,merchant=process.env.REDSYS_MERCHANT_CODE,terminal=process.env.REDSYS_TERMINAL||'1',env=process.env.REDSYS_ENV||'test';
  if(!secret||!merchant)return json(503,{error:'Pasarela de pago no configurada.'});
  const host=event.headers['x-forwarded-host']||event.headers.host||'';
  if(publicProductionHost(host)&&(env!=='production'||process.env.COMMERCE_LIVE!=='true'))return json(503,{error:'El pago online está temporalmente desactivado mientras se completa la configuración de producción.'});
  const base=host?`https://${host}`:'';
  const ok=process.env.URL_OK||`${base}/.netlify/functions/pago-return?result=ok`,ko=process.env.URL_KO||`${base}/.netlify/functions/pago-return?result=ko`,notify=process.env.MERCHANT_URL||`${base}/.netlify/functions/redsys-notify`;
  const order=orderNumber();
  const params={Ds_Merchant_Amount:String(totalCents),Ds_Merchant_Order:order,Ds_Merchant_MerchantCode:merchant,Ds_Merchant_Currency:'978',Ds_Merchant_TransactionType:'0',Ds_Merchant_Terminal:terminal,Ds_Merchant_MerchantURL:notify,Ds_Merchant_UrlOK:ok,Ds_Merchant_UrlKO:ko};
  const encoded=Buffer.from(JSON.stringify(params)).toString('base64');
  let signature;try{signature=sign(encoded,key(secret,order))}catch(e){console.error('[checkout] firma',e);return json(500,{error:'No se pudo preparar el pago.'})}
  const record={order,email:identidad.email,envio:identidad.envio,cliente:[identidad.comprador.name,identidad.comprador.surname].filter(Boolean).join(' '),telefono:identidad.comprador.phone||'',guest:Boolean(identidad.guest),items:pedido.lineas,subtotal:pedido.totalCents/100,discount:promo.ok?promo.discountCents/100:0,promotion:promo.ok?{code:promo.code,label:promo.label}:null,amount:totalCents/100,currency:'978',status:'PENDING',createdAt:new Date().toISOString()};
  try{
    const store=getBlobStore('redsys-orders');if(!store)throw new Error('redsys-orders no disponible');
    await store.setJSON(order,record);const verify=await store.get(order,{type:'json'}).catch(()=>null);
    if(!verify||verify.order!==order||Math.round(Number(verify.amount)*100)!==totalCents)throw new Error('pedido no verificable tras persistencia');
    if(!identidad.guest){const idx=getBlobStore('user-orders');if(idx){const prev=(await idx.get(identidad.email,{type:'json'}).catch(()=>null))||[];await idx.setJSON(identidad.email,[order,...prev.filter(x=>x!==order)].slice(0,100));}}
  }catch(e){console.error('[checkout] persistencia obligatoria',order,e);return json(503,{error:'No se ha podido guardar el pedido de forma segura. No se iniciará ningún cobro. Inténtalo de nuevo.'})}
  return json(200,{Ds_SignatureVersion:VERSION,Ds_MerchantParameters:encoded,Ds_Signature:signature,redsysUrl:URLS[env]||URLS.test,order,summary:{subtotal:pedido.totalCents/100,discount:promo.ok?promo.discountCents/100:0,total:totalCents/100,coupon:promo.ok?promo.code:null}});
};