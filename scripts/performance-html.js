'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const requested=String(process.env.NUTRETIUM_HTML_REPAIR_FILE||'').trim();
const file=requested?path.resolve(requested):path.join(ROOT,'index.html');
const allowed=new Set([path.join(ROOT,'index.html'),path.join(ROOT,'dist','index.html')]);
if(!allowed.has(file))throw new Error(`[performance-html] destino no autorizado: ${file}`);
let html=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
if(!/src=["']progressive-catalog\.js["']/i.test(html)){
  const app=/<script\b([^>]*\bsrc=["']app\.js["'][^>]*)><\/script>/i;
  if(!app.test(html))throw new Error('[performance-html] no se encontró app.js para insertar el catálogo progresivo');
  html=html.replace(app,(full)=>`${full}\n  <script src="progressive-catalog.js"></script>`);
  fs.writeFileSync(file,html,'utf8');
  console.log(`[performance-html] ${path.relative(ROOT,file)} · catálogo progresivo inyectado`);
}else{
  console.log(`[performance-html] ${path.relative(ROOT,file)} · ya optimizado`);
}
