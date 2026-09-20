'use strict';
const {spawnSync}=require('child_process');
const files=[
 'admin-shell.js','admin-center.js','admin-center-hash.js','admin-security-enhancer.js','admin-product-enhancer.js',
 'product-editor.js','product-content-ui.js','catalog-management.js','financial-dashboard.js','customer-center.js','customer-center-query.js','backoffice-customer-enhancer.js','enterprise.js',
 'netlify/lib/staff-directory.js','netlify/lib/staff.js','netlify/lib/product-content.js',
 'netlify/functions/admin-governance.js','netlify/functions/product-content.js','netlify/functions/admin-taxonomy.js','netlify/functions/admin-customers.js','netlify/functions/commerce-report.js','netlify/functions/platform-backup.js','netlify/functions/platform-restore.js','netlify/functions/staff-login.js'
];
let failed=false;for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0){failed=true;console.error('[admin-suite] syntax failed:',file)}}if(failed)process.exit(1);console.log(`[admin-suite] syntax OK (${files.length} files)`);