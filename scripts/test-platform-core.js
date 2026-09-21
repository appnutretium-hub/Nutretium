'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
const flags=require('../netlify/lib/feature-flags');
const trace=require('../netlify/lib/trace-context');
const resilience=require('../netlify/lib/provider-resilience');
const payments=require('../netlify/lib/payment-orchestrator');
const ledger=require('../netlify/lib/financial-ledger');
(async()=>{
 assert.strictEqual(flags.enabled('payments',{}),true);assert.strictEqual(flags.enabled('payments',{PAYMENTS_ENABLED:'false'}),false);assert.throws(()=>flags.requireEnabled('payments',{PAYMENTS_ENABLED:'false'}),/desactivado/);
 const id=trace.fromEvent({headers:{'x-nutretium-trace-id':'trace_12345678'}});assert.strictEqual(id,'trace_12345678');assert(trace.VALID.test(trace.fromEvent({headers:{}})));
 resilience.reset();let calls=0;const recovered=await resilience.execute('test',async()=>{calls++;if(calls<3){const e=new Error('down');e.code='PROVIDER_UNAVAILABLE';throw e;}return'ok';},{attempts:3,baseDelayMs:1});assert.strictEqual(recovered,'ok');assert.strictEqual(calls,3);
 process.env.PAYMENTS_ENABLED='false';await assert.rejects(()=>payments.resolve(),e=>e.code==='FEATURE_DISABLED');delete process.env.PAYMENTS_ENABLED;
 const entry=await ledger.append({type:'PAYMENT_CAPTURED',orderId:'TEST-1',amountCents:1234,traceId:id});assert(await ledger.verify(entry));const again=await ledger.append({type:'PAYMENT_CAPTURED',orderId:'TEST-1',amountCents:1234,traceId:id});assert.strictEqual(again.idempotent,true);
 console.log('Platform core: 11/11 OK');
})().catch(e=>{console.error(e);process.exit(1)});
