'use strict';
const fs=require('fs');
const failures=[];
const read=f=>fs.readFileSync(f,'utf8');
function need(f,s){if(!read(f).includes(s))failures.push(`${f}: falta ${s}`)}
function forbid(f,s){if(read(f).includes(s))failures.push(`${f}: no debe contener ${s}`)}
need('netlify/functions/checkout.js','COMMERCE_LIVE');
need('netlify/functions/checkout.js','MAINTENANCE_MODE');
need('netlify/functions/checkout.js','checkoutFingerprint');
need('netlify/functions/checkout.js',"scope:'checkout'");
need('netlify/functions/redsys-notify.js','timingSafeEqual');
need('netlify/functions/guest-order.js','verify(order,rec.email,token)');
need('netlify/lib/guest-access.js','createHmac');
need('netlify/functions/admin-settings.js',"exigePermiso(event,'settings')");
need('netlify/functions/contact.js',"scope:'contact'");
need('netlify.toml',"object-src 'none'");
need('netlify.toml','frame-ancestors \'none\'');
need('netlify.toml','upgrade-insecure-requests');
need('netlify.toml','X-Frame-Options = "DENY"');
need('netlify.toml','X-Content-Type-Options = "nosniff"');
need('netlify.toml','Strict-Transport-Security = "max-age=31536000; includeSubDomains"');
need('netlify.toml','Referrer-Policy = "strict-origin-when-cross-origin"');
need('netlify.toml','Cross-Origin-Opener-Policy = "same-origin"');
need('netlify.toml','X-Permitted-Cross-Domain-Policies = "none"');
need('netlify.toml','Origin-Agent-Cluster = "?1"');
need('.github/workflows/quality.yml','actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
need('.github/workflows/quality.yml','actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
need('.github/workflows/quality-gate.yml','scripts/audit-workflow-pinning.js');
forbid('scripts/trust-inject.js',"postalCode:'39012'");
if(failures.length){console.error('[security-audit] FALLO');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('[security-audit] OK — checkout fail-closed, HMAC, permisos, rate limit, headers defensivos y CI inmutable presentes');