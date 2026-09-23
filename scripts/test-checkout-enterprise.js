'use strict';
require('./test-env');

'use strict';const assert=require('assert');const q=require('../netlify/lib/checkout-enterprise');let n=0;function t(name,fn){fn();n++;console.log('✓',name)}
t('España se normaliza a ES',()=>assert.strictEqual(q.country('España'),'ES'));
t('regla postal específica gana a la general',()=>{const r=q.selectShippingRule([{id:'general',status:'active',country:'ES',priceCents:500,isDefault:true},{id:'local',status:'active',country:'ES',postalPrefixes:['39'],priceCents:200}],{pais:'España',cp:'39001'});assert.strictEqual(r.id,'local')});
t('sin tarifa configurada mantiene envío cero',()=>assert.strictEqual(q.calculateQuote({subtotalCents:1000}).shippingCents,0));
t('cupón porcentual se aplica solo en servidor',()=>{const r=q.calculateQuote({subtotalCents:10000,promotion:{id:'p',code:'10',status:'active',type:'percent',value:10}});assert.strictEqual(r.totalCents,9000)});
t('envío configurado entra en total',()=>{const r=q.calculateQuote({subtotalCents:1000,shippingRules:[{id:'s',name:'S',status:'active',country:'ES',priceCents:350,isDefault:true}],address:{pais:'ES'}});assert.strictEqual(r.totalCents,1350)});
t('free shipping anula tarifa pero no precio producto',()=>{const r=q.calculateQuote({subtotalCents:1000,promotion:{id:'p',code:'FREE',status:'active',type:'free_shipping'},shippingRules:[{id:'s',name:'S',status:'active',country:'ES',priceCents:350,isDefault:true}],address:{pais:'ES'}});assert.strictEqual(r.totalCents,1000)});
console.log(`\n${n} pruebas checkout enterprise superadas.`);
