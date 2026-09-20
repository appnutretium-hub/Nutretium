'use strict';
const fs=require('fs');
const file=process.argv[2];
if(!file||!fs.existsSync(file)){console.error('::error title=npm audit::No se encontró el informe JSON de npm audit');process.exit(2)}
let report;try{report=JSON.parse(fs.readFileSync(file,'utf8'))}catch(err){console.error(`::error title=npm audit::Informe JSON inválido: ${String(err.message||err)}`);process.exit(2)}
const vulns=report.vulnerabilities&&typeof report.vulnerabilities==='object'?report.vulnerabilities:{};
const ranked={low:1,moderate:2,high:3,critical:4};
const blocking=[];
for(const [name,v] of Object.entries(vulns)){
 const severity=String(v.severity||'unknown').toLowerCase();
 const via=Array.isArray(v.via)?v.via:[];
 const details=via.map(item=>typeof item==='string'?item:[item.title,item.url,item.range].filter(Boolean).join(' | ')).slice(0,4).join(' ; ');
 const fix=v.fixAvailable===true?'sí':v.fixAvailable===false?'no':(v.fixAvailable&&typeof v.fixAvailable==='object'?JSON.stringify(v.fixAvailable):'desconocido');
 const msg=`${name} | severity=${severity} | range=${v.range||'n/a'} | fixAvailable=${fix}${details?` | ${details}`:''}`;
 console.log(`::${ranked[severity]>=3?'error':'warning'} title=npm audit ${severity}::${msg.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);
 if(ranked[severity]>=3)blocking.push(msg);
}
const meta=report.metadata?.vulnerabilities||{};
console.log(`[npm-audit] low=${meta.low||0} moderate=${meta.moderate||0} high=${meta.high||0} critical=${meta.critical||0}`);
if(blocking.length){console.error(`[npm-audit] BLOQUEADO: ${blocking.length} vulnerabilidad(es) high/critical`);process.exit(1)}
console.log('[npm-audit] OK — sin vulnerabilidades high/critical en dependencias de producción');
