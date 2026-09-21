'use strict';

const runtime=require('../lib/enterprise-workforce-runtime');
const governance=require('../lib/agent-governance');
const safeBridge=require('../lib/agent-safe-memory-bridge');
const audit=require('../lib/audit-log');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');

const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});
const privileged=auth=>['owner','admin'].includes(String(auth.role||''));

async function promoteFamilyRuns(result,requestedBy){
  const promotions=[];
  for(const row of result?.results||[]){
    if(!row?.id)continue;
    try{promotions.push({roleId:row.roleId,runId:row.id,...await safeBridge.promoteRunById(row.id,{requestedBy})});}
    catch(error){promotions.push({roleId:row.roleId,runId:row.id,promoted:false,status:'checkpoint_error',error:String(error.message||error).slice(0,300)});}
  }
  return promotions;
}

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  const permission=event.httpMethod==='GET'?'platform.read':'platform.write';
  const auth=await requireStaff(event,permission);if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{
    if(event.httpMethod==='GET')return json(200,{status:runtime.status(),families:governance.workforce.families()});
    if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
    let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
    const mode=String(body.mode||'role').toLowerCase();
    if(mode==='role'){
      const id=String(body.roleId||'');
      const plan=runtime.rolePlan(id);if(!plan.ok)return json(400,{error:plan.error});
      const action=String(body.action||plan.defaultAction||'');
      const policy=governance.policy(runtime.workforceAgent(id),action);
      if(!policy.allowed)return json(400,{error:policy.error});
      if(policy.requiresApproval)return json(409,{error:'La acción requiere aprobación humana.',code:'HUMAN_APPROVAL_REQUIRED',policy,plan});
      const record=await runtime.persistRoleRun({id,action,requestedBy:auth.email});
      let checkpoint;
      try{checkpoint=await safeBridge.promoteValidatedRun(record,{requestedBy:auth.email});}
      catch(error){checkpoint={promoted:false,status:'checkpoint_error',error:String(error.message||error).slice(0,300)};}
      await audit.append({event,actor:auth.email,action:'WORKFORCE_ROLE_RUN_COMPLETED',resource:record.id,outcome:'SUCCESS',metadata:{roleId:id,agentAction:action,checkpoint}}).catch(()=>{});
      return json(200,{record,checkpoint});
    }
    if(mode==='family'){
      if(!privileged(auth))return json(403,{error:'La ejecución departamental exige propietario o administrador.'});
      const result=await runtime.runFamily({family:body.family,requestedBy:auth.email});
      const checkpoints=await promoteFamilyRuns(result,auth.email);
      await audit.append({event,actor:auth.email,action:'WORKFORCE_FAMILY_RUN_COMPLETED',resource:String(body.family||''),outcome:'SUCCESS',metadata:{roles:result.roles,executed:result.executed,failed:result.failed,promotedCheckpoints:checkpoints.filter(x=>x.promoted).length}}).catch(()=>{});
      return json(200,{family:result,checkpoints});
    }
    return json(400,{error:'Modo no reconocido.'});
  }catch(error){console.error('[workforce-run]',error);return json(error.statusCode||500,{error:error.message||'No se pudo ejecutar la plantilla IA.',runId:error.runId||null})}
};
