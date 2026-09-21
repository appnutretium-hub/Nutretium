'use strict';

const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
delete process.env.AI_OLLAMA_QUEUE_ENABLED;
delete process.env.AI_OLLAMA_MODEL;
delete process.env.AI_OLLAMA_RUNNER_TOKEN;

const live=require('../netlify/lib/ai-live-sources');
const truth=require('../netlify/lib/ai-truth-layer');
const queue=require('../netlify/lib/ollama-queue');
const pairing=require('../netlify/lib/ollama-pairing');
const orchestrator=require('../netlify/lib/ai-ollama-orchestrator');
const bridge=require('../netlify/functions/ai-ollama-runner');

(async()=>{
 const catalog=live.catalogRows();
 assert(catalog.length>=100,'El catálogo real no se pudo cargar desde NUTRETIUM_PRODUCTS.');
 assert(catalog.some(x=>x.sku&&x.name),'El catálogo no conserva SKU/nombre.');
 const inventory=live.inventoryRows(catalog);
 assert(inventory.length>0,'No se pudo derivar stock real del catálogo.');
 assert(inventory.every(x=>Number.isFinite(Number(x.onHand))),'Inventario contiene stock no numérico.');

 const order=live.sanitizeOrder({order:'ORD-1',email:'secret@example.test',cliente:'Nombre',telefono:'600000000',envio:{address:'x'},amount:1234,status:'PAID',items:[{sku:'SKU1',name:'Producto',quantity:2,price:4.5}],createdAt:new Date().toISOString()});
 assert(!Object.prototype.hasOwnProperty.call(order,'email'),'PII email filtrada al cerebro.');
 assert(!Object.prototype.hasOwnProperty.call(order,'cliente'),'PII nombre filtrada al cerebro.');
 assert(!Object.prototype.hasOwnProperty.call(order,'telefono'),'PII teléfono filtrada al cerebro.');
 assert.equal(order.hasShipping,true);
 const customer=live.sanitizeCustomer({id:'u1',email:'secret@example.test',phone:'600',direccion:{street:'x'},createdAt:new Date().toISOString()});
 assert(/^customer_[a-f0-9]{20}$/.test(customer.id),'Cliente no pseudonimizado.');
 assert(!Object.prototype.hasOwnProperty.call(customer,'email'),'Email cliente expuesto.');
 assert.equal(customer.hasPhone,true);assert.equal(customer.hasAddress,true);

 const tq=truth.quality('products',catalog);
 assert.notEqual(tq.status,'NO_VALIDADO','Catálogo versionado quedó NO_VALIDADO pese a tener registros e IDs.');
 const initial=await orchestrator.config({});assert.equal(initial.externalSpendLimitEur,0);assert.equal(initial.transport,'outbound_runner');
 assert.equal(bridge._test.sameSecret('abc','abc'),true);assert.equal(bridge._test.sameSecret('abc','abd'),false);

 const pair=await pairing.createPairing({createdBy:'owner@example.test',model:'test-local-model'});
 assert(pair.code&&pair.code.length>=12,'No se generó código de emparejamiento.');
 const consumed=await pairing.consumePairing({code:pair.code,runnerId:'runner-test'});
 assert.equal(consumed.ok,true,'No se consumió pairing válido.');assert(consumed.token.length>=40,'Token runner demasiado corto.');
 assert.equal((await pairing.consumePairing({code:pair.code,runnerId:'runner-2'})).ok,false,'Pairing reutilizable.');
 assert.equal(await pairing.authenticate({token:consumed.token,runnerId:'runner-test',touch:false}),true,'Credencial runner inválida.');
 assert.equal(await pairing.authenticate({token:'incorrecto',runnerId:'runner-test',touch:false}),false,'Credencial incorrecta aceptada.');
 const cfg=await orchestrator.config({});assert.equal(cfg.enabled,true);assert.equal(cfg.model,'test-local-model');assert.equal(cfg.externalSpendLimitEur,0);

 const payload={agent:'inventory',action:'low-stock-scan',messages:[{role:'system',content:'s'},{role:'user',content:'u'}],model:'test-local-model',validation:'VALIDADO',requiredSources:['inventory'],dedupeKey:'test:inventory:1'};
 const first=await queue.enqueue(payload),second=await queue.enqueue(payload);
 assert.equal(first.created,true,'Primer job no creado.');assert.equal(second.created,false,'Dedupe de cola no funciona.');assert.equal(first.job.id,second.job.id);
 const claimed=await queue.claim({runnerId:'runner-test',leaseMs:30000});assert(claimed&&claimed.leaseId,'No se reclamó job con lease.');assert.equal(claimed.status,'processing');
 const wrong=await queue.complete({id:claimed.id,leaseId:'wrong',result:'no'});assert.equal(wrong.ok,false,'Lease incorrecto pudo completar trabajo.');
 const done=await queue.complete({id:claimed.id,leaseId:claimed.leaseId,result:'DATO VERIFICADO: test',model:'test-local-model'});assert.equal(done.ok,true);assert.equal(done.job.status,'completed');
 const stats=await queue.stats();assert.equal(stats.completed,1);assert.equal(stats.failed,0);

 console.log(`AI live sources + Ollama pairing/queue regressions: OK (${catalog.length} catálogo, ${inventory.length} stock)`);
})().catch(error=>{console.error(error);process.exit(1)});
