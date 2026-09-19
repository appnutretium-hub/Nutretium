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
forbid('scripts/trust-inject.js',"postalCode:'39012'");
if(failures.length){console.error('[security-audit] FALLO');failures.forEach(x=>console.error(' - '+x));process.exit(1)}
console.log('[security-audit] OK — checkout fail-closed, idempotencia, HMAC invitado, permisos, rate limit y CSP presentes');