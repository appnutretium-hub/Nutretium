'use strict';
const {getBlobStore}=require('../lib/blob-store');
const snapshots=require('../lib/backup-snapshot');
const integrity=require('../lib/backup-integrity');
const offsite=require('../lib/backup-target');
const health=require('../lib/backup-health');
const observability=require('../lib/observability');
exports.handler=async function(){
 const completedAt=new Date().toISOString();let localOk=false,offsiteOk=false,key=null;
 try{
  const backup=getBlobStore('enterprise-backups-v1');if(!backup)throw new Error('Backup store unavailable');
  const snapshot=await snapshots.build(),day=completedAt.slice(0,10);key=`daily/${day}`;
  await backup.setJSON(key,snapshot);
  const verify=await backup.get(key,{type:'json',consistency:'strong'}),verified=integrity.verify(verify);
  if(!verified.ok||!verified.verified||verified.checksum!==snapshot.checksum)throw new Error('Backup verification failed');
  localOk=true;
  const remote=await offsite.push(key,snapshot);offsiteOk=remote.skipped?false:Boolean(remote.ok);
  const list=await backup.list({prefix:'daily/'}),old=(list.blobs||[]).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,-30);
  await Promise.all(old.map(b=>backup.delete(b.key).catch(()=>{})));
  const summary=snapshots.summary(snapshot);await health.record({completedAt,key,localOk:true,offsiteOk:remote.skipped?null:Boolean(remote.ok),offsiteSkipped:Boolean(remote.skipped),checksum:summary.checksum,backupVersion:summary.backupVersion}).catch(()=>{});
  await observability.record('platform-backup-success',{severity:'info',source:'platform-backup',message:`Backup ${key} verificado${remote.skipped?' sin destino externo':' y replicado externamente'}.`,tags:{key,offsite:remote.skipped?'skipped':'ok',version:String(summary.backupVersion)}}).catch(()=>{});
  return{statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,key,...summary,offsite:remote})};
 }catch(err){await health.record({completedAt,key,localOk,offsiteOk,error:String(err.message||err).slice(0,240)}).catch(()=>{});await observability.record('platform-backup-failure',{severity:'critical',source:'platform-backup',message:String(err.message||err),tags:{key:key||'',localOk:String(localOk),offsiteOk:String(offsiteOk)}}).catch(()=>{});console.error('[backup]',err);return{statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error:'Backup failed'})}}
};
