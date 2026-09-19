'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {exigePermiso}=require('../lib/staff');
const audit=require('../lib/audit-log');
const CORS=cabecerasCORS('POST, OPTIONS');
const json=(statusCode,payload)=>({statusCode,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify(payload)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='POST')return json(405,{error:'Method Not Allowed'});
 const permiso=await exigePermiso(event,'auditoria');if(!permiso.ok)return json(permiso.statusCode,{error:permiso.error});
 let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})}
 if(body.action==='list')return json(200,{events:await audit.recent(Math.min(200,Math.max(1,Number(body.limit)||50)))});
 if(body.action==='verify')return json(200,await audit.verify(Math.min(5000,Math.max(1,Number(body.limit)||500))));
 return json(400,{error:'Acción no reconocida.'});
};
