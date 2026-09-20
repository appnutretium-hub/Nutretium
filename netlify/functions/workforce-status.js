'use strict';

const governance=require('../lib/agent-governance');
const runtime=require('../lib/enterprise-workforce-runtime');
const {requireStaff}=require('../lib/staff');
const {cabecerasCORS}=require('../lib/cors');
const security=require('../lib/security-policy');

const CORS=cabecerasCORS('GET, OPTIONS');
const json=(statusCode,body)=>({statusCode,headers:{...CORS,...security.securityHeaders(),'Cache-Control':'no-store'},body:JSON.stringify(body)});

exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='GET')return json(405,{error:'Method Not Allowed'});
  const auth=await requireStaff(event,'platform.read');
  if(!auth.ok)return json(auth.statusCode,{error:auth.error});
  try{
    const summary=governance.workforceSummary();
    const operational=runtime.status();
    const plans=Object.keys(governance.workforce.FAMILIES).map(f=>runtime.familyPlan(f));
    return json(200,{
      summary,
      operational,
      hierarchy:governance.workforce.hierarchy(),
      families:governance.workforce.FAMILIES,
      familyPlans:plans.map(p=>({family:p.family,label:p.label,roles:p.roles.length,executable:p.roles.filter(x=>x.executable).length})),
      roles:governance.workforce.publicRegistry(),
      note:'Registro corporativo IA gobernado y runtime operativo. La falta de fuentes produce NO_VALIDADO; decisiones críticas siguen requiriendo aprobación humana.'
    });
  }catch(error){
    console.error('[workforce-status]',error);
    return json(error.statusCode||500,{error:error.message||'No se pudo obtener la plantilla IA.'});
  }
};
