'use strict';
const fs=require('fs');
const files=['index.html','producto.html','checkout.html','cuenta.html','ayuda.html'];
const errors=[];
for(const file of files){if(!fs.existsSync(file)){errors.push(`${file}: falta`);continue}const html=fs.readFileSync(file,'utf8');if(!/<html[^>]+lang=["'][^"']+/i.test(html))errors.push(`${file}: falta lang`);if(!/<meta[^>]+name=["']viewport["']/i.test(html))errors.push(`${file}: falta viewport`);const ids=[...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(m=>m[1]),dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];if(dup.length)errors.push(`${file}: IDs duplicados: ${dup.slice(0,8).join(', ')}`);for(const m of html.matchAll(/<img\b([^>]*)>/gi)){if(!/\balt\s*=\s*["'][^"']*["']/i.test(m[1]))errors.push(`${file}: imagen sin alt (${m[0].slice(0,90)})`)}if(!/<main\b/i.test(html))errors.push(`${file}: falta landmark <main>`)}
if(errors.length){console.error('[accessibility-static] FAIL');errors.forEach(e=>console.error(' - '+e));process.exit(1)}console.log(`[accessibility-static] OK · ${files.length} páginas críticas`);
