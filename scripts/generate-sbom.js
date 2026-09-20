'use strict';
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));const out=path.join('.release-artifacts','sbom.cdx.json');fs.mkdirSync(path.dirname(out),{recursive:true});
const components=[];
for(const [p,m] of Object.entries(lock.packages||{})){if(!p.startsWith('node_modules/')||!m?.version)continue;const name=p.slice('node_modules/'.length);components.push({type:'library',name,version:String(m.version),purl:`pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(String(m.version))}`,...(m.integrity?{hashes:[{alg:'SHA-512',content:String(m.integrity).replace(/^sha512-/,'') }]}:{})});}
components.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
const serial='urn:uuid:'+crypto.randomUUID();
const sbom={bomFormat:'CycloneDX',specVersion:'1.5',serialNumber:serial,version:1,metadata:{timestamp:new Date().toISOString(),component:{type:'application',name:pkg.name||'nutretium-web',version:pkg.version||'0.0.0'}},components};
fs.writeFileSync(out,JSON.stringify(sbom,null,2)+'\n');console.log(`[sbom] OK · ${components.length} componentes → ${out}`);
