'use strict';

const nexus=require('../lib/nexus-core');
const truth=require('../lib/ai-truth-layer');
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
    const architecture=nexus.systemStatus();
    const snapshot=await truth.snapshot();
    const world=nexus.worldModel(snapshot);
    return json(200,{
      architecture,
      worldModel:{generatedAt:world.generatedAt,sourceGeneratedAt:world.sourceGeneratedAt,business:world.business,architecture:world.architecture},
      features:nexus.featureVector(world.business),
      graph:nexus.architectureGraph(),
      eventRoutes:nexus.EVENT_ROUTES,
      note:'Estado arquitectónico y resumen empresarial gobernado; no expone datos personales crudos ni secretos.'
    });
  }catch(error){
    console.error('[nexus-status]',error);
    return json(error.statusCode||500,{error:error.message||'No se pudo obtener el estado de Nexus.'});
  }
};
