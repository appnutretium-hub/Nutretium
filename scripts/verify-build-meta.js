'use strict';
const fs=require('fs');
const path=require('path');

const expected=String(process.argv[2]||process.env.GITHUB_SHA||'').trim().toLowerCase();
const file=path.resolve(process.argv[3]||'dist/build-meta.json');
if(!/^[0-9a-f]{40}$/.test(expected))throw new Error('SHA esperado no válido.');
if(!fs.existsSync(file))throw new Error(`No existe ${file}.`);
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const actual=String(data.sha||'').trim().toLowerCase();
if(actual!==expected)throw new Error(`SHA del artefacto ${actual||'vacío'} distinto del SHA aprobado ${expected}.`);
if(data.repository!=='appnutretium-hub/Nutretium')throw new Error(`Repositorio inesperado en build-meta: ${data.repository||'vacío'}.`);
console.log(`[verify-build-meta] artefacto ${actual} verificado`);
