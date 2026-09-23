'use strict';
require('./test-env');
const assert=require('assert');
const feed=require('../netlify/functions/merchant-feed')._test;
let count=0;function t(name,fn){fn();count++;console.log('✓',name)}
const base={id:1,code:'SKU1',name:'Producto Test',price:19.9,image:'/img/test.webp',brand:'Marca',category:'Suplementos',active:true,stock:3};
t('excluye productos con stock desconocido',()=>assert.strictEqual(feed.renderItem({...base,stock:null},{}),null));
t('marca agotado cuando stock es cero',()=>assert(feed.renderItem({...base,stock:0},{}).includes('<g:availability>out_of_stock</g:availability>')));
t('marca disponible cuando stock es positivo',()=>assert(feed.renderItem(base,{}).includes('<g:availability>in_stock</g:availability>')));
t('solo publica GTIN desde contenido aprobado',()=>{const approved=feed.renderItem(base,{status:'approved',ean:'1234567890123',description:'Descripción aprobada'});const draft=feed.renderItem(base,{status:'draft',ean:'1234567890123'});assert(approved.includes('<g:gtin>1234567890123</g:gtin>'));assert(!draft.includes('<g:gtin>'));});
t('no inventa GTIN inválido aunque esté aprobado',()=>assert(!feed.renderItem(base,{status:'approved',ean:'ABC'}).includes('<g:gtin>')));
console.log(`\n${count} pruebas de Merchant feed superadas.`);
