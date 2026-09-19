'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { verifyEventSession } = require('../lib/session');
const { consume } = require('../lib/rate-limit');

const CORS = cabecerasCORS('GET, POST, OPTIONS');
const response = (statusCode,payload,extra={}) => ({statusCode,headers:{...CORS,...extra},body:JSON.stringify(payload)});
const safeText = (v,max=500) => String(v||'').trim().replace(/[<>]/g,'').slice(0,max);

async function loadOrder(order,email){
  const store=getBlobStore('redsys-orders');
  if(!store)return null;
  const rec=await store.get(String(order||''),{type:'json'}).catch(()=>null);
  if(!rec||String(rec.email||'').toLowerCase()!==String(email||'').toLowerCase())return null;
  return rec;
}

exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(!['GET','POST'].includes(event.httpMethod))return response(405,{error:'Method Not Allowed'});
  let session;try{session=await verifyEventSession(event)}catch{return response(401,{error:'Sesión caducada. Vuelve a iniciar sesión.'})}
  const store=getBlobStore('post-sale');
  if(!store)return response(503,{error:'Postventa no disponible en este momento.'});
  const key=session.email;
  const current=(await store.get(key,{type:'json'}).catch(()=>null))||{requests:[]};
  current.requests=Array.isArray(current.requests)?current.requests:[];
  if(event.httpMethod==='GET')return response(200,{requests:current.requests.slice(0,100)});

  const rate=await consume({scope:'post-sale',event,extra:session.email,limit:8,windowMs:60*60*1000});
  if(!rate.allowed)return response(429,{error:'Demasiadas solicitudes. Inténtalo más tarde.'},{'Retry-After':String(rate.retryAfter||60)});
  let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'Invalid JSON'})}
  const order=safeText(body.order,40);
  const orderRec=await loadOrder(order,session.email);
  if(!orderRec)return response(404,{error:'Pedido no encontrado para esta cuenta.'});
  if(orderRec.status!=='PAID')return response(409,{error:'La postventa solo puede tramitarse sobre pedidos pagados.'});

  if(body.action==='request-return'){
    const reason=safeText(body.reason,600);
    if(reason.length<5)return response(400,{error:'Indica brevemente el motivo de la devolución.'});
    const duplicate=current.requests.find(r=>r.type==='RETURN'&&r.order===order&&['REQUESTED','REVIEW'].includes(r.status));
    if(duplicate)return response(200,{request:duplicate,idempotent:true});
    const req={id:crypto.randomUUID(),type:'RETURN',order,status:'REQUESTED',reason,createdAt:new Date().toISOString(),refundStatus:'NOT_STARTED'};
    current.requests.unshift(req);await store.setJSON(key,current);return response(201,{request:req});
  }

  if(body.action==='request-invoice'){
    const legalName=safeText(body.legalName,120),taxId=safeText(body.taxId,40),billingAddress=safeText(body.billingAddress,220);
    if(!legalName||!taxId||!billingAddress)return response(400,{error:'Razón social/nombre fiscal, NIF/CIF y dirección fiscal son obligatorios.'});
    const duplicate=current.requests.find(r=>r.type==='INVOICE'&&r.order===order&&['REQUESTED','REVIEW'].includes(r.status));
    if(duplicate)return response(200,{request:duplicate,idempotent:true});
    const req={id:crypto.randomUUID(),type:'INVOICE',order,status:'REQUESTED',legalName,taxId,billingAddress,createdAt:new Date().toISOString(),documentStatus:'NOT_ISSUED'};
    current.requests.unshift(req);await store.setJSON(key,current);return response(201,{request:req,note:'Solicitud registrada. La emisión fiscal requiere validación y numeración del sistema de facturación.'});
  }

  return response(400,{error:'Acción no reconocida.'});
};
