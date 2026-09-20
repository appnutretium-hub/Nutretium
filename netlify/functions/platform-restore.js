'use strict';
const crypto=require('crypto');
const {requireStaff}=require('../lib/staff');
const {verifyStepUp}=require('../lib/security-step-up');
const defense=require('../lib/security-defense');
const security=require('../lib/security-policy');
const {getBlobStore}=require('../lib/blob-store');
const enterprise=require('../lib/enterprise-store');
const schema=require('../lib/enterprise-schema');
const productContent=require('../lib/product-content');
const {migrateSnapshot}=require('../lib/data-migrations');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('POST, OPTIONS'),response=(s,b)=>({statusCode:s,headers:{...CORS,...security.securityHeaders()},body:JSON.stringify(b)});
function checksum(snapshot){const copy={...snapshot};delete copy.checksum;return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex')}
function validateSnapshot(snapshot){const prepared={};for(const domain of schema.domains()){const records=Array.isArray(snapshot.domains?.[domain])?snapshot.domains[domain]:[];prepared[domain]=[];for(const record of records){const checked=schema.validate(domain,record);if(!checked.ok)return{ok:false,error:`Backup inválido en ${domain}: ${checked.errors[0]}`};prepared[domain].push({id:record.id,data:checked.data})}}const productRows=Array.isArray(snapshot.productContent)?snapshot.productContent:[];for(const row of productRows){const checked=productContent.validate(row.code,row);if(!checked.ok)return{ok:false,error:`Contenido de producto inválido en ${row.code||'sin código'}: ${checked.error}`}}return{ok:true,prepared,productContent:productRows}}
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});const auth=await requireStaff(event,'platform.write');if(!auth.ok)return response(auth.statusCode,{error:auth.error});if(auth.role!=='owner')return response(403,{error:'Solo el propietario puede restaurar backups.'});const elevated=await verifyStepUp(event,auth);if(!elevated.ok)return response(elevated.statusCode,{error:elevated.error,code:elevated.code});let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 const key=String(body.key||'');if(!/^daily\/\d{4}-\d{2}-\d{2}$/.test(key))return response(400,{error:'Clave de backup no válida.'});const backupStore=getBlobStore('enterprise-backups-v1');if(!backupStore)return response(503,{error:'Backup store no disponible.'});const raw=await backupStore.get(key,{type:'json',consistency:'strong'}).catch(()=>null);if(!raw?.domains)return response(404,{error:'Backup no encontrado o inválido.'});if(raw.checksum&&raw.checksum!==checksum(raw))return response(409,{error:'El backup no supera la verificación de integridad.'});
 const migrated=migrateSnapshot(raw);if(!migrated.ok)return response(409,{error:migrated.error});const snapshot=migrated.snapshot;
 if(snapshot.counts){for(const domain of schema.domains()){const expected=Number(snapshot.counts[domain]||0),actual=Array.isArray(snapshot.domains[domain])?snapshot.domains[domain].length:0;if(expected!==actual)return response(409,{error:`El backup tiene un conteo inconsistente en ${domain}.`})}}
 const validation=validateSnapshot(snapshot);if(!validation.ok)return response(409,{error:validation.error});const plan={key,generatedAt:snapshot.generatedAt||null,checksum:raw.checksum||null,schema:{from:migrated.fromVersion,to:migrated.toVersion,migrated:migrated.migrated},domains:{},records:0,productContent:validation.productContent.length};for(const domain of schema.domains()){const n=validation.prepared[domain].length;plan.domains[domain]=n;plan.records+=n}plan.records+=validation.productContent.length;if(body.confirm!==`RESTORE:${key}`)return response(200,{dryRun:true,plan,requiredConfirmation:`RESTORE:${key}`});
 const replay=await defense.consumeMutationNonce({event,actor:auth.email,scope:`platform-restore:${key}`});if(!replay.ok)return response(replay.statusCode,{error:replay.error,code:replay.code});
 const before=await enterprise.snapshot();before.productContent=await productContent.list();before.checksum=checksum(before);const restoreId=new Date().toISOString().replace(/[:.]/g,'-'),safetyKey=`pre-restore/${restoreId}`;await backupStore.setJSON(safetyKey,before);let restored=0;for(const domain of schema.domains())for(const record of validation.prepared[domain]){await enterprise.save(domain,record.data,auth,{id:record.id,reason:`restore:${key}`});restored++}restored+=await productContent.replaceAll(validation.productContent);await enterprise.audit(auth,'restore','platform',key,{restored,safetyBackup:safetyKey,sourceChecksum:raw.checksum||null,productContent:validation.productContent.length,schemaMigration:plan.schema});return response(200,{ok:true,restored,key,safetyBackup:safetyKey,schema:plan.schema});
};
exports._test={checksum,validateSnapshot,migrateSnapshot};
