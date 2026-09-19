'use strict';

const { cabecerasCORS } = require('../lib/cors');
const { requireStaff, hasPermission, staffConfig } = require('../lib/staff');
const schema = require('../lib/enterprise-schema');
const store = require('../lib/enterprise-store');
const actions = require('../lib/enterprise-actions');
const CORS = cabecerasCORS('POST, OPTIONS');
const response=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});

function permissionFor(domain, action){
  const def=schema.definition(domain); if(!def) return null;
  if(action==='list'||action==='get') return def.permission.replace('.manage','.read');
  return def.permission;
}
function authFor(event, domain, action){
  let permission=permissionFor(domain,action)||'platform.read';
  let auth=requireStaff(event,permission);
  if(!auth.ok && permission.endsWith('.read')) auth=requireStaff(event,schema.definition(domain)?.permission||'platform.read');
  return auth;
}
async function summary(){
  const result={};
  for(const domain of schema.domains()){
    try{const rows=await store.list(domain,{limit:1000});result[domain]={count:rows.length,attention:rows.filter(r=>['pending','requested','open','failed','exception','under_review','past_due','unmatched'].includes(r.status)).length};}
    catch{result[domain]={count:null,attention:null};}
  }
  return result;
}
exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='POST') return response(405,{error:'Method Not Allowed'});
  let body; try{body=JSON.parse(event.body||'{}');}catch{return response(400,{error:'JSON no válido.'});}
  const action=String(body.action||'').trim();
  if(action==='definitions'||action==='summary'||action==='audit'||action==='snapshot'){
    const auth=requireStaff(event,action==='snapshot'?'platform.write':'platform.read'); if(!auth.ok) return response(auth.statusCode,{error:auth.error});
    try{
      if(action==='definitions') return response(200,{domains:Object.fromEntries(schema.domains().map(d=>[d,schema.definition(d)])),permissions:auth.role,staff:staffConfig()});
      if(action==='summary') return response(200,{summary:await summary(),role:auth.role});
      if(action==='audit') return response(200,{events:await store.auditList({domain:body.domain,recordId:body.id,limit:body.limit})});
      if(!['owner','admin'].includes(auth.role)) return response(403,{error:'Solo propietario o administrador pueden exportar una copia completa.'});
      return response(200,{snapshot:await store.snapshot()});
    }catch(err){return response(err.code==='STORE_UNAVAILABLE'?503:500,{error:err.message});}
  }
  const domain=String(body.domain||'').trim(), def=schema.definition(domain);
  if(!def) return response(400,{error:'Dominio no reconocido.'});
  const auth=authFor(event,domain,action); if(!auth.ok) return response(auth.statusCode,{error:auth.error});
  try{
    if(action==='list') return response(200,{records:await store.list(domain,{includeArchived:Boolean(body.includeArchived),limit:body.limit})});
    if(action==='get'){const record=await store.get(domain,body.id);return record?response(200,{record}):response(404,{error:'Registro no encontrado.'});}
    if(action==='create'||action==='update'){
      if(domain==='product-compliance'&&body.record?.status==='approved'&&auth.role!=='compliance') return response(403,{error:'La aprobación de Food Safety & EU Market Access solo puede hacerla una cuenta configurada en COMPLIANCE_EMAILS.'});
      const checked=schema.validate(domain,body.record,{partial:action==='update'}); if(!checked.ok) return response(400,{error:checked.errors[0],errors:checked.errors});
      let payload=checked.data;
      if(action==='update'){
        const previous=await store.get(domain,body.id||payload.id); if(!previous) return response(404,{error:'Registro no encontrado.'});
        const merged=schema.validate(domain,{...previous,...payload}); if(!merged.ok) return response(400,{error:merged.errors[0],errors:merged.errors}); payload=merged.data;
      }
      const record=await store.save(domain,payload,auth,{id:body.id||payload.id,reason:body.reason,create:action==='create'}); return response(action==='create'?201:200,{record});
    }
    if(action==='archive'){const record=await store.archive(domain,body.id,auth,body.reason);return record?response(200,{record}):response(404,{error:'Registro no encontrado.'});}
    if(action==='transition'){
      const previous=await store.get(domain,body.id); if(!previous) return response(404,{error:'Registro no encontrado.'});
      if(domain==='product-compliance'&&body.status==='approved'&&auth.role!=='compliance') return response(403,{error:'Solo Food Safety & EU Market Access puede aprobar este expediente.'});
      if(domain==='product-compliance'&&body.status==='blocked'&&!hasPermission(auth.role,'compliance.block')&&!['owner','admin'].includes(auth.role)) return response(403,{error:'No tienes permiso para bloquear este producto.'});
      const changed=actions.transition(domain,previous,body.status); if(!changed.ok) return response(409,{error:changed.error});
      const checked=schema.validate(domain,changed.record); if(!checked.ok) return response(400,{error:checked.errors[0],errors:checked.errors});
      return response(200,{record:await store.save(domain,checked.data,auth,{id:body.id,reason:body.reason})});
    }
    if(['inventory-adjust','inventory-reserve','inventory-release'].includes(action)){
      if(domain!=='inventory') return response(400,{error:'La operación solo se admite en inventario.'});
      const previous=await store.get(domain,body.id); if(!previous) return response(404,{error:'Registro no encontrado.'});
      const changed=action==='inventory-adjust'?actions.adjustInventory(previous,body):action==='inventory-reserve'?actions.reserveInventory(previous,body.qty):actions.releaseInventory(previous,body.qty);
      if(!changed.ok) return response(409,{error:changed.error});
      return response(200,{record:await store.save(domain,changed.record,auth,{id:body.id,reason:body.reason||action})});
    }
    if(action==='loyalty-adjust'){
      if(domain!=='loyalty') return response(400,{error:'La operación solo se admite en fidelización.'});
      const previous=await store.get(domain,body.id); if(!previous) return response(404,{error:'Registro no encontrado.'});
      const changed=actions.loyaltyAdjust(previous,body.points,body.reason); if(!changed.ok) return response(409,{error:changed.error});
      return response(200,{record:await store.save(domain,changed.record,auth,{id:body.id,reason:body.reason})});
    }
    return response(400,{error:'Acción no reconocida.'});
  }catch(err){const code=err.code==='STORE_UNAVAILABLE'?503:err.code==='CONFLICT'?409:500;return response(code,{error:err.message});}
};
