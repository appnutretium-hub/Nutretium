/**
 * GET lista reseñas aprobadas. POST envía una reseña a moderación.
 * La marca «compra verificada» exige una sesión vigente y un pedido PAID.
 */
'use strict';
const crypto=require('crypto');
const {cabecerasCORS}=require('../lib/cors');
const {getBlobStore}=require('../lib/blob-store');
const sesionCliente=require('../lib/session');const {verifyUserToken}=sesionCliente;
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const clean=(v,n)=>String(v||'').trim().slice(0,n);
async function getStore(){return getBlobStore('reviews')}
async function readReviews(){const s=await getStore();if(!s)return[];const raw=await s.get('all',{type:'json'}).catch(()=>null);return Array.isArray(raw)?raw:[]}
async function writeReviews(reviews){const s=await getStore();if(s)await s.setJSON('all',reviews)}
async function verifiedPurchase(token,product){
 if(!token)return false;
 let email;try{email=(await verifyUserToken(token)).email}catch{return false}
 const idx=getBlobStore('user-orders'),orders=getBlobStore('redsys-orders');if(!idx||!orders)return false;
 const ids=(await idx.get(email,{type:'json'}).catch(()=>null))||[];
 const rows=await Promise.all(ids.slice(0,100).map(id=>orders.get(id,{type:'json'}).catch(()=>null)));
 return rows.some(r=>r&&r.email===email&&r.status==='PAID'&&(r.items||[]).some(i=>String(i.name)===String(product)));
}
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod==='GET'){const reviews=await readReviews();return{statusCode:200,headers:CORS,body:JSON.stringify({reviews:reviews.filter(r=>r.approved===true)})}}
 if(event.httpMethod==='POST'){
  let body;try{body=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:CORS,body:JSON.stringify({error:'JSON inválido.'})}}
  if(body.action!=='submit')return{statusCode:400,headers:CORS,body:JSON.stringify({error:'Acción no reconocida.'})};
  const review=body.review||{};if(!review.author||!review.product||!review.rating||!review.text)return{statusCode:400,headers:CORS,body:JSON.stringify({error:'Faltan campos obligatorios.'})};
  const rating=Math.round(Number(review.rating));if(!Number.isFinite(rating)||rating<1||rating>5)return{statusCode:400,headers:CORS,body:JSON.stringify({error:'Valoración inválida.'})};
  const product=clean(review.product,100),verified=await verifiedPurchase(sesionCliente.customerEventToken(event,body.token),product);
  const newReview={id:crypto.randomUUID(),author:clean(review.author,60),product,rating,text:clean(review.text,500),date:new Date().toISOString().slice(0,10),approved:false,verifiedPurchase:verified};
  const reviews=await readReviews();reviews.unshift(newReview);await writeReviews(reviews);
  return{statusCode:201,headers:CORS,body:JSON.stringify({success:true,pendingModeration:true,verifiedPurchase:verified,message:'Gracias. Tu reseña se publicará tras ser revisada.'})};
 }
 return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
};