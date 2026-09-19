'use strict';
const assert=require('assert');const schema=require('../netlify/lib/enterprise-schema');const a=require('../netlify/lib/enterprise-actions');
let n=0;function t(name,fn){fn();n++;console.log('✓',name)}
t('rechaza almacén sin campos obligatorios',()=>assert.strictEqual(schema.validate('warehouses',{}).ok,false));
t('acepta almacén válido',()=>assert.strictEqual(schema.validate('warehouses',{code:'SAN',name:'Santander',status:'active'}).ok,true));
t('inventario impide reservar más que físico',()=>assert.strictEqual(schema.validate('inventory',{sku:'X',warehouseId:'SAN',onHand:2,reserved:3}).ok,false));
t('compliance no se aprueba sin evidencia',()=>assert.strictEqual(schema.validate('product-compliance',{sku:'X',market:'ES',status:'approved'}).ok,false));
t('compliance se aprueba con evidencia',()=>assert.strictEqual(schema.validate('product-compliance',{sku:'X',market:'ES',status:'approved',evidenceComplete:true,evidence:['doc-1']}).ok,true));
t('transición de compra válida',()=>assert.strictEqual(a.transition('purchase-orders',{status:'draft'},'submitted').ok,true));
t('transición de compra imposible se bloquea',()=>assert.strictEqual(a.transition('purchase-orders',{status:'draft'},'received').ok,false));
t('reserva stock calcula disponible',()=>assert.deepStrictEqual(a.reserveInventory({onHand:10,reserved:2},3).record,{onHand:10,reserved:5,available:5}));
t('fidelización impide saldo negativo',()=>assert.strictEqual(a.loyaltyAdjust({balance:2},-3,'x').ok,false));
t('promoción porcentual se calcula en céntimos',()=>assert.strictEqual(a.promotionDiscount({status:'active',type:'percent',value:10},{subtotalCents:12345}).discountCents,1234));
t('promoción fija nunca supera subtotal',()=>assert.strictEqual(a.promotionDiscount({status:'active',type:'fixed',value:50},{subtotalCents:1000}).discountCents,1000));
t('experimento es determinista',()=>{const e={key:'hero',status:'running',variants:[{key:'a',weight:50},{key:'b',weight:50}]};assert.strictEqual(a.chooseVariant(e,'abc'),a.chooseVariant(e,'abc'))});
t('margen calcula beneficio',()=>assert.deepStrictEqual(a.margin({revenueCents:10000,costCents:6000}),{revenueCents:10000,totalCostCents:6000,grossProfitCents:4000,grossMarginPct:40}));
t('limpia prototype pollution',()=>{const x=JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');const c=schema.cleanValue(x);assert.strictEqual(c.safe,1);assert.strictEqual(Object.prototype.polluted,undefined)});
const feed=require('../netlify/functions/merchant-feed');
(async()=>{const r=await feed.handler();assert.strictEqual(r.statusCode,200);assert(r.body.includes('<rss'));assert(!r.body.includes('<g:price>NaN'));console.log('✓ merchant feed XML generado');console.log(`\n${n+1} pruebas enterprise superadas.`)})().catch(e=>{console.error(e);process.exit(1)});
