'use strict';

/*
 * Nutretium Zero-Cost Policy
 * --------------------------
 * Fail-closed guardrail for the AI/workforce control plane. The platform may
 * consume included free-tier capacity, but it must never authorize paid AI
 * inference, automatic top-ups, billable external providers or unbounded jobs.
 */

const POLICY=Object.freeze({
  mode:'ZERO_COST',
  externalSpendLimitEur:0,
  paidAiProvidersAllowed:false,
  automaticTopupsAllowed:false,
  deterministicFirst:true,
  scheduledFunctionHardLimitMs:30000,
  scheduledFunctionBudgetMs:24000,
  maxRolesPerScheduledCycle:12,
  maxManualFamilyRoles:30,
  onCapacityLimit:'STOP_AND_REQUIRE_HUMAN',
  onPaidCapability:'BLOCK',
});

const lc=v=>String(v??'').trim().toLowerCase();
const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;

function assertZeroSpend(env=process.env){
  const spend=num(env.AI_EXTERNAL_SPEND_LIMIT_EUR,0);
  if(spend!==0)throw new Error('ZERO_COST_POLICY: AI_EXTERNAL_SPEND_LIMIT_EUR debe ser 0.');
  const paid=lc(env.AI_PAID_PROVIDER_ENABLED);
  if(['1','true','yes','on'].includes(paid))throw new Error('ZERO_COST_POLICY: proveedores IA de pago están bloqueados.');
  const recharge=lc(env.AUTO_RECHARGE_ENABLED||env.NETLIFY_AUTO_RECHARGE_ENABLED);
  if(['1','true','yes','on'].includes(recharge))throw new Error('ZERO_COST_POLICY: recarga automática está prohibida.');
  return true;
}

function provider(env=process.env){
  assertZeroSpend(env);
  const mode=lc(env.AI_PROVIDER||'deterministic');
  if(mode==='deterministic')return{mode,externalSpendLimitEur:0,selfHosted:false};
  if(mode==='ollama_gateway'){
    const allow=['1','true','yes','on'].includes(lc(env.AI_ZERO_COST_SELF_HOSTED_ALLOWED));
    if(!allow)throw new Error('ZERO_COST_POLICY: Ollama sólo puede activarse con consentimiento explícito como infraestructura propia/autohospedada.');
    return{mode,externalSpendLimitEur:0,selfHosted:true};
  }
  throw new Error(`ZERO_COST_POLICY: proveedor ${mode||'(vacío)'} bloqueado.`);
}

function scheduledLimits(env=process.env){
  assertZeroSpend(env);
  const requestedMs=num(env.WORKFORCE_CYCLE_BUDGET_MS,POLICY.scheduledFunctionBudgetMs);
  const budgetMs=Math.max(1000,Math.min(requestedMs,POLICY.scheduledFunctionBudgetMs));
  const requestedRoles=num(env.WORKFORCE_MAX_ROLES_PER_CYCLE,POLICY.maxRolesPerScheduledCycle);
  const maxRoles=Math.max(1,Math.min(Math.floor(requestedRoles),POLICY.maxRolesPerScheduledCycle));
  return{budgetMs,maxRoles,hardLimitMs:POLICY.scheduledFunctionHardLimitMs};
}

function manualLimits(env=process.env){
  assertZeroSpend(env);
  const requested=num(env.WORKFORCE_MAX_MANUAL_FAMILY_ROLES,POLICY.maxManualFamilyRoles);
  return{maxRoles:Math.max(1,Math.min(Math.floor(requested),POLICY.maxManualFamilyRoles))};
}

function budget(startedAt=Date.now(),env=process.env){
  const limits=scheduledLimits(env);
  const started=Number(startedAt)||Date.now();
  const elapsed=()=>Math.max(0,Date.now()-started);
  return{
    ...limits,
    startedAt:started,
    elapsedMs:elapsed,
    remainingMs:()=>Math.max(0,limits.budgetMs-elapsed()),
    canContinue:()=>elapsed()<limits.budgetMs,
  };
}

function status(env=process.env){
  let valid=true,error=null,providerStatus=null;
  try{providerStatus=provider(env)}catch(e){valid=false;error=String(e.message||e)}
  return{...POLICY,valid,error,provider:providerStatus||{mode:'BLOCKED',externalSpendLimitEur:0},scheduled:scheduledLimits({...env,AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PAID_PROVIDER_ENABLED:'false',AUTO_RECHARGE_ENABLED:'false'}),manual:manualLimits({...env,AI_EXTERNAL_SPEND_LIMIT_EUR:'0',AI_PAID_PROVIDER_ENABLED:'false',AUTO_RECHARGE_ENABLED:'false'})};
}

module.exports={POLICY,assertZeroSpend,provider,scheduledLimits,manualLimits,budget,status};
