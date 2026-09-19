'use strict';
const { getBlobStore } = require('../lib/blob-store');
const { cabecerasCORS } = require('../lib/cors');
const { verifyEventSession } = require('../lib/session');
const { valorarCarrito } = require('../lib/catalogo');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
function json(statusCode,payload){return{statusCode,headers:CORS,body:JSON.stringify(payload)}}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 let session;try{session=await verifyEventSession(event)}catch{return json(401,{error:'Debes iniciar sesión.'})}
 const email=session.email,store=getBlobStore('saved-carts');if(!store)return json(503,{error:'Carrito guardado no disponible.'});
 if(event.httpMethod==='GET'){const cart=await store.get(email,{type:'json'}).catch(()=>null);return json(200,{cart:cart||null})}
 if(event.httpMethod==='POST'){
  let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
  const items=Array.isArray(body.items)?body.items.slice(0,100):[];
  if(!items.length){await store.delete(email).catch(()=>{});return json(200,{ok:true,cleared:true})}
  const priced=valorarCarrito(items);if(!priced.ok)return json(400,{error:priced.errores[0],detalles:priced.errores});
  const record={email,items:priced.lineas,total:priced.totalCents/100,updatedAt:new Date().toISOString()};await store.setJSON(email,record);return json(200,{ok:true,cart:record});
 }
 return json(405,{error:'Method Not Allowed'});
};