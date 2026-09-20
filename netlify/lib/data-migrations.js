'use strict';
const CURRENT_SCHEMA_VERSION=3;
const V3_DOMAINS=['inventory-lots','erp-sync-jobs','agent-actions'];
function clone(v){return JSON.parse(JSON.stringify(v))}
function migrateSnapshot(input){
 if(!input||typeof input!=='object')return{ok:false,error:'Snapshot inexistente o inválido.'};
 const snapshot=clone(input),version=Number(snapshot.schemaVersion||1);
 if(!Number.isInteger(version)||version<1)return{ok:false,error:'Versión de snapshot no válida.'};
 if(version>CURRENT_SCHEMA_VERSION)return{ok:false,error:`El backup usa schemaVersion ${version}, superior al soportado ${CURRENT_SCHEMA_VERSION}.`};
 snapshot.domains=snapshot.domains&&typeof snapshot.domains==='object'?snapshot.domains:{};snapshot.counts=snapshot.counts&&typeof snapshot.counts==='object'?snapshot.counts:{};
 if(version<3){for(const domain of V3_DOMAINS){if(!Array.isArray(snapshot.domains[domain]))snapshot.domains[domain]=[];snapshot.counts[domain]=snapshot.domains[domain].length}}
 snapshot.schemaVersion=CURRENT_SCHEMA_VERSION;return{ok:true,snapshot,fromVersion:version,toVersion:CURRENT_SCHEMA_VERSION,migrated:version!==CURRENT_SCHEMA_VERSION}
}
module.exports={CURRENT_SCHEMA_VERSION,V3_DOMAINS,migrateSnapshot};
