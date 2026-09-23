'use strict';
require('./test-env');
const assert=require('assert');
const E=require('../smart-store-engine.js');
const feed=require('../netlify/functions/catalog-json.js')._test;
const sample=[
 {id:1,code:'W1',name:'Whey Cacao 2 kg',category:'Proteínas',price:39.9,stock:5,active:true,featured:true},
 {id:2,code:'C1',name:'Creatina 300 g',category:'Creatinas',price:19.9,stock:8,active:true},
 {id:3,code:'A1',name:'Shaker Gold',category:'Accesorios gym',price:8.9,stock:4,active:true},
 {id:4,code:'P1',name:'Pre Workout 250 g',category:'Pre-entrenos',price:29.9,stock:0,active:true},
 {id:5,code:'V1',name:'Multivitamínico',category:'Vitaminas y salud',price:15.9,stock:null,active:true},
 {id:6,code:'OLD',name:'Proteína retirada 1 kg',category:'Proteínas',price:9.9,stock:9,active:false}
];
assert.deepStrictEqual(E.activeCatalog(sample).map(x=>x.id),[1,2,3,4,5]);
assert.strictEqual(E.availability(sample[0]),'in_stock');
assert.strictEqual(E.availability(sample[3]),'out_of_stock');
assert.strictEqual(E.availability(sample[4]),'unknown');
assert.strictEqual(E.parseIntent('creatina por menos de 25 euros').budget,25);
assert.ok(E.parseIntent('quiero creatina').categories.includes('Creatinas'));
assert.deepStrictEqual(E.find(sample,'creatina por menos de 25 euros').map(x=>x.id),[2]);
assert.ok(!E.find(sample,'proteína').some(x=>x.id===6),'inactive product leaked into finder');
const stack=E.buildStack(sample,{preset:'entrenamiento',budget:70,maxItems:3});
assert.deepStrictEqual(stack.items.map(x=>x.id),[1,2,3]);
assert.ok(stack.total<=70);
assert.ok(!stack.items.some(x=>E.availability(x)==='out_of_stock'));
assert.strictEqual(E.extractMeasure('Whey Cacao 2 kg').amount,2000);
assert.strictEqual(E.extractMeasure('Creatina 300 g').amount,300);
assert.strictEqual(E.unitPrice(sample[1]).per100,6.63);
const token=E.encodeList([1,2,2,3,'bad']);
assert.deepStrictEqual(E.decodeList(token),[1,2,3]);
assert.strictEqual(feed.availability({stock:2}),'https://schema.org/InStock');
assert.strictEqual(feed.availability({stock:0}),'https://schema.org/OutOfStock');
assert.strictEqual(feed.availability({stock:null}),null);
const unknown=feed.item({id:9,code:'X',name:'Producto Test',category:'Proteínas',price:10,stock:null,active:true});
assert.ok(!Object.prototype.hasOwnProperty.call(unknown.offers,'availability'),'unknown stock must not be inferred');
assert.strictEqual(feed.eligible({id:1,name:'X',price:1,active:true}),true);
assert.strictEqual(feed.eligible({id:1,name:'X',price:1,active:false}),false);
const fs=require('fs');
const sw=fs.readFileSync(require('path').join(__dirname,'..','sw.js'),'utf8');
assert.ok(sw.includes("url.pathname.startsWith('/.netlify/functions/')"),'service worker must bypass functions');
assert.ok(sw.includes("req.method!=='GET'"),'service worker must bypass writes');
const smart=fs.readFileSync(require('path').join(__dirname,'..','smart-store.js'),'utf8');
assert.ok(smart.includes('Disponibilidad por confirmar'));
assert.ok(!/diagnostic|cura|trata(?:miento)?/i.test(smart),'medical claims detected');
console.log('Smart Store tests OK');
