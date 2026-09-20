'use strict';
const fs=require('fs');const path=require('path');
const ROOT=process.cwd(),DIST=path.join(ROOT,'dist');const errors=[];
const required=['index.html','app.js','styles.css','products-data.js','checkout.html'];
const forbiddenRoots=['scripts','netlify','.github','.claude','.vscode','src','node_modules'];
const forbiddenExt=new Set(['.md','.toml','.xlsx','.xls','.pdf','.env','.csv','.lock']);
const secretPatterns=[/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,/REDSYS_SECRET_KEY\s*[=:]\s*[^<\s"']+/i,/NETLIFY_API_TOKEN\s*[=:]\s*[^<\s"']+/i,/GITHUB_TOKEN\s*[=:]\s*gh[opsu]_/i];
if(!fs.existsSync(DIST))errors.push('dist/ no existe');
for(const f of required)if(!fs.existsSync(path.join(DIST,f)))errors.push(`falta ${f}`);
for(const d of forbiddenRoots)if(fs.existsSync(path.join(DIST,d)))errors.push(`directorio interno publicado: ${d}`);
const files=[];
if(fs.existsSync(DIST))(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else files.push(f)}})(DIST);
for(const file of files){const rel=path.relative(DIST,file).split(path.sep).join('/');const ext=path.extname(rel).toLowerCase();if(forbiddenExt.has(ext))errors.push(`extensión interna publicada: ${rel}`);if(/(^|\/)\.(?!well-known)/.test(rel))errors.push(`archivo oculto publicado: ${rel}`);const size=fs.statSync(file).size;if(size<5*1024*1024&&/\.(?:html|js|css|json|txt|xml)$/i.test(rel)){const s=fs.readFileSync(file,'utf8');for(const re of secretPatterns)if(re.test(s))errors.push(`patrón de secreto detectado en ${rel}: ${re}`)}}
// Validate local static references that explicitly point to files.
for(const file of files.filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');for(const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)){let ref=m[1].split('#')[0].split('?')[0];if(!ref||/^(?:https?:|mailto:|tel:|data:|blob:|#|\/\.netlify\/)/i.test(ref))continue;if(!/\.(?:js|css|png|jpe?g|webp|gif|svg|ico|webmanifest|json)$/i.test(ref))continue;ref=decodeURIComponent(ref);const target=ref.startsWith('/')?path.join(DIST,ref.slice(1)):path.resolve(path.dirname(file),ref);if(!target.startsWith(DIST+path.sep)&&target!==DIST){errors.push(`referencia fuera de dist: ${ref}`);continue}if(!fs.existsSync(target))errors.push(`${path.relative(DIST,file)} referencia recurso ausente: ${ref}`)}}
if(errors.length){console.error('[public-dist] FAIL');[...new Set(errors)].forEach(e=>console.error(' - '+e));process.exit(1)}
console.log(`[public-dist] OK · ${files.length} archivos · sin fuentes internas, secretos obvios ni recursos estáticos rotos`);
