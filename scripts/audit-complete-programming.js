'use strict';

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const ROOT=path.resolve(__dirname,'..');
const SKIP_DIRS=new Set(['.git','node_modules','dist','.netlify','.cache','coverage','playwright-report','test-results']);
const issues=[];
const warnings=[];
const stats={javascriptFiles:0,localModules:0,functionReferences:0,htmlAssets:0,packageNodeScripts:0};

function rel(p){return path.relative(ROOT,p).replace(/\\/g,'/')}
function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()&&SKIP_DIRS.has(entry.name))continue;
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())walk(p,out);else out.push(p);
  }
  return out;
}
function existsLocal(from,spec){
  const base=path.resolve(path.dirname(from),spec);
  const candidates=[base,`${base}.js`,`${base}.json`,`${base}.cjs`,`${base}.mjs`,path.join(base,'index.js'),path.join(base,'index.json')];
  return candidates.some(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
}
function stripQuery(v){return String(v||'').split('#')[0].split('?')[0]}
function staticAssetExists(htmlFile,url){
  const clean=stripQuery(url);
  if(!clean||/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(clean))return true;
  if(clean.startsWith('/.netlify/functions/'))return true;
  const ext=path.extname(clean).toLowerCase();
  if(!['.js','.css','.mjs','.json','.ico','.webmanifest'].includes(ext))return true;
  const target=clean.startsWith('/')?path.join(ROOT,clean.slice(1)):path.resolve(path.dirname(htmlFile),clean);
  return fs.existsSync(target)&&fs.statSync(target).isFile();
}
function executableModuleRefs(src){
  const refs=[];
  const patterns=[
    /(^|[^'"`\w])require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gm,
    /(^|[^'"`\w])\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gm,
    /(^|[^'"`\w])\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/gm,
  ];
  for(const re of patterns){let m;while((m=re.exec(src)))refs.push(m[2]);}
  return refs;
}

const files=walk(ROOT);
const jsFiles=files.filter(f=>/\.(?:js|cjs|mjs)$/.test(f));
const textFiles=files.filter(f=>/\.(?:js|cjs|mjs|html|toml)$/.test(f)||path.basename(f)==='_redirects');
const functionDir=path.join(ROOT,'netlify','functions');
const functionNames=new Set(fs.existsSync(functionDir)?fs.readdirSync(functionDir).filter(x=>x.endsWith('.js')).map(x=>x.slice(0,-3)):[]);

for(const file of jsFiles){
  stats.javascriptFiles++;
  const checked=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(checked.status!==0)issues.push(`${rel(file)}: sintaxis inválida: ${(checked.stderr||checked.stdout||'').trim().slice(0,500)}`);
  const src=fs.readFileSync(file,'utf8');
  for(const spec of executableModuleRefs(src)){
    stats.localModules++;
    if(!existsLocal(file,spec))issues.push(`${rel(file)}: módulo local inexistente ${spec}`);
  }
}

for(const file of textFiles){
  const src=fs.readFileSync(file,'utf8');
  const re=/\/\.netlify\/functions\/([A-Za-z0-9_-]+)/g;let m;
  while((m=re.exec(src))){stats.functionReferences++;if(!functionNames.has(m[1]))issues.push(`${rel(file)}: referencia a función Netlify inexistente ${m[1]}`)}
}

for(const file of files.filter(f=>f.endsWith('.html'))){
  const src=fs.readFileSync(file,'utf8');
  const re=/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;let m;
  while((m=re.exec(src))){stats.htmlAssets++;if(!staticAssetExists(file,m[1]))issues.push(`${rel(file)}: asset local inexistente ${m[1]}`)}
  const ids=[...src.matchAll(/\bid=["']([^"']+)["']/g)].map(x=>x[1]);
  const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  if(dup.length)warnings.push(`${rel(file)}: IDs HTML duplicados: ${dup.slice(0,20).join(', ')}`);
}

const pkgPath=path.join(ROOT,'package.json');
if(fs.existsSync(pkgPath)){
  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  for(const [name,cmd] of Object.entries(pkg.scripts||{})){
    const re=/(?:^|&&|;)\s*node(?:\s+-[^\s]+)*\s+([^\s;&|]+\.js)\b/g;let m;
    while((m=re.exec(cmd))){stats.packageNodeScripts++;const p=path.resolve(ROOT,m[1]);if(!fs.existsSync(p))issues.push(`package.json script ${name}: archivo inexistente ${m[1]}`)}
  }
}

const tomlPath=path.join(ROOT,'netlify.toml');
if(fs.existsSync(tomlPath)){
  const toml=fs.readFileSync(tomlPath,'utf8');
  const re=/\[functions\."([^"]+)"\]/g;let m;
  while((m=re.exec(toml))){const name=m[1];if(!name.includes('*')&&!functionNames.has(name))issues.push(`netlify.toml: configuración para función inexistente ${name}`)}
}

const report={ok:issues.length===0,stats,issues,warnings};
console.log(JSON.stringify(report,null,2));
if(issues.length){process.exitCode=1}
