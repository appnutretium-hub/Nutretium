'use strict';
const fs=require('fs');
const src=fs.readFileSync('netlify.toml','utf8');const errors=[];
const match=src.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
if(!match)errors.push('No existe CSP de enforcement en netlify.toml.');
else{
 const csp=match[1];
 const required=["default-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'","upgrade-insecure-requests","form-action 'self'"];
 for(const d of required)if(!csp.includes(d))errors.push(`Falta directiva CSP: ${d}`);
 if(csp.includes("'unsafe-eval'"))errors.push("CSP permite 'unsafe-eval'.");
 if(/script-src[^;]*\*/.test(csp))errors.push('script-src contiene wildcard.');
 if(/script-src[^;]*data:/.test(csp))errors.push('script-src permite data:.');
 if(/object-src(?![^;]*'none')/.test(csp))errors.push("object-src debe ser 'none'.");
 // Inline remains a documented compatibility exception until legacy inline handlers/styles are externalized.
 if(!/script-src[^;]*'unsafe-inline'/.test(csp))console.log('[csp] script inline ya eliminado');
 else console.log('[csp] aviso controlado: script-src unsafe-inline sigue requerido por handlers legacy; unsafe-eval/wildcards/data siguen prohibidos');
}
if(errors.length){console.error('[csp] FAIL');errors.forEach(e=>console.error(' - '+e));process.exit(1)}console.log('[csp] OK · política base defensiva validada');
