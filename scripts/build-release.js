'use strict';
const {spawnSync}=require('child_process');
function run(cmd,args=[],env={}){const r=spawnSync(cmd,args,{stdio:'inherit',shell:false,env:{...process.env,...env}});if(r.status!==0)process.exit(r.status||1)}
run(process.execPath,['scripts/staff-login-inject.js']);
run('npm',['run','build:css']);
const checks=['app.js','trust-fixes.js','commerce-pro.js','final-hardening.js','commerce-suite.js','commercial-finish.js','compare-suite.js','pro-qa-fixes.js','production-finish.js','mobile-commerce-pro.js','product-variants.js','producto.js','product-education.js','comparar.js','checkout.js','cuenta.js','smart-shop.js','admin-shell.js','staff-login-ui.js','settings.js','control.js','backoffice.js','ops.js','enterprise.js','scripts/build-public.js','scripts/audit-public-dist.js','scripts/audit-csp.js','scripts/generate-sbom.js','netlify/lib/email.js','netlify/lib/promotions.js','netlify/lib/staff.js','netlify/lib/external-readiness.js','netlify/functions/admin-external-readiness.js','netlify/functions/redsys-notify.js','netlify/functions/checkout.js','netlify/functions/commerce.js','netlify/functions/saved-cart.js','netlify/functions/analytics-event.js','netlify/functions/admin-analytics.js','netlify/functions/system-health.js','netlify/functions/production-sentinel.js','netlify/functions/admin-orders.js','netlify/functions/contact.js'];
for(const file of checks)run(process.execPath,['--check',file]);
run(process.execPath,['scripts/smoke-web.js']);
run(process.execPath,['scripts/audit-architecture.js']);
run(process.execPath,['scripts/security-audit.js']);
run(process.execPath,['scripts/audit-workflow-pinning.js']);
run(process.execPath,['scripts/audit-csp.js']);
run(process.execPath,['scripts/build-public.js']);
run(process.execPath,['scripts/audit-public-dist.js']);
run(process.execPath,['scripts/generate-sbom.js']);
console.log('[build-release] OK · artefacto dist/ reproducible y auditado');
