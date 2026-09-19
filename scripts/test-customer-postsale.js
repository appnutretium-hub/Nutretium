'use strict';

process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET='test-secret-abcdefghijklmnopqrstuvwxyz-1234567890';

const assert=require('assert');
const {signJWT}=require('../netlify/lib/jwt');
const usuarios=require('../netlify/lib/usuarios');
const {getBlobStore}=require('../netlify/lib/blob-store');
const customer=require('../netlify/functions/customer-data');
const postSale=require('../netlify/functions/post-sale');
const {NUTRETIUM_PRODUCTS=[]}=require('../products-data.js');

const email='cliente-prueba@nutretium.test';
const user={id:'u-test',name:'Cliente',surname:'Prueba',email,phone:'600000000',direccion:{calle:'Calle Test 1',piso:'',cp:'39001',localidad:'Santander',provincia:'Cantabria',pais:'España'},passwordHash:'test'};
const token=signJWT({sub:user.id,email,exp:Math.floor(Date.now()/1000)+3600});
const event=(method,body)=>({httpMethod:method,headers:{authorization:`Bearer ${token}`,'x-nf-client-connection-ip':'127.0.0.1'},body:body?JSON.stringify(body):''});
const parse=r=>JSON.parse(r.body||'{}');

(async()=>{
  await usuarios.escribe(email,user);
  const active=NUTRETIUM_PRODUCTS.find(p=>p&&p.active!==false);
  assert(active,'Debe existir un producto activo para probar favoritos');

  let r=await customer.handler(event('POST',{action:'save-wishlist',ids:[active.id,999999]}));
  assert.strictEqual(r.statusCode,200);assert.deepStrictEqual(parse(r).wishlist,[Number(active.id)],'Favoritos debe descartar productos inexistentes');

  r=await customer.handler(event('POST',{action:'add-address',label:'Trabajo',isDefault:true,direccion:{calle:'Avenida Test 2',piso:'2A',cp:'39002',localidad:'Santander',provincia:'Cantabria',pais:'España'}}));
  assert.strictEqual(r.statusCode,201);let data=parse(r);assert.strictEqual(data.addresses.length,1);assert.strictEqual(data.addresses[0].isDefault,true);
  const addressId=data.addresses[0].id;

  r=await customer.handler(event('POST',{action:'set-default-address',id:addressId}));
  assert.strictEqual(r.statusCode,200);
  r=await customer.handler(event('GET'));data=parse(r);assert.strictEqual(data.wishlist[0],Number(active.id));assert.strictEqual(data.addresses[0].label,'Trabajo');

  const order='NT-TEST-POSTSALE';
  await getBlobStore('redsys-orders').setJSON(order,{order,email,status:'PAID',amount:24.90,items:[{id:active.id,name:active.name,qty:1}]});

  r=await postSale.handler(event('POST',{action:'request-return',order,reason:'Producto sin abrir, deseo tramitar devolución'}));
  assert.strictEqual(r.statusCode,201);let req=parse(r).request;assert.strictEqual(req.type,'RETURN');assert.strictEqual(req.refundStatus,'NOT_STARTED');
  r=await postSale.handler(event('POST',{action:'request-return',order,reason:'Producto sin abrir, deseo tramitar devolución'}));
  assert.strictEqual(r.statusCode,200);assert.strictEqual(parse(r).idempotent,true,'No debe duplicar una devolución abierta');

  r=await postSale.handler(event('POST',{action:'request-invoice',order,legalName:'Cliente Prueba',taxId:'12345678Z',billingAddress:'Calle Test 1, 39001 Santander'}));
  assert.strictEqual(r.statusCode,201);req=parse(r).request;assert.strictEqual(req.type,'INVOICE');assert.strictEqual(req.documentStatus,'NOT_ISSUED');

  r=await postSale.handler(event('GET'));data=parse(r);assert.strictEqual(data.requests.length,2,'Debe conservar devolución y factura');
  console.log('[test-customer-postsale] OK · favoritos sincronizados · direcciones · devolución · solicitud de factura');
})().catch(err=>{console.error(err);process.exit(1)});
