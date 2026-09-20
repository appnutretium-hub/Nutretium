'use strict';

const safeMemory=require('./agent-safe-memory');
const backup=require('./agent-checkpoint-backup');
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
  let postPromotionIntegrity=null,backupMirror=null,backupIntegrity=null;
  if(promotion.promoted){
    postPromotionIntegrity=await safeMemory.integrity(record.agent,{depth:5});
    if(!postPromotionIntegrity.ok){
      await enterprise.audit(SYSTEM,'agent-memory-integrity-failed','ai-runs',record.id,{agent:record.agent,promotion,errors:postPromotionIntegrity.errors}).catch(()=>{});
      return{...promotion,status:'integrity_failed',postPromotionIntegrity};
    }
    try{
      backupMirror=await backup.mirrorChain(record.agent,{depth:5});
      backupIntegrity=await backup.verifyBackup(record.agent);
      if(!backupIntegrity.ok)throw new Error('AGENT_BACKUP_VERIFY_FAILED');
    }catch(error){
      await enterprise.audit(SYSTEM,'agent-memory-backup-failed','ai-runs',record.id,{agent:record.agent,promotion,error:String(error.message||error)}).catch(()=>{});
      return{...promotion,status:'backup_failed',postPromotionIntegrity,backupMirror,backupIntegrity,error:String(error.message||error).slice(0,300)};
    }
  }
  const result={...promotion,status:promotion.promoted?'promoted':promotion.status,postPromotionIntegrity,backupMirror,backupIntegrity};
  await enterprise.audit(SYSTEM,promotion.promoted?'agent-memory-promote':'agent-memory-reject','ai-runs',record.id,{agent:record.agent,...result}).catch(()=>{});
  return result;
}

async function promoteRunById(runId,{requestedBy='system'}={}){
  const record=await enterprise.get('ai-runs',String(runId||''));if(!record)throw new Error('Ejecución IA no encontrada.');
  return promoteValidatedRun(record,{requestedBy});
}

module.exports={SYSTEM,runSummary,promoteValidatedRun,promoteRunById};
