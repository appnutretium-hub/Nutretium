'use strict';
const fs=require('fs');const path=require('path');
const dir=path.join(__dirname,'..','netlify','functions');
const hits=[];
for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.js')).sort()){
 const text=fs.readFileSync(path.join(dir,name),'utf8');
 if(/\bverifyJWT\b/.test(text))hits.push(name);
}
console.log('[audit-direct-jwt] Functions con verifyJWT directo:',hits.length?hits.join(', '):'ninguna');
// Las Functions con identidad de usuario deben pasar por session.js para aplicar
// revocación y separación staff/client. Cualquier nueva excepción debe revisarse
// expresamente antes de añadirse aquí.
const allowed=new Set(['guest-order.js','pago-return.js']);
const unexpected=hits.filter(name=>!allowed.has(name));
if(unexpected.length){console.error('[audit-direct-jwt] Validación JWT directa no autorizada:',unexpected.join(', '));process.exit(1)}
