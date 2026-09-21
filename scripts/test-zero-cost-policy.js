'use strict';

const assert=require('assert');
const zero=require('../netlify/lib/zero-cost-policy');

assert.strictEqual(zero.POLICY.externalSpendLimitEur,0);
assert.strictEqual(zero.POLICY.paidAiProvidersAllowed,false);
assert.strictEqual(zero.POLICY.automaticTopupsAllowed,false);
assert.strictEqual(zero.assertZeroSpend({AI_EXTERNAL_SPEND_LIMIT_EUR:'0'}),true);
assert.strictEqual(zero.provider({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PROVIDER:'deterministic'}).mode,'deterministic');

assert.throws(()=>zero.assertZeroSpend({AI_EXTERNAL_SPEND_LIMIT_EUR:'1'}),/debe ser 0/);
assert.throws(()=>zero.assertZeroSpend({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PAID_PROVIDER_ENABLED:'true'}),/proveedores IA de pago/);
assert.throws(()=>zero.assertZeroSpend({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AUTO_RECHARGE_ENABLED:'true'}),/recarga automática/);
assert.throws(()=>zero.provider({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PROVIDER:'openai'}),/proveedor openai bloqueado/);
assert.throws(()=>zero.provider({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PROVIDER:'ollama_gateway'}),/Ollama sólo puede activarse/);

const self=zero.provider({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PROVIDER:'ollama_gateway',AI_ZERO_COST_SELF_HOSTED_ALLOWED:'true'});
assert.strictEqual(self.selfHosted,true);

const limits=zero.scheduledLimits({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',WORKFORCE_CYCLE_BUDGET_MS:'999999',WORKFORCE_MAX_ROLES_PER_CYCLE:'999'});
assert.strictEqual(limits.budgetMs,24000);
assert.strictEqual(limits.maxRoles,12);
assert.strictEqual(limits.hardLimitMs,30000);

const manual=zero.manualLimits({AI_EXTERNAL_SPEND_LIMIT_EUR:'0',WORKFORCE_MAX_MANUAL_FAMILY_ROLES:'999'});
assert.strictEqual(manual.maxRoles,30);

console.log(JSON.stringify({ok:true,mode:zero.POLICY.mode,externalSpendLimitEur:0,scheduled:limits,manual},null,2));
