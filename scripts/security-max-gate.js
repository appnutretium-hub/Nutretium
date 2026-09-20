'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const skipDirs=new Set(['.git','node_modules','dist','.netlify']);
const findings=[];
const highConfidence=[
 {name:'private-key',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
 {name:'github-token',re:/\bgh[pousr]_[A-Za-z0-9]{30,}\b/},
 {name:'github-fine-grained-token',re:/\bgithub_pat_[A-Za-z0-9_]{40,}\b/},
 {name:'aws-access-key',re:/\bAKIA[0-9A-Z]{16}\b/},
 {name:'stripe-live-secret',re:/\bsk_live_[A-Za-z0-9]{20,}\b/}
];
function walk(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(skipDirs.has(entry.name))continue;
  const rel=relative?path.join(relative,entry.name):entry.name,full=path.join(dir,entry.name);
  if(entry.isDirectory()){walk(full,rel);continue;}
  if(!entry.isFile())continue;
  if(/^\.env(?:\.|$)/.test(entry.name)&&entry.name!=='.env.example')findings.push(`${rel}: archivo .env no permitido en Git`);
  let text;try{text=fs.readFileSync(full,'utf8')}catch{continue;}
  if(text.includes('\u0000'))continue;
  for(const rule of highConfidence){if(rule.re.test(text))findings.push(`${rel}: posible secreto ${rule.name}`)}
 }
}
walk(ROOT);
const required=[
 ['netlify/lib/totp.js','step=30'],
 ['netlify/lib/mfa-replay.js','onlyIfNew:true'],
 ['netlify/functions/staff-login.js','mfaReplay.consume'],
 ['netlify/functions/admin-step-up.js','mfaReplay.consume'],
 ['netlify/lib/security-defense.js','assertBrowserBoundary'],
 ['netlify.toml','publish = "dist"']
];
for(const [file,needle] of required){const text=fs.readFileSync(file,'utf8');if(!text.includes(needle))findings.push(`${file}: falta control ${needle}`)}
if(findings.length){console.error('[security-max-gate] FALLO');findings.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('[security-max-gate] OK — TOTP 30s + anti-replay, session/origin defense, secret scan y dist aislado presentes');
