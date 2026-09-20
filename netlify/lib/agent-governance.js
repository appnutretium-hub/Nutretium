'use strict';
const AGENTS=Object.freeze({
 marketing:{scopes:['marketing.read','marketing.propose'],sensitive:['publish','discount','customer-message']},
 purchasing:{scopes:['purchasing.read','purchasing.propose'],sensitive:['supplier-create','purchase-order-approve','purchase-order-send']},
 inventory:{scopes:['inventory.read','inventory.propose'],sensitive:['stock-adjust','lot-recall','lot-release']},
 finance:{scopes:['finance.read','finance.propose'],sensitive:['refund','price-change','invoice-void']},
 compliance:{scopes:['compliance.read','compliance.propose'],sensitive:['product-approve','product-block','lot-release']},
 operations:{scopes:['platform.read','operations.propose'],sensitive:['maintenance-mode','integration-enable','automation-enable']},
});
const safe=v=>String(v||'').trim().toLowerCase();
function policy(agent,action){const name=safe(agent),a=safe(action),def=AGENTS[name];if(!def)return{allowed:false,error:'Agente no reconocido.'};const sensitive=def.sensitive.includes(a);return{allowed:true,agent:name,action:a,scopes:def.scopes,sensitive,requiresApproval:sensitive||true}}
function canApprove(proposal,auth){if(!proposal||!auth)return false;if(String(proposal.proposedBy||'').toLowerCase()===String(auth.email||'').toLowerCase())return false;return['owner','admin'].includes(String(auth.role||''))}
module.exports={AGENTS,policy,canApprove};
