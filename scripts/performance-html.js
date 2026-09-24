'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const requested=String(process.env.NUTRETIUM_HTML_REPAIR_FILE||'').trim();
const file=requested?path.resolve(requested):path.join(ROOT,'index.html');
const allowed=new Set([path.join(ROOT,'index.html'),path.join(ROOT,'dist','index.html')]);
if(!allowed.has(file))throw new Error(`[performance-html] destino no autorizado: ${file}`);
let html=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
let changed=false;

if(!/src=["']progressive-catalog\.js["']/i.test(html)){
  const app=/<script\b([^>]*\bsrc=["']app\.js["'][^>]*)><\/script>/i;
  if(!app.test(html))throw new Error('[performance-html] no se encontró app.js para insertar el catálogo progresivo');
  html=html.replace(app,(full)=>`${full}\n  <script src="progressive-catalog.js"></script>`);
  changed=true;
}

// Smart Store es una herramienta bajo demanda. Su implementación completa crea
// múltiples paneles, listeners y contenido que no aporta nada al primer paint.
// Sustituimos sus dos scripts iniciales por un loader mínimo que conserva el
// botón y carga engine + UI al primer uso del cliente.
const beforeSmart=html;
html=html
  .replace(/\s*<script\b[^>]*\bsrc=["']smart-store-engine\.js["'][^>]*><\/script>/gi,'')
  .replace(/\s*<script\b[^>]*\bsrc=["']smart-store\.js["'][^>]*><\/script>/gi,'');
if(html!==beforeSmart)changed=true;
if(!/src=["']smart-store-loader\.js["']/i.test(html)){
  const progressive=/<script\b([^>]*\bsrc=["']progressive-catalog\.js["'][^>]*)><\/script>/i;
  if(!progressive.test(html))throw new Error('[performance-html] no se encontró progressive-catalog.js para insertar Smart Store lazy');
  html=html.replace(progressive,(full)=>`${full}\n  <script src="smart-store-loader.js"></script>`);
  changed=true;
}

if(changed){
  fs.writeFileSync(file,html,'utf8');
  console.log(`[performance-html] ${path.relative(ROOT,file)} · catálogo progresivo + Smart Store lazy`);
}else{
  console.log(`[performance-html] ${path.relative(ROOT,file)} · ya optimizado`);
}
