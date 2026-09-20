'use strict';
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const errors=[];if(Number(lock.lockfileVersion||0)<3)errors.push('package-lock debe usar lockfileVersion >= 3.');
for(const section of ['dependencies','devDependencies','optionalDependencies'])for(const [name,spec] of Object.entries(pkg[section]||{})){if(/^(?:git\+|https?:|github:|file:)/i.test(String(spec)))errors.push(`${section}.${name} usa una fuente no permitida: ${spec}`)}
for(const [path,meta] of Object.entries(lock.packages||{})){if(!path||!meta||meta.link)continue;const resolved=String(meta.resolved||'');if(resolved.startsWith('http:'))errors.push(`${path} se resuelve por HTTP sin TLS.`);if(/^(?:git\+|git:)/i.test(resolved))errors.push(`${path} se resuelve desde Git sin paquete de registro.`);if(resolved&&resolved.includes('registry.npmjs.org')&&!meta.integrity)errors.push(`${path} no tiene integrity en package-lock.`)}
if(errors.length){console.error('[supply-chain] FAIL');errors.forEach(e=>console.error(' - '+e));process.exit(1)}console.log(`[supply-chain] OK · ${Object.keys(lock.packages||{}).length} entradas bloqueadas · sin fuentes git/http inseguras`);
