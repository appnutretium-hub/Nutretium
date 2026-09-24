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

// Los scripts clásicos locales se mantenían parser-blocking al final del body.
// `defer` permite descargarlos en paralelo y conserva el orden documental de
// ejecución, por lo que products-data -> app -> capas posteriores mantienen sus
// dependencias sin bloquear el parser ni alargar artificialmente DCL.
const beforeDefer=html;
html=html.replace(/<script\b([^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*)><\/script>/gi,(full,attrs,src)=>{
  const value=String(src||'').trim();
  const external=/^(?:https?:)?\/\//i.test(value)||/^(?:data|blob):/i.test(value);
  if(external||/\b(?:async|defer)\b/i.test(attrs))return full;
  return `<script defer${attrs}></script>`;
});
if(html!==beforeDefer)changed=true;

// Fail closed: ningún JavaScript local clásico debe quedar bloqueando el parser
// después de esta transformación. `async` también es no bloqueante, pero no se
// introduce porque perdería el orden de dependencias.
const blocking=[];
for(const match of html.matchAll(/<script\b([^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*)><\/script>/gi)){
  const attrs=match[1]||'';
  const src=String(match[2]||'').trim();
  const external=/^(?:https?:)?\/\//i.test(src)||/^(?:data|blob):/i.test(src);
  if(!external&&!/\b(?:async|defer)\b/i.test(attrs))blocking.push(src);
}
if(blocking.length)throw new Error(`[performance-html] scripts locales bloqueantes tras optimización: ${blocking.join(', ')}`);

if(changed){
  fs.writeFileSync(file,html,'utf8');
  console.log(`[performance-html] ${path.relative(ROOT,file)} · catálogo progresivo + Smart Store lazy + scripts locales defer`);
}else{
  console.log(`[performance-html] ${path.relative(ROOT,file)} · ya optimizado`);
}
