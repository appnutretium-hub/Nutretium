'use strict';
const fs=require('fs'),path=require('path');
const spec=JSON.parse(fs.readFileSync('api-contracts.json','utf8')),errors=[];
for(const c of spec.contracts||[]){const file=path.join('netlify','functions',c.file);if(!fs.existsSync(file)){errors.push(`${c.file}: función no existe`);continue}const src=fs.readFileSync(file,'utf8');if(!/exports\.handler\s*=/.test(src))errors.push(`${c.file}: no exporta handler`);for(const m of c.methods||[]){if(!src.includes(m)&&m!=='GET')errors.push(`${c.file}: no se encuentra método ${m}`)}if(c.auth==='staff-permission'&&!/(exigePermiso|requireStaff)/.test(src))errors.push(`${c.file}: contrato exige autorización staff`);if(c.auth==='owner'&&!/owner/.test(src))errors.push(`${c.file}: contrato exige owner`)}
if(errors.length){console.error('[api-contracts] FAIL');errors.forEach(e=>console.error(' - '+e));process.exit(1)}console.log(`[api-contracts] OK · ${(spec.contracts||[]).length} contratos críticos`);
