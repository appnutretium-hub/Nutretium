'use strict';

process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
const assert=require('assert');
const safeMemory=require('../netlify/lib/agent-safe-memory');
const bridge=require('../netlify/lib/agent-safe-memory-bridge');
const backup=require('../netlify/lib/agent-checkpoint-backup');

(async()=>{
  const agent='workforce__bi_analyst';
  const genesis=await safeMemory.bootstrap(agent);
  assert.strictEqual(genesis.checkpointVersion,1,'Debe crear checkpoint inicial.');
  assert.strictEqual(genesis.verification.status,'VALIDADO');
  assert.strictEqual((await safeMemory.integrity(agent)).ok,true,'El checkpoint inicial debe ser íntegro.');

  const shadowA=await safeMemory.createShadow({agent,task:'memory-test-a',requestedBy:'test'});
  const nextState=safeMemory.addPrivateItem(shadowA.state,'learnings',{content:'Aprendizaje de prueba'});
  await safeMemory.stageShadow(shadowA.id,{state:nextState,changes:['privateMemory.learnings'],evidence:['test:evidence']});
  const failed=await safeMemory.verifyShadow(shadowA.id,{checks:[
    {name:'integrity',status:'PASS'},{name:'policy',status:'PASS'},{name:'source_validation',status:'FAIL'},{name:'regression',status:'PASS'}
  ]});
  assert.strictEqual(failed.status,'verification_failed','Debe rechazar verificación incompleta.');

  const shadowB=await safeMemory.createShadow({agent,task:'memory-test-b',requestedBy:'test'});
  const operational=safeMemory.addPrivateItem(shadowB.state,'operational',{action:'kpi-brief',status:'COMPLETED',validation:'VALIDADO'});
  await safeMemory.stageShadow(shadowB.id,{state:operational,changes:['privateMemory.operational'],evidence:['source:analytics']});
  const verified=await safeMemory.verifyShadow(shadowB.id,{checks:safeMemory.REQUIRED_CHECKS.map(name=>({name,status:'PASS',evidence:['test']}))});
  assert.strictEqual(verified.status,'verified','Shadow válido debe quedar verificado.');
  const promoted=await safeMemory.promoteShadow(shadowB.id,{requestedBy:'test'});
  assert.strictEqual(promoted.checkpointVersion,2,'La promoción debe crear nueva generación.');
  assert.strictEqual(promoted.previousCheckpointId,genesis.id,'Debe encadenar checkpoint anterior.');
  assert.strictEqual((await safeMemory.integrity(agent,{depth:5})).ok,true,'La cadena promovida debe ser íntegra.');

  const stale=await safeMemory.createShadow({agent,task:'stale',requestedBy:'test'});
  const fresh=await safeMemory.createShadow({agent,task:'fresh',requestedBy:'test'});
  await safeMemory.stageShadow(fresh.id,{state:safeMemory.addPrivateItem(fresh.state,'decisions',{decision:'fresh'})});
  await safeMemory.verifyShadow(fresh.id,{checks:safeMemory.REQUIRED_CHECKS.map(name=>({name,status:'PASS'}))});
  const freshPromotion=await safeMemory.promoteShadow(fresh.id,{requestedBy:'test'});
  assert.strictEqual(freshPromotion.checkpointVersion,3);
  await safeMemory.stageShadow(stale.id,{state:safeMemory.addPrivateItem(stale.state,'decisions',{decision:'stale'})});
  await safeMemory.verifyShadow(stale.id,{checks:safeMemory.REQUIRED_CHECKS.map(name=>({name,status:'PASS'}))});
  await assert.rejects(()=>safeMemory.promoteShadow(stale.id,{requestedBy:'test'}),/STALE_SHADOW/,'Una copia obsoleta no puede sobrescribir el head actual.');

  assert.throws(()=>safeMemory.validateState({apiKey:'secret'}),/AGENT_MEMORY_SECRET_BLOCKED/,'Debe bloquear secretos por clave sensible.');

  const rollback=await safeMemory.rollback(agent,genesis.id,{actor:{email:'owner@nutretium.local',role:'owner'}});
  assert.strictEqual(rollback.rollbackToCheckpointId,genesis.id,'Rollback debe restaurar desde checkpoint histórico.');
  assert.strictEqual(rollback.checkpointVersion,4,'Rollback crea nueva generación, no destruye historial.');
  assert.strictEqual((await safeMemory.integrity(agent,{depth:5})).ok,true,'Rollback debe mantener cadena íntegra.');

  const eligible={id:'run-valid-1',agent,action:'kpi-brief',status:'completed',output:{result:{status:'COMPLETED',validation:'VALIDADO',requiresHumanDecision:false,sourceGate:{required:['analytics']},facts:[]}}};
  const bridgeResult=await bridge.promoteValidatedRun(eligible,{requestedBy:'test'});
  assert.strictEqual(bridgeResult.promoted,true,'Una ejecución validada debe actualizar memoria segura.');
  assert.strictEqual(bridgeResult.postPromotionIntegrity?.ok,true,'Debe verificar integridad tras promover.');
  assert.strictEqual(bridgeResult.backupIntegrity?.ok,true,'Debe verificar la copia de seguridad independiente.');
  const latestBackup=await backup.readBackup({agent});
  assert(latestBackup&&latestBackup.id===bridgeResult.checkpointId,'El backup debe apuntar al checkpoint promovido más reciente.');

  const notEligible={id:'run-invalid-1',agent,action:'kpi-brief',status:'completed',output:{result:{status:'NO_VALIDADO',validation:'NO_VALIDADO',requiresHumanDecision:false}}};
  const skip=await bridge.promoteValidatedRun(notEligible,{requestedBy:'test'});
  assert.strictEqual(skip.promoted,false,'NO_VALIDADO no puede promover memoria estable.');

  console.log(JSON.stringify({ok:true,agent,genesis:genesis.id,promoted:promoted.id,rollback:rollback.id,bridge:bridgeResult,backup:latestBackup.id},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
