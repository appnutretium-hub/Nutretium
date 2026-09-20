'use strict';

const governance=require('../lib/agent-governance');
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
    return json(200,{
      summary,
      hierarchy:governance.workforce.hierarchy(),
      families:governance.workforce.FAMILIES,
      roles:governance.workforce.publicRegistry(),
      note:'Registro corporativo IA gobernado. No concede autonomía para decisiones críticas, laborales, legales, financieras, de seguridad, food-safety o producción.'
    });
  }catch(error){
    console.error('[workforce-status]',error);
    return json(error.statusCode||500,{error:error.message||'No se pudo obtener la plantilla IA.'});
  }
};
