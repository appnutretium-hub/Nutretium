'use strict';
const fs=require('fs');
const path=require('path');
const target=path.join(process.cwd(),'app.js');
const START='/* NUTRETIUM_BUILD_LAYERS_START */';
const END='/* NUTRETIUM_BUILD_LAYERS_END */';
const layers=['franchise-trust.js','commerce-core.js','enterprise-storefront.js','commerce-account-sync.js','customer-session-hardening.js'];
let base=fs.readFileSync(target,'utf8');
const start=base.indexOf(START);
if(start>=0)base=base.slice(0,start).replace(/\s+$/,'')+'\n';
const joined=layers.map(file=>{
 const full=path.join(process.cwd(),file);
 if(!fs.existsSync(full))throw new Error(`Falta capa de build: ${file}`);
 return `\n/* layer:${file} */\n${fs.readFileSync(full,'utf8').replace(/\s+$/,'')}\n`;
}).join('');
fs.writeFileSync(target,`${base.replace(/\s+$/,'')}\n\n${START}${joined}${END}\n`,'utf8');
console.log(`[compose-app] app.js compuesto de forma determinista con ${layers.length} capas`);