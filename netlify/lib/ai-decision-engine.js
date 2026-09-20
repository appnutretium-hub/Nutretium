'use strict';
const governance=require('./agent-governance');
const truth=require('./ai-truth-layer');

const RISK={low:1,medium:2,high:3,critical:4};
const CRITICAL_ACTIONS=new Set([
 'refund','payment-config-change','secret-rotate','policy-change','code-merge','production-deploy','workflow-change',
 'purchase-order-approve','purchase-order-send','product-approve','product-block','claim-approve','lot-release','lot-recall',
 'staff-change','permission-change','employment-decision','capital-allocation','market-entry-approve','contract-commit','legal-approval',
 'risk-acceptance','supplier-create','supplier-block','integration-enable','integration-disable','automation-enable'
]);

function assess({agent,action,snapshot,requiredSources=[],estimatedImpactEur=0}){
 const p=governance.policy(agent,action);if(!p.allowed)return{allowed:false,decision:'BLOCKED',reason:p.error};
 const sourceGate=truth.sourceGate(snapshot||{sources:{}},requiredSources);
 const impact=Math.abs(Number(estimatedImpactEur)||0);
 let risk=p.sensitive?3:1;
 if(CRITICAL_ACTIONS.has(p.action))risk=4;
 else if(impact>=1000)risk=Math.max(risk,3);
 else if(impact>=250)risk=Math.max(risk,2);
 if(!sourceGate.ok)risk=Math.max(risk,3);
 const vetoes=[];
 if(!sourceGate.ok)vetoes.push({agent:'data_quality',reason:`Fuentes no validadas: ${sourceGate.missing.join(', ')}`});
 if(['product-approve','claim-approve','lot-release','product-publish'].includes(p.action))vetoes.push({agent:'compliance',reason:'Food Safety/Compliance debe validar evidencia antes de ejecutar.'});
 if(['purchase-order-send','purchase-order-approve','capital-allocation','refund','price-change','discount'].includes(p.action))vetoes.push({agent:'finance',reason:'Finanzas debe validar impacto económico.'});
 if(['production-deploy','workflow-change','integration-enable','integration-disable','secret-rotate','policy-change'].includes(p.action))vetoes.push({agent:'security',reason:'Seguridad debe validar la operación.'});
 const autonomous=p.autonomous&&risk===1&&vetoes.length===0;
 return{allowed:true,policy:p,risk:Object.keys(RISK).find(k=>RISK[k]===risk)||'critical',riskScore:risk,sourceGate,vetoes,decision:autonomous?'AUTO':'HUMAN_APPROVAL_REQUIRED',requiresApproval:!autonomous};
}
function canExecute(assessment,approvals=[]){
 if(!assessment?.allowed)return false;
 if(assessment.decision==='AUTO')return true;
 const approved=new Set((approvals||[]).filter(x=>x?.status==='approved').map(x=>String(x.agent||'').toLowerCase()));
 return assessment.vetoes.every(v=>approved.has(v.agent))&&approved.has('owner');
}
module.exports={assess,canExecute,CRITICAL_ACTIONS,RISK};
