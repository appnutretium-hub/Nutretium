'use strict';
const {cabecerasCORS}=require('../lib/cors');
const {exigePermiso}=require('../lib/staff');
const settings=require('../lib/settings');
const CORS=cabecerasCORS('GET, POST, OPTIONS');
const json=(statusCode,payload)=>({statusCode,headers:CORS,body:JSON.stringify(payload)});
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 const staff=await exigePermiso(event,'settings');if(!staff.ok)return json(staff.statusCode,{error:staff.error});
 if(event.httpMethod==='GET'){const data=await settings.read();return json(200,{settings:data,operator:staff.email})}
 if(event.httpMethod==='POST'){let body;try{body=JSON.parse(event.body||'{}')}catch{return json(400,{error:'JSON no válido.'})};if(body.action!=='save')return json(400,{error:'Acción no reconocida.'});try{const saved=await settings.write(body.settings||{});return json(200,{ok:true,settings:saved,operator:staff.email})}catch(e){console.error('[admin-settings]',e);return json(503,{error:'No se pudieron guardar los ajustes.'})}}
 return json(405,{error:'Method Not Allowed'});
};