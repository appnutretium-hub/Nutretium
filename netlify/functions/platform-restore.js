'use strict';
const {requireStaff}=require('../lib/staff');
const {verifyStepUp}=require('../lib/security-step-up');
const defense=require('../lib/security-defense');
const security=require('../lib/security-policy');
const {getBlobStore}=require('../lib/blob-store');
const enterprise=require('../lib/enterprise-store');
const productContent=require('../lib/product-content');
const snapshots=require('../lib/backup-snapshot');
const validation=require('../lib/backup-validation');
const backupIntegrity=require('../lib/backup-integrity');
const {migrateSnapshot}=require('../lib/data-migrations');
const {cabecerasCORS}=require('../lib/cors');
const CORS=cabecerasCORS('POST, OPTIONS'),response=(s,b)=>({statusCode:s,headers:{...CORS,...security.securityHeaders()},body:JSON.stringify(b)});
exports.handler=async event=>{
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};if(event.httpMethod!=='POST')return response(405,{error:'Method Not Allowed'});const auth=await requireStaff(event,'platform.write');if(!auth.ok)return response(auth.statusCode,{error:auth.error});if(auth.role!=='owner')return response(403,{error:'Solo el propietario puede restaurar backups.'});const elevated=await verifyStepUp(event,auth);if(!elevated.ok)return response(elevated.statusCode,{error:elevated.error,code:elevated.code});let body;try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'JSON no válido.'})}
 const key=String(body.key||'');if(!/^daily\/\d{4}-\d{2}-\d{2}$/.test(key))return response(400,{error:'Clave de backup no válida.'});const backupStore=getBlobStore('enterprise-backups-v1');if(!backupStore)return response(503,{error:'Backup store no disponible.'});const raw=await backupStore.get(key,{type:'json',consistency:'strong'}).catch(()=>null);if(!raw?.domains)return response(404,{error:'Backup no encontrado o inválido.'});
 const prepared=validation.prepare(raw);if(!prepared.ok)return response(409,{error:prepared.error});const plan={key,...prepared.plan};if(body.confirm!==`RESTORE:${key}`)return response(200,{dryRun:true,plan,requiredConfirmation:`RESTORE:${key}`});
 const integrity=await defense.verifyAuditIntegrity();if(!integrity.ok)return response(integrity.statusCode,{error:integrity.error,code:integrity.code});
 const replay=await defense.consumeMutationNonce({event,actor:auth.email,scope:`platform-restore:${key}`});if(!replay.ok)return response(replay.statusCode,{error:replay.error,code:replay.code});
 const before=await snapshots.build(),restoreId=new Date().toISOString().replace(/[:.]/g,'-'),safetyKey=`pre-restore/${restoreId}`;await backupStore.setJSON(safetyKey,before);let restored=0;for(const domain of Object.keys(prepared.prepared))for(const record of prepared.prepared[domain]){await enterprise.save(domain,record.data,auth,{id:record.id,reason:`restore:${key}`});restored++}restored+=await productContent.replaceAll(prepared.productContent);await enterprise.audit(auth,'restore','platform',key,{restored,safetyBackup:safetyKey,sourceChecksum:prepared.plan.checksum,productContent:prepared.productContent.length,schemaMigration:prepared.plan.schema,integrity:prepared.plan.integrity});return response(200,{ok:true,restored,key,safetyBackup:safetyKey,schema:prepared.plan.schema,integrity:prepared.plan.integrity});
};
exports._test={checksum:backupIntegrity.checksumLegacy,validateSnapshot:validation.validateRecords,migrateSnapshot,prepareBackup:validation.prepare};
