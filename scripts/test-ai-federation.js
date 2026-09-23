'use strict';
require('./test-env');

const assert=require('assert');
const federation=require('../netlify/lib/federated-ai-router');

const base={AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PAID_PROVIDER_ENABLED:'false',AUTO_RECHARGE_ENABLED:'false'};

// No provider is usable by accident: each external route requires both credentials
// and an explicit confirmation that the account/project is on its free tier.
const none=federation.available(base);
assert(none.length>=5,'Se esperan proveedores federados conocidos.');
assert(none.every(x=>x.enabled===false),'Sin credenciales/confirmación ningún proveedor externo debe activarse.');

// Paid/unknown models must fail closed even if a credential exists.
assert.throws(()=>federation.assertProviderFree('gemini_free',{...base,GEMINI_API_KEY:'x',GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_FREE_MODEL:'gemini-3.1-pro-preview'}),/allowlist gratuita/);
assert.throws(()=>federation.assertProviderFree('cloudflare_free',{...base,CLOUDFLARE_ACCOUNT_ID:'a',CLOUDFLARE_API_TOKEN:'x',CLOUDFLARE_WORKERS_FREE_PLAN_CONFIRMED:'true',CLOUDFLARE_FREE_MODEL:'@cf/zai-org/glm-5.3'}),/allowlist gratuita/);
assert.throws(()=>federation.assertProviderFree('unknown_provider',base),/no reconocido/);

// Known free-tier models can be admitted only after explicit free-tier confirmation.
const gemini=federation.assertProviderFree('gemini_free',{...base,GEMINI_API_KEY:'x',GEMINI_FREE_TIER_CONFIRMED:'true',GEMINI_FREE_MODEL:'gemini-3.7-flash'});
assert.strictEqual(gemini.model,'gemini-3.7-flash');
assert.strictEqual(gemini.kind,'external-free');
const cf=federation.assertProviderFree('cloudflare_free',{...base,CLOUDFLARE_ACCOUNT_ID:'a',CLOUDFLARE_API_TOKEN:'x',CLOUDFLARE_WORKERS_FREE_PLAN_CONFIRMED:'true',CLOUDFLARE_FREE_MODEL:'@cf/google/gemma-4-26b-a4b-it'});
assert.strictEqual(cf.kind,'external-free');

// Personal/secrets/card-like material must not leave the Nutretium trust boundary.
assert.strictEqual(federation.sanitizePayload({question:'Escribe a juan@example.com'}).ok,false);
assert.strictEqual(federation.sanitizePayload({question:'token=supersecretvalue'}).ok,false);
assert.strictEqual(federation.sanitizePayload({question:'Analiza ventas',context:{orders:{records:10}}}).ok,true);

// Multi-model agreement is explicitly a hypothesis, never a factual validation.
const c=federation.consensus([
 {provider:'a',status:'ok',answer:{summary:'El stock de proteína muestra riesgo de rotura esta semana'}},
 {provider:'b',status:'ok',answer:{summary:'Existe riesgo de rotura de stock de proteína durante esta semana'}},
 {provider:'c',status:'ok',answer:{summary:'Conviene revisar inventario de proteína por posible rotura de stock esta semana'}}
]);
assert(c.providers.length===3);
assert(['MULTI_MODEL_CONSENSUS_HYPOTHESIS','PARTIAL_CONSENSUS'].includes(c.status));
assert(c.confidence<1,'El consenso de modelos nunca debe equivaler a certeza factual.');

console.log(JSON.stringify({ok:true,providers:none.map(x=>x.id),privacyGuard:true,paidModelsBlocked:true,consensusIsHypothesis:true},null,2));
