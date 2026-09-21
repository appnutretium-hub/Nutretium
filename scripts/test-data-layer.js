'use strict';
const assert=require('assert');
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
const storage=require('../netlify/lib/storage');
const integrity=require('../netlify/lib/backup-integrity');
const crypt=require('../netlify/lib/backup-crypto');
const target=require('../netlify/lib/backup-target');
const health=require('../netlify/lib/backup-health');
let n=0;async function t(name,fn){await fn();n++;console.log('✓',name)}
(async()=>{
 await t('storage facade conserva lectura/escritura y ETag',async()=>{const s=storage.getBlobStore('test-data-layer');const first=await s.setJSON('a',{x:1},{onlyIfNew:true});assert.strictEqual(first.modified,true);const entry=await s.getWithMetadata('a',{type:'json'});assert.deepStrictEqual(entry.data,{x:1});const bad=await s.setJSON('a',{x:2},{onlyIfMatch:'wrong'});assert.strictEqual(bad.modified,false);const good=await s.setJSON('a',{x:2},{onlyIfMatch:entry.etag});assert.strictEqual(good.modified,true);assert.deepStrictEqual(await s.get('a',{type:'json'}),{x:2})});
 await t('proveedor desconocido queda marcado como no soportado',async()=>{const state=storage.status({NUTRETIUM_STORAGE_PROVIDER:'inventado'});assert.strictEqual(state.supported,false);assert.strictEqual(state.primary,null)});
 await t('checksum v2 es canónico y detecta manipulación',async()=>{const a=integrity.seal({schemaVersion:3,domains:{b:[{z:1,a:2}],a:[]},counts:{b:1,a:0}}),b=integrity.seal({counts:{a:0,b:1},domains:{a:[],b:[{a:2,z:1}]},schemaVersion:3});assert.strictEqual(a.checksum,b.checksum);assert.strictEqual(integrity.verify(a).ok,true);a.domains.b[0].z=9;assert.strictEqual(integrity.verify(a).ok,false)});
 await t('backups legacy conservan verificación compatible',async()=>{const legacy={schemaVersion:3,domains:{},counts:{},generatedAt:'2026-09-21T00:00:00.000Z'};legacy.checksum=integrity.checksumLegacy(legacy);const checked=integrity.verify(legacy);assert.strictEqual(checked.ok,true);assert.strictEqual(checked.version,1)});
 await t('backup cifrado AES-256-GCM+gzip recupera exactamente el snapshot',async()=>{const key=Buffer.alloc(32,7).toString('base64'),source={hello:'Nutretium',rows:Array.from({length:20},(_,i)=>({i,text:'abc'.repeat(10)}))},envelope=crypt.encrypt(source,crypt.keyFrom(key)),decoded=crypt.decrypt(envelope,crypt.keyFrom(key));assert.deepStrictEqual(decoded,source);assert.strictEqual(envelope.algorithm,'aes-256-gcm');assert.strictEqual(envelope.compression,'gzip')});
 await t('backup externo sólo aparece configurado con HTTPS, autenticación y clave',async()=>{const key=Buffer.alloc(32,9).toString('base64');const state=target.status({REQUIRE_OFFSITE_BACKUP:'true',BACKUP_PROVIDER_URL:'https://backup.example/api/',BACKUP_PROVIDER_TOKEN:'token',BACKUP_ENCRYPTION_KEY:key});assert.strictEqual(state.required,true);assert.strictEqual(state.configured,true);assert.strictEqual(state.encrypted,true)});
 await t('readiness de backup externo obligatorio exige copia reciente verificada',async()=>{process.env.REQUIRE_OFFSITE_BACKUP='true';process.env.BACKUP_PROVIDER_URL='https://backup.example/api/';process.env.BACKUP_PROVIDER_TOKEN='token';process.env.BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,5).toString('base64');await health.record({completedAt:new Date().toISOString(),localOk:true,offsiteOk:true});const state=await health.status(process.env);assert.strictEqual(state.ready,true);assert.strictEqual(state.fresh,true);delete process.env.REQUIRE_OFFSITE_BACKUP;delete process.env.BACKUP_PROVIDER_URL;delete process.env.BACKUP_PROVIDER_TOKEN;delete process.env.BACKUP_ENCRYPTION_KEY});
 console.log(`\n${n} pruebas de data layer superadas.`);
})().catch(err=>{console.error(err);process.exit(1)});
