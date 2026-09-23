'use strict';
require('./test-env');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET='secreto-de-pruebas-con-mas-de-32-caracteres';
process.env.REDSYS_SECRET_KEY='sq7HjrUOBfKmC576ILgskD5srU870gJ7';
process.env.REDSYS_MERCHANT_CODE='369551841';
process.env.REDSYS_TERMINAL='1';
process.env.REDSYS_ENV='test';
process.env.SHIPPING_ENABLED='true';
process.env.SHIPPING_RATE_CENTS='490';
process.env.SHIPPING_COUNTRY='España';
process.env.SHIPPING_LABEL='Envío península';
delete process.env.COMMERCE_LIVE;

globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();

const assert=require('assert');
const {NUTRETIUM_PRODUCTS}=require('../products-data.js');
const inventory=require('../netlify/lib/inventory');
const checkout=require('../netlify/functions/checkout').handler;
const legacy=require('../netlify/functions/redsys').handler;

function guest(){return{name:'Cliente',surname:'Prueba',email:'cliente-prueba@ejemplo.com',phone:'600123123',direccion:{calle:'Calle La Albericia 1',piso:'',cp:'39012',localidad:'Santander',provincia:'Cantabria',pais:'España'}}}
function event(body,id='commerce-core-0001'){return{httpMethod:'POST',headers:{host:'preview.example.net','content-type':'application/json','x-nf-client-connection-ip':'127.0.0.1','x-nutretium-request':id},body:JSON.stringify(body)}}

async function main(){
  const product=NUTRETIUM_PRODUCTS.find(p=>p.active!==false&&Number.isInteger(p.stock)&&p.stock>=1&&p.stock<=20)||NUTRETIUM_PRODUCTS.find(p=>p.active!==false&&Number.isInteger(p.stock)&&p.stock>=1);
  assert(product,'Hace falta al menos un producto con stock finito para probar inventario.');

  const qty=Math.max(1,Number(product.stock));
  let r=await inventory.reserve('TESTORDER001',[{id:product.id,code:product.code,qty}]);
  assert.equal(r.ok,true,'La primera reserva debe entrar.');
  r=await inventory.reserve('TESTORDER002',[{id:product.id,code:product.code,qty:1}]);
  assert.equal(r.ok,false,'No debe poder reservarse por encima del stock.');
  assert.equal(r.reason,'insufficient-stock');
  await inventory.release('TESTORDER001',[{id:product.id,code:product.code,qty}]);
  r=await inventory.reserve('TESTORDER002',[{id:product.id,code:product.code,qty:1}]);
  assert.equal(r.ok,true,'Al liberar debe volver a existir disponibilidad.');
  r=await inventory.commit('TESTORDER002',[{id:product.id,code:product.code,qty:1}]);
  assert.equal(r.ok,true,'La reserva pagada debe poder confirmarse.');
  r=await inventory.commit('TESTORDER002',[{id:product.id,code:product.code,qty:1}]);
  assert.equal(r.ok,true,'Confirmar dos veces debe ser idempotente.');

  const old=await legacy(event({}));
  assert.equal(old.statusCode,410,'El endpoint Redsys heredado debe estar retirado.');
  assert(!JSON.parse(old.body).Ds_Signature,'El endpoint retirado nunca debe firmar pagos.');

  // Otro SKU para no interferir con la prueba de commit anterior.
  const checkoutProduct=NUTRETIUM_PRODUCTS.find(p=>p.active!==false&&(p.stock===null||p.stock>2)&&p.id!==product.id);
  assert(checkoutProduct,'Hace falta un segundo producto vendible para probar checkout.');
  // Las condiciones de contratación se aceptan en la petición: sin ellas el
  // checkout responde 422 `terms-required` antes de valorar nada.
  const body={items:[{id:checkoutProduct.id,code:checkoutProduct.code,qty:1}],termsAccepted:true,termsVersion:'2026-09-20',guest:guest()};
  const first=await checkout(event(body,'checkout-idempotent-0001'));
  assert.equal(first.statusCode,200,first.body);
  const data=JSON.parse(first.body);
  assert(data.Ds_Signature&&data.Ds_MerchantParameters,'El checkout actual debe preparar Redsys.');
  assert.equal(data.summary.shipping,4.90,'El transporte debe formar parte del total.');
  assert(data.reservationExpiresAt,'El checkout debe devolver una reserva de inventario.');

  const second=await checkout(event(body,'checkout-idempotent-0001'));
  assert.equal(second.statusCode,200,second.body);
  const again=JSON.parse(second.body);
  assert.equal(again.order,data.order,'El mismo request id debe conservar el pedido.');
  assert.equal(again.idempotent,true,'El reintento debe declararse idempotente.');

  console.log('OK commerce-core: checkout único, transporte, idempotencia e inventario transaccional.');
}

main().catch(err=>{console.error(err);process.exit(1)});
