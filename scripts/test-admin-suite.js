'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
globalThis.__NUTRETIUM_TEST_BLOBS__=new Map();globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map();
const directory=require('../netlify/lib/staff-directory');
const productContent=require('../netlify/lib/product-content');
const report=require('../netlify/functions/commerce-report')._test;
(async()=>{
 let rejected=false;try{await directory.save({email:'owner-test@nutretium.com',role:'owner'})}catch{rejected=true}assert.equal(rejected,true,'dynamic directory must reject owner role');
 const member=await directory.save({email:'manager-test@nutretium.com',role:'manager',name:'Manager Test',active:true});assert.equal(member.role,'manager');assert.equal((await directory.read(member.email)).active,true);
 const bad=productContent.validate('SKU-1',{ean:'ABC'});assert.equal(bad.ok,false,'invalid EAN must fail');
 const draft=await productContent.saveDraft('SKU-1',{description:'Ficha verificada en preparación',ean:'12345678',gallery:['/sources/productos/test.jpg']},'marketing@nutretium.com');assert.equal(draft.status,'draft');assert.equal((await productContent.read('SKU-1')).status,'draft');
 const approved=await productContent.approve('SKU-1','compliance@nutretium.com');assert.equal(approved.status,'approved');assert.equal(approved.approvedBy,'compliance@nutretium.com');
 await productContent.replaceAll([approved]);assert.equal((await productContent.read('SKU-1')).status,'approved','restore must preserve approved state');
 const costs=new Map([['A',500]]),summary=report.summarize([{amount:20,items:[{code:'A',qty:2},{code:'B',qty:1}]}],costs);assert.equal(summary.revenueCents,2000);assert.equal(summary.knownCostCents,1000);assert.deepEqual(summary.unknownCostSkus,['B']);assert.equal(summary.grossMarginKnownCostPct,null,'margin must remain unvalidated when a cost is missing');
 const complete=report.summarize([{amount:20,items:[{code:'A',qty:2}]}],costs);assert.equal(complete.grossMarginKnownCostPct,50);
 console.log('[test-admin-suite] dynamic roles, product content and financial validation OK');
})().catch(err=>{console.error(err);process.exit(1)});