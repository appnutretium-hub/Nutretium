'use strict';
const crypto=require('crypto');
const enterprise=require('../lib/enterprise-store');
const sesionCliente=require('../lib/session');
const {verifyUserToken}=sesionCliente;
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('POST, OPTIONS');
const ALLOWED=new Set(['nt_product_view','nt_search_select','nt_add_to_cart','nt_wishlist_add','nt_wishlist_remove','nt_compare_add','nt_compare_remove','nt_compare_open','nt_catalog_filter','nt_catalog_sort','nt_category_view','nt_begin_checkout','nt_purchase','nt_search','nt_remove_from_cart']);
const response=(s,b)=>({statusCode:s,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(b)});
async function authenticatedConsent(event){
 // La sesión llega por cookie HttpOnly: mirar solo la cabecera dejaba sin
 // atribuir los eventos de todo cliente identificado.
 const token=sesionCliente.customerEventToken(event);if(!token)return null;
 let verified;try{verified=await verifyUserToken(token,{requireUser:true})}catch{return false}
 const id=`${verified.email}:analytics`,record=await enterprise.get('consent-settings',id).catch(()=>null);
 return record?.status==='granted'?verified.email:false;
}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 const name=String(body.name||'');if(!ALLOWED.has(name))return response(400,{error:'Evento no permitido.'});
 let subject=await authenticatedConsent(event);if(subject===false)return response(403,{error:'No hay consentimiento de analítica.'});
 if(subject===null){if(body.consent!==true)return response(403,{error:'No hay consentimiento de analítica.'});subject='anonymous:'+crypto.createHash('sha256').update(String(body.subject||event.headers?.['x-nf-client-connection-ip']||'anonymous')).digest('hex').slice(0,20)}
 const payload=body.payload&&typeof body.payload==='object'?body.payload:{},id=crypto.randomUUID(),record={id,name,occurredAt:new Date().toISOString(),subject,payload:{product_id:payload.product_id??null,category:payload.category??null,query:String(payload.query||'').slice(0,160),sort:String(payload.sort||'').slice(0,80),filter:String(payload.filter||'').slice(0,80),price:Number.isFinite(Number(payload.price))?Number(payload.price):null}};
 await enterprise.save('analytics-events',record,{email:subject,role:'client'},{id,reason:'consented-analytics'});
 return response(202,{ok:true});
};
