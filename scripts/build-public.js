'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ROOT=process.cwd();
const DIST=path.join(ROOT,'dist');
const ART=path.join(ROOT,'.release-artifacts');
const rootExt=new Set(['.html','.css','.js','.ico','.png','.jpg','.jpeg','.webp','.svg','.webmanifest']);
const namedPublic=new Set(['robots.txt','sitemap.xml','manifest.json','site.webmanifest','browserconfig.xml']);
const buildOnly=new Set(['commerce-core.css','commerce-core.js','enterprise-storefront.js','commerce-account-sync.js']);
const publicDirs=['producto','categoria','marca','objetivo'];
const imageExt=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg','.avif']);

function reset(p){fs.rmSync(p,{recursive:true,force:true});fs.mkdirSync(p,{recursive:true})}
function copyFile(src,dst){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}
function copyTree(src,dst,accept=()=>true){if(!fs.existsSync(src))return;for(const ent of fs.readdirSync(src,{withFileTypes:true})){const s=path.join(src,ent.name),d=path.join(dst,ent.name);if(ent.isDirectory())copyTree(s,d,accept);else if(ent.isFile()&&accept(s))copyFile(s,d)}}
function concatTo(dst,files){fs.writeFileSync(dst,files.filter(f=>fs.existsSync(path.join(ROOT,f))).map(f=>fs.readFileSync(path.join(ROOT,f),'utf8').trimEnd()).join('\n\n')+'\n')}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}

reset(DIST);reset(ART);
for(const ent of fs.readdirSync(ROOT,{withFileTypes:true})){
 if(!ent.isFile()||ent.name.startsWith('.')||buildOnly.has(ent.name))continue;
 const ext=path.extname(ent.name).toLowerCase();
 if(!rootExt.has(ext)&&!namedPublic.has(ent.name))continue;
 copyFile(path.join(ROOT,ent.name),path.join(DIST,ent.name));
}
for(const dir of publicDirs)copyTree(path.join(ROOT,dir),path.join(DIST,dir),(f)=>path.extname(f).toLowerCase()==='.html');
copyTree(path.join(ROOT,'sources','productos'),path.join(DIST,'sources','productos'),(f)=>imageExt.has(path.extname(f).toLowerCase()));
if(fs.existsSync(path.join(ROOT,'_redirects')))copyFile(path.join(ROOT,'_redirects'),path.join(DIST,'_redirects'));

// Produce exactly the deployed bundles without mutating source app.js/styles.css.
concatTo(path.join(DIST,'styles.css'),['styles.css','human-touch.css','commerce-core.css']);
concatTo(path.join(DIST,'app.js'),['app.js','franchise-trust.js','commerce-core.js','enterprise-storefront.js','commerce-account-sync.js']);

const manifest=[];
(function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())walk(f);else{const rel=path.relative(DIST,f).split(path.sep).join('/');manifest.push({path:rel,bytes:fs.statSync(f).size,sha256:sha256(f)})}}})(DIST);
manifest.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(ART,'public-manifest.json'),JSON.stringify({schema:1,generatedAt:new Date().toISOString(),files:manifest},null,2)+'\n');
console.log(`[build-public] OK · ${manifest.length} archivos públicos · ${manifest.reduce((s,x)=>s+x.bytes,0)} bytes`);
