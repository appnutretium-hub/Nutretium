'use strict';
const fs=require('fs');
const path=require('path');

const ROOT=process.cwd();
const DIST=path.join(ROOT,'dist');
const PUBLIC_FILES=new Set(['_headers','_redirects','manifest.webmanifest','robots.txt','favicon.ico']);
const PUBLIC_EXT=new Set(['.html','.js','.css','.svg','.png','.jpg','.jpeg','.webp','.avif','.gif','.ico','.xml','.webmanifest','.woff','.woff2']);
const ROOT_DENY=new Set(['dist','node_modules','netlify','scripts','src','.git','.github','.netlify','.claude','.vscode','_backup_pre_actualizacion']);
const ROOT_FILE_DENY=new Set(['commerce-core.js','commerce-core.css','enterprise-storefront.js','commerce-account-sync.js','customer-session-hardening.js','franchise-trust.js','tailwind.config.js']);
const NEVER_PUBLIC_EXT=new Set(['.md','.txt','.csv','.xlsx','.xls','.pdf','.env','.toml','.lock','.map']);

function allowedFile(full,relative){
 const base=path.basename(relative),ext=path.extname(base).toLowerCase();
 if(!relative.includes(path.sep)&&ROOT_FILE_DENY.has(base))return false;
 if(PUBLIC_FILES.has(relative)||PUBLIC_FILES.has(base))return true;
 if(NEVER_PUBLIC_EXT.has(ext))return false;
 if(relative.startsWith('sources'+path.sep))return ['.svg','.png','.jpg','.jpeg','.webp','.avif','.gif','.ico'].includes(ext);
 return PUBLIC_EXT.has(ext);
}
function copyTree(source,target,relative=''){
 for(const entry of fs.readdirSync(source,{withFileTypes:true})){
  const rel=relative?path.join(relative,entry.name):entry.name;
  if(!relative&&ROOT_DENY.has(entry.name))continue;
  if(!relative&&entry.name.startsWith('.'))continue;
  const src=path.join(source,entry.name),dst=path.join(target,entry.name);
  if(entry.isDirectory()){
   copyTree(src,dst,rel);
   if(fs.existsSync(dst)&&fs.readdirSync(dst).length===0)fs.rmSync(dst,{recursive:true,force:true});
  }else if(entry.isFile()&&allowedFile(src,rel)){
   fs.mkdirSync(path.dirname(dst),{recursive:true});
   fs.copyFileSync(src,dst);
  }
 }
}

fs.rmSync(DIST,{recursive:true,force:true});
fs.mkdirSync(DIST,{recursive:true});
copyTree(ROOT,DIST);

const required=['index.html','app.js','styles.css','products-data.js','_redirects'];
const missing=required.filter(file=>!fs.existsSync(path.join(DIST,file)));
if(missing.length)throw new Error(`Build dist incompleto. Faltan: ${missing.join(', ')}`);
for(const sourceOnly of ROOT_FILE_DENY)if(fs.existsSync(path.join(DIST,sourceOnly)))throw new Error(`Build dist expone una capa fuente: ${sourceOnly}`);

const forbidden=[];
function audit(dir,relative=''){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const rel=relative?path.join(relative,entry.name):entry.name;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())audit(full,rel);
  else if(NEVER_PUBLIC_EXT.has(path.extname(entry.name).toLowerCase())||/^\.env/i.test(entry.name)||/package(-lock)?\.json$/i.test(entry.name))forbidden.push(rel);
 }
}
audit(DIST);
if(forbidden.length)throw new Error(`El artefacto público contiene archivos internos: ${forbidden.join(', ')}`);

let files=0,bytes=0;
(function count(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())count(full);else{files++;bytes+=fs.statSync(full).size}}})(DIST);
console.log(`[prepare-dist] ${files} archivos públicos · ${(bytes/1024/1024).toFixed(2)} MiB · dist/ limpio`);
