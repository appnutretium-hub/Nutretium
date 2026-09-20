'use strict';

const safeMemory=require('./agent-safe-memory');
const enterprise=require('./enterprise-store');

const SYSTEM={email:'agent-safe-memory-bridge@nutretium.local',role:'system'};

function runSummary(record){
  const result=record?.output?.result||{};
  return{
    action:record?.action||result.action||null,
    status:result.status||String(record?.status||'').toUpperCase(),
    validation:result.validation||'NO_VALIDADO',
    requiresHumanDecision:Boolean(result.requiresHumanDecision),
    runId:record?.id||null,
    summary:result.facts?.[0]?.data?.summary||result.facts?.[0]?.value?.summary||null,
    evidence:Array.isArray(result?.sourceGate?.required)?result.sourceGate.required.map(x=>`source:${x}`):[],
  };
}

async function promoteValidatedRun(record,{requestedBy='system'}={}){
  if(!record?.agent)throw new Error('Registro de ejecución sin agente.');
  const summary=runSummary(record);
  const eligible=summary.status==='COMPLETED'&&summary.validation==='VALIDADO'&&!summary.requiresHumanDecision;
  if(!eligible){
    await enterprise.audit(SYSTEM,'agent-memory-skip','ai-runs',record.id,{agent:record.agent,status:summary.status,validation:summary.validation,requiresHumanDecision:summary.requiresHumanDecision}).catch(()=>{});
    return{promoted:false,status:'not_eligible',reason:'RUN_NOT_FULLY_VALIDATED'};
  }
  const promotion=await safeMemory.recordVerifiedRun({agent:record.agent,run:summary,requestedBy});
  await enterprise.audit(SYSTEM,promotion.promoted?'agent-memory-promote':'agent-memory-reject','ai-runs',record.id,{agent:record.agent,...promotion}).catch(()=>{});
  return promotion;
}

async function promoteRunById(runId,{requestedBy='system'}={}){
  const record=await enterprise.get('ai-runs',String(runId||''));if(!record)throw new Error('Ejecución IA no encontrada.');
  return promoteValidatedRun(record,{requestedBy});
}

module.exports={SYSTEM,runSummary,promoteValidatedRun,promoteRunById};
