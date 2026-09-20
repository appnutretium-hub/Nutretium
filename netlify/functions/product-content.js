'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {requireStaff}=require('../lib/staff');
const content=require('../lib/product-content');
const enterprise=require('../lib/enterprise-store');
const audit=require('../lib/audit-log');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(body)});
async function approvedCompliance(code){const rows=await enterprise.list('product-compliance',{limit:1000});return rows.find(r=>String(r.sku||'').trim().toUpperCase()===String(code||'').trim().toUpperCase()&&r.status==='approved'&&r.evidenceComplete===true&&Array.isArray(r.evidence)&&r.evidence.length)}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod==='GET'){
  const code=content.cleanCode(event.queryStringParameters?.code);if(!code)return json(400,{error:'Falta el código del producto.'});const record=await content.read(code);
  if(event.queryStringParameters?.admin==='1'){const auth=await requireStaff(event,'marketing.read');if(!auth.ok)return json(auth.statusCode,{error:auth.error});return json(200,{content:record||{code,status:'draft'},operator:auth.email})}
  return json(200,{content:record?.status==='approved'?record:{code,status:record?'pending_approval':'missing'}});
 }
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 const action=String(body.action||'');
 if(action==='save'){
  const auth=await requireStaff(event,'marketing.manage');if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{const saved=await content.saveDraft(body.code,body.content||{},auth.email);await audit.append({event,actor:auth.email,action:'PRODUCT_CONTENT_DRAFT_UPDATED',resource:saved.code,outcome:'SUCCESS',metadata:{fields:Object.keys(body.content||{}).filter(k=>body.content[k]!==''&&body.content[k]!=null)}}).catch(()=>{});return json(200,{content:saved,message:'Ficha guardada como borrador. Requiere aprobación Food Safety / UE antes de publicarse.'})}catch(err){return json(err.statusCode||500,{error:err.message||'No se pudo guardar la ficha.'})}
 }
 if(action==='approve'){
  const auth=await requireStaff(event,'compliance.approve');if(!auth.ok)return json(auth.statusCode,{error:auth.error});const code=content.cleanCode(body.code);if(!code)return json(400,{error:'Falta el código del producto.'});
  try{const evidence=await approvedCompliance(code);if(!evidence)return json(409,{error:'NO VALIDADO: no existe una aprobación de Food Safety / UE con evidencia documental completa para este SKU.'});const approved=await content.approve(code,auth.email);await audit.append({event,actor:auth.email,action:'PRODUCT_CONTENT_APPROVED',resource:approved.code,outcome:'SUCCESS',metadata:{complianceRecordId:evidence.id||null,market:evidence.market||null,evidenceCount:evidence.evidence.length}}).catch(()=>{});return json(200,{content:approved,message:'Ficha aprobada para publicación.'})}catch(err){return json(err.statusCode||500,{error:err.message||'No se pudo aprobar la ficha.'})}
 }
 return json(400,{error:'Acción no reconocida.'});
};
exports._test={approvedCompliance};