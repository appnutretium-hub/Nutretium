'use strict';

const safeMemory=require('./agent-safe-memory');
const backup=require('./agent-checkpoint-backup');
const security=require('./agent-memory-security');
const enterprise=require('./enterprise-store');

const SYSTEM={email:'agent-safe-memory-bridge@nutretium.local',role:'system'};
const signingEnv=()=>({...process.env,AGENT_MEMORY_HMAC_KEY:process.env.AGENT_MEMORY_HMAC_KEY||process.env.JWT_SECRET||''});

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
  await security.assertNotQuarantined(record.agent);
  const summary=runSummary(record),peerReview=await security.reviewRun(record);
  const eligible=summary.status==='COMPLETED'&&summary.validation==='VALIDADO'&&!summary.requiresHumanDecision&&peerReview.status==='VALIDADO';
  if(!eligible){
    await enterprise.audit(SYSTEM,'agent-memory-skip','ai-runs',record.id,{agent:record.agent,status:summary.status,validation:summary.validation,requiresHumanDecision:summary.requiresHumanDecision,peerReview:peerReview.status}).catch(()=>{});
    return{promoted:false,status:'not_eligible',reason:'RUN_NOT_FULLY_VALIDATED',peerReview};
  }
  const promotion=await safeMemory.recordVerifiedRun({agent:record.agent,run:summary,requestedBy});
  let postPromotionIntegrity=null,backupMirror=null,backupIntegrity=null,signature=null;
  if(promotion.promoted){
    const cp=await safeMemory.checkpoint(promotion.checkpointId);
    postPromotionIntegrity=await safeMemory.integrity(record.agent,{depth:5});
    if(!postPromotionIntegrity.ok){
      await security.quarantine(record.agent,'post-promotion-integrity-failed',{evidence:postPromotionIntegrity.errors,source:'promotion-bridge'});
      await enterprise.audit(SYSTEM,'agent-memory-integrity-failed','ai-runs',record.id,{agent:record.agent,promotion,errors:postPromotionIntegrity.errors}).catch(()=>{});
      return{...promotion,status:'integrity_failed',peerReview,postPromotionIntegrity};
    }
    try{
      signature=await security.signCheckpoint(cp,signingEnv());
      backupMirror=await backup.mirrorChain(record.agent,{depth:5});
      backupIntegrity=await backup.verifyBackup(record.agent);
      if(!backupIntegrity.ok)throw new Error('AGENT_BACKUP_VERIFY_FAILED');
      const signatureCheck=await security.verifySignature(cp,signingEnv());
      if(signatureCheck.ok===false)throw new Error('AGENT_SIGNATURE_VERIFY_FAILED');
      signature={...signature,verification:signatureCheck};
    }catch(error){
      await security.quarantine(record.agent,'post-promotion-recovery-protection-failed',{evidence:[String(error.message||error)],source:'promotion-bridge'}).catch(()=>{});
      await enterprise.audit(SYSTEM,'agent-memory-backup-failed','ai-runs',record.id,{agent:record.agent,promotion,error:String(error.message||error)}).catch(()=>{});
      return{...promotion,status:'recovery_protection_failed',peerReview,postPromotionIntegrity,backupMirror,backupIntegrity,signature,error:String(error.message||error).slice(0,300)};
    }
  }
  const result={...promotion,status:promotion.promoted?'promoted':promotion.status,peerReview,postPromotionIntegrity,backupMirror,backupIntegrity,signature};
  await enterprise.audit(SYSTEM,promotion.promoted?'agent-memory-promote':'agent-memory-reject','ai-runs',record.id,{agent:record.agent,...result}).catch(()=>{});
  return result;
}

async function promoteRunById(runId,{requestedBy='system'}={}){
  const record=await enterprise.get('ai-runs',String(runId||''));if(!record)throw new Error('Ejecución IA no encontrada.');
  return promoteValidatedRun(record,{requestedBy});
}

module.exports={SYSTEM,signingEnv,runSummary,promoteValidatedRun,promoteRunById};
