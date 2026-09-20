'use strict';
const fs=require('fs');const path=require('path');
const dir=path.join(__dirname,'..','netlify','functions'),hits=[];
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.js')).sort()){
 const text=fs.readFileSync(path.join(dir,name),'utf8');
 if(!text.includes('consume('))continue;
 // Un error del almacenamiento del rate-limit nunca debe transformarse en una
 // autorización explícita. El handler puede devolver 503/429, pero no allowed:true.
 if(/\.catch\s*\([^)]*=>\s*\(\s*\{\s*allowed\s*:\s*true\b/s.test(text)||/degraded[^\n]{0,120}allowed\s*:\s*true/s.test(text))hits.push(name);
}
if(hits.length){console.error('[audit-rate-limit-failopen] Rate-limit fail-open:',hits.join(', '));process.exit(1)}
console.log('[audit-rate-limit-failopen] OK · ninguna Function autoriza al degradarse el rate-limit');
