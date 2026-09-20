'use strict';
const fs=require('fs');const path=require('path');
const dir=path.join(__dirname,'..','netlify','functions'),hits=[];
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.js')).sort()){
 const text=fs.readFileSync(path.join(dir,name),'utf8');
 if(!text.includes('consume('))continue;
 // Un error del almacenamiento del rate-limit nunca debe transformarse en una
 // autorización explícita. El patrón deliberadamente admite callbacks con
 // paréntesis anidados, por ejemplo: .catch(()=>({allowed:true})).
 const failOpenCatch=/\.catch\s*\([\s\S]{0,320}?allowed\s*:\s*true[\s\S]{0,160}?\)/m.test(text);
 const degradedAllows=/degraded[\s\S]{0,240}?allowed\s*:\s*true/m.test(text);
 if(failOpenCatch||degradedAllows)hits.push(name);
}
if(hits.length){console.error('[audit-rate-limit-failopen] Rate-limit fail-open:',hits.join(', '));process.exit(1)}
console.log('[audit-rate-limit-failopen] OK · ninguna Function autoriza al degradarse el rate-limit');
