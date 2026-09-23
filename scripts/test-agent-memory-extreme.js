'use strict';
require('./test-env');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
process.env.JWT_SECRET='nutretium-test-jwt-secret-32-bytes-minimum-2026';
const assert=require('assert');
const safeMemory=require('../netlify/lib/agent-safe-memory');
const backup=require('../netlify/lib/agent-checkpoint-backup');
const security=require('../netlify/lib/agent-memory-security');
const lifecycle=require('../netlify/lib/agent-memory-lifecycle');

(async()=>{
  const agent='workforce__bi_analyst';
  const genesis=await safeMemory.bootstrap(agent);
  await backup.mirrorChain(agent,{depth:5});
  const signed=await security.signCheckpoint(genesis,lifecycle.signingEnv());
  assert.strictEqual(signed.ok,true,'Checkpoint debe firmarse con HMAC.');
  const signature=await security.verifySignature(genesis,lifecycle.signingEnv());
  assert.strictEqual(signature.ok,true,'Firma HMAC debe verificarse.');
  const wrong=await security.verifySignature(genesis,{...process.env,AGENT_MEMORY_HMAC_KEY:'wrong-secret-that-is-definitely-long-enough-2026'});
  assert.strictEqual(wrong.ok,false,'Una clave diferente no puede validar la firma.');

  const run={id:'peer-run-1',agent,action:'kpi-brief',status:'completed',output:{provider:{externalSpendLimitEur:0},result:{status:'COMPLETED',validation:'VALIDADO',requiresHumanDecision:false,sourceGate:{required:['analytics'],missing:[]},decision:{decision:'ANALYSIS'}}}};
  const review=await security.reviewRun(run);
  assert.strictEqual(review.status,'VALIDADO','La revisión cruzada debe aprobar una ejecución íntegra.');
  assert.ok(review.reviewers.includes('data_quality')&&review.reviewers.includes('audit'),'Data Quality y Audit deben revisar.');
  assert.ok(review.reviewers.includes('security'),'Datos/IA debe incluir revisión de Security.');

  const badRun={...run,id:'peer-run-2',output:{...run.output,result:{...run.output.result,validation:'NO_VALIDADO',sourceGate:{required:['analytics'],missing:['analytics']}}}};
  const rejected=await security.reviewRun(badRun);
  assert.strictEqual(rejected.status,'NO_VALIDADO','Una ejecución con fuente ausente debe rechazarse.');

  await security.quarantine(agent,'test-quarantine',{evidence:['unit-test']});
  await assert.rejects(()=>security.assertNotQuarantined(agent),/AGENT_QUARANTINED/,'Un agente en cuarentena debe quedar bloqueado.');
  await assert.rejects(()=>security.releaseQuarantine(agent,{actor:{role:'viewer',email:'viewer@local'}}),/OWNER_OR_ADMIN/,'Sólo owner/admin libera cuarentena.');
  const released=await security.releaseQuarantine(agent,{actor:{role:'owner',email:'owner@local'},reason:'verified-test'});
  assert.strictEqual(released.quarantined,false,'Owner debe poder liberar tras verificar.');
  await security.assertNotQuarantined(agent);

  const recent={confidence:'high',validation:'VALIDADO',at:new Date().toISOString()};
  const old={confidence:'high',validation:'VALIDADO',at:new Date(Date.now()-365*86400000).toISOString()};
  assert.ok(lifecycle.confidenceWeight(recent)>lifecycle.confidenceWeight(old),'La información antigua debe perder peso.');

  let state=safeMemory.emptyState(agent);
  state.privateMemory.operational=[];
  for(let i=0;i<30;i++)state.privateMemory.operational.push({action:`action-${i%12}`,summary:`result-${i%7}`,confidence:i%2?'medium':'high',at:new Date(Date.now()-i*86400000).toISOString()});
  const compacted=lifecycle.compactState(state,{keepPerBucket:16});
  assert.ok(compacted.privateMemory.operational.length<=16,'Compactación debe limitar memoria activa.');
  assert.ok(compacted.compaction.archivedCount>0,'Compactación debe conservar manifiesto de elementos retirados.');

  const drill=await lifecycle.recoveryDrill(agent);
  assert.strictEqual(drill.ok,true,'El simulacro debe poder reconstruir/verificar desde backup.');
  assert.strictEqual(drill.signature.status,'VALID','El simulacro debe verificar autenticidad.');
  assert.strictEqual(drill.backup.ok,true,'El backup debe ser íntegro.');

  console.log(JSON.stringify({ok:true,agent,signature:signature.status,peerReview:review.status,recovery:drill.status,compacted:compacted.privateMemory.operational.length},null,2));
})().catch(error=>{console.error(error);process.exit(1);});
