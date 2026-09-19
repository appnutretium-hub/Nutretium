'use strict';

const crypto = require('crypto');
const { valorarCarrito } = require('../lib/catalogo');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');

const CORS = cabecerasCORS('POST, OPTIONS');
const DELIVERY_CENTS = 299;
const DELIVERY_MINIMUM_CENTS = 1500;

function response(statusCode, body){return {statusCode,headers:CORS,body:JSON.stringify(body)};}
function clean(value,max=160){return String(value||'').trim().slice(0,max);}
function orderNumber(){return `STR-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`.slice(0,32);}
function originOf(event){return process.env.URL || process.env.DEPLOY_PRIME_URL || `https://${event.headers.host}`;}

exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return {statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});
  if(!process.env.STRIPE_SECRET_KEY)return response(503,{error:'Stripe todavía no está configurado.'});
  let body;try{body=JSON.parse(event.body||'{}');}catch{return response(400,{error:'Solicitud no válida.'});}
  const priced=valorarCarrito(body.items);if(!priced.ok)return response(422,{error:priced.errores[0],errors:priced.errores});
  const fulfillment=body.fulfillment==='delivery'?'delivery':'pickup';
  if(fulfillment==='delivery'&&priced.totalCents<DELIVERY_MINIMUM_CENTS)return response(422,{error:'El pedido mínimo a domicilio es 15 €.'});
  const customer=body.customer||{}, email=clean(customer.email,120).toLowerCase(), name=clean(customer.name,80), phone=clean(customer.phone,24);
  if(!email||!/^\S+@\S+\.\S+$/.test(email)||!name||!phone)return response(422,{error:'Completa nombre, teléfono y email.'});
  const address=clean(customer.address),postalCode=clean(customer.postalCode,5),city=clean(customer.city,80);
  if(fulfillment==='delivery'&&(!address||!/^(?:39)\d{3}$/.test(postalCode)||!city))return response(422,{error:'Completa una dirección válida de Santander.'});
  const order=orderNumber(), deliveryCents=fulfillment==='delivery'?DELIVERY_CENTS:0;
  const pending={order,status:'PENDING',provider:'stripe',email,name,phone,fulfillment,address:fulfillment==='delivery'?{address,postalCode,city}:null,items:priced.lineas,amount:(priced.totalCents+deliveryCents)/100,createdAt:new Date().toISOString()};
  const store=getBlobStore('stripe-orders');if(!store)return response(503,{error:'El almacenamiento de pedidos no está disponible.'});
  await store.setJSON(order,pending);
  const form=new URLSearchParams();form.set('mode','payment');form.set('success_url',`${originOf(event)}/carta.html?payment=success&order=${encodeURIComponent(order)}`);form.set('cancel_url',`${originOf(event)}/carta.html?payment=cancelled`);form.set('client_reference_id',order);form.set('customer_email',email);form.set('metadata[order]',order);form.set('metadata[fulfillment]',fulfillment);
  priced.lineas.forEach((line,i)=>{form.set(`line_items[${i}][quantity]`,String(line.qty));form.set(`line_items[${i}][price_data][currency]`,'eur');form.set(`line_items[${i}][price_data][unit_amount]`,String(Math.round(line.price*100)));form.set(`line_items[${i}][price_data][product_data][name]`,line.name);});
  if(deliveryCents){const i=priced.lineas.length;form.set(`line_items[${i}][quantity]`,'1');form.set(`line_items[${i}][price_data][currency]`,'eur');form.set(`line_items[${i}][price_data][unit_amount]`,String(deliveryCents));form.set(`line_items[${i}][price_data][product_data][name]`,'Entrega en Santander');}
  const stripe=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:form});
  const session=await stripe.json();if(!stripe.ok){console.error('[stripe-checkout]',session.error?.type);return response(502,{error:'Stripe no ha podido iniciar el pago.'});}
  pending.stripeSessionId=session.id;await store.setJSON(order,pending);return response(200,{url:session.url,order});
};
