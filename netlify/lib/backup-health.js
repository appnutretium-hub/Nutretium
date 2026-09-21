'use strict';
const {getBlobStore}=require('./blob-store');
const target=require('./backup-target');
const STORE='backup-health-v1',KEY='latest';
async function record(value){const store=getBlobStore(STORE);if(!store)return null;const next={...value,recordedAt:new Date().toISOString()};await store.setJSON(KEY,next);return next}
async function status(env=process.env){const policy=target.status(env),store=getBlobStore(STORE),latest=store?await store.get(KEY,{type:'json',consistency:'strong'}).catch(()=>null):null,maxHours=Math.max(1,Math.min(168,Number(env.BACKUP_MAX_AGE_HOURS)||36)),at=Date.parse(latest?.completedAt||latest?.recordedAt||0),fresh=Boolean(Number.isFinite(at)&&Date.now()-at<=maxHours*3600000),offsiteFresh=Boolean(fresh&&latest?.offsiteOk===true),ready=policy.required?Boolean(policy.configured&&offsiteFresh):true;return{...policy,ready,maxAgeHours:maxHours,lastBackupAt:latest?.completedAt||latest?.recordedAt||null,localOk:latest?.localOk===true,offsiteOk:latest?.offsiteOk===true,fresh}}
module.exports={STORE,KEY,record,status};
