'use strict';

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const SKIP_DIRS=new Set(['.git','node_modules','dist','.netlify','.cache','coverage','playwright-report','test-results']);
const issues=[];
const warnings=[];
const stats={htmlFiles:0,buttons:0,links:0,inlineHandlers:0,handlerCalls:0,roleButtons:0,forms:0,localLinksChecked:0,unverifiedButtons:0,redirectRoutes:0,idHelperAliases:0};

function rel(p){return path.relative(ROOT,p).replace(/\\/g,'/')}
function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory()&&SKIP_DIRS.has(entry.name))continue;
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())walk(p,out);else out.push(p);
  }
  return out;
}
function attrs(tag){
  const out={};
  const re=/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;while((m=re.exec(tag)))out[m[1].toLowerCase()]=m[2]??m[3]??m[4]??'';
  return out;
}
function cleanHref(v){return String(v||'').trim().split('#')[0].split('?')[0]}
function isExternal(v){return /^(?:https?:|mailto:|tel:|sms:|data:|javascript:|\/\/)/i.test(v)}

function loadNetlifyRoutes(){
  const routes=new Set();
  const redirectsFile=path.join(ROOT,'_redirects');
  if(!fs.existsSync(redirectsFile))return routes;
  for(const rawLine of fs.readFileSync(redirectsFile,'utf8').split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||line.startsWith('#'))continue;
    const parts=line.split(/\s+/);
    const from=parts[0];
    if(!from||!from.startsWith('/')||from.includes('*')||from.includes(':'))continue;
    routes.add(cleanHref(from).replace(/\/$/,'')||'/');
  }
  return routes;
}
const netlifyRoutes=loadNetlifyRoutes();
stats.redirectRoutes=netlifyRoutes.size;

function localTargetExists(htmlFile,href){
  const clean=cleanHref(href);
  if(!clean||clean==='/')return true;
  if(clean.startsWith('/.netlify/functions/'))return true;
  if(/^\/(?:producto|categoria|marca|objetivo)\//.test(clean))return true;
  const normalized=clean.replace(/\/$/,'')||'/';
  if(netlifyRoutes.has(normalized))return true;
  const target=clean.startsWith('/')?path.join(ROOT,clean.slice(1)):path.resolve(path.dirname(htmlFile),clean);
  if(fs.existsSync(target))return true;
  if(!path.extname(target)&&fs.existsSync(`${target}.html`))return true;
  return false;
}

const files=walk(ROOT);
const htmlFiles=files.filter(f=>f.endsWith('.html'));
const jsFiles=files.filter(f=>/\.(?:js|cjs|mjs)$/.test(f));
const jsCorpus=jsFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const htmlCorpus=htmlFiles.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const corpus=`${jsCorpus}\n${htmlCorpus}`;

const declared=new Set();
for(const re of [
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
  /\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g,
  /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g,
]){let m;while((m=re.exec(corpus)))declared.add(m[1])}

const idHelperAliases=new Set();
for(const re of [
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*=>\s*document\.getElementById\(\s*[A-Za-z_$][\w$]*\s*\)/g,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>\s*document\.getElementById\(\s*[A-Za-z_$][\w$]*\s*\)/g,
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*return\s+document\.getElementById\(\s*[A-Za-z_$][\w$]*\s*\)\s*;?\s*\}/g
]){let m;while((m=re.exec(jsCorpus)))idHelperAliases.add(m[1])}
stats.idHelperAliases=idHelperAliases.size;

const BUILTINS=new Set([
  'if','for','while','switch','catch','function','return','typeof','void','delete','new',
  'alert','confirm','prompt','fetch','setTimeout','setInterval','clearTimeout','clearInterval',
  'parseInt','parseFloat','isNaN','Number','String','Boolean','Array','Object','Date','Map','Set',
  'WeakMap','WeakSet','Promise','URL','URLSearchParams','FormData','Blob','File','FileReader','Image',
  'encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','structuredClone','queueMicrotask'
]);

function handlerCalls(code){
  const calls=[];
  const re=/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;while((m=re.exec(code))){const name=m[2];if(!BUILTINS.has(name))calls.push(name)}
  return calls;
}
function idEvidencePatterns(id){
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    `getElementById\\(\\s*['"]${escaped}['"]\\s*\\)`,
    `querySelector(?:All)?\\(\\s*['"]#${escaped}(?:['".#:[\\s]|$)`
  ];
  for(const alias of idHelperAliases){
    const helper=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    patterns.push(`${helper}\\(\\s*['"]${escaped}['"]\\s*\\)`);
  }
  return patterns;
}
function hasListenerEvidence(a){
  const id=a.id;
  if(id){
    for(const pattern of idEvidencePatterns(id))if(new RegExp(pattern).test(jsCorpus))return true;
  }
  const classes=String(a.class||'').split(/\s+/).filter(Boolean).filter(x=>/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(x));
  for(const cls of classes){
    const escaped=cls.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(new RegExp(`querySelector(?:All)?\\(\\s*['"][^'"]*\\.${escaped}(?:[^A-Za-z0-9_-]|$)`).test(jsCorpus))return true;
  }
  return false;
}

for(const file of htmlFiles){
  stats.htmlFiles++;
  const src=fs.readFileSync(file,'utf8');
  stats.forms+=(src.match(/<form\b/gi)||[]).length;

  const interactive=[...src.matchAll(/<(button|a)\b[^>]*>/gi)];
  for(const match of interactive){
    const kind=match[1].toLowerCase(),tag=match[0],a=attrs(tag);
    if(kind==='button')stats.buttons++;else stats.links++;
    if(String(a.role||'').toLowerCase()==='button')stats.roleButtons++;

    for(const [name,value] of Object.entries(a)){
      if(!/^on(?:click|change|input|submit|keydown|keyup|focus|blur)$/.test(name))continue;
      stats.inlineHandlers++;
      for(const call of handlerCalls(value)){
        stats.handlerCalls++;
        if(!declared.has(call))issues.push(`${rel(file)}: ${name} referencia función no encontrada: ${call}() · ${value.slice(0,160)}`);
      }
    }

    if(kind==='a'){
      const href=String(a.href||'').trim();
      if(href&&href!=='#'&&!isExternal(href)){
        stats.localLinksChecked++;
        if(!localTargetExists(file,href))issues.push(`${rel(file)}: enlace local sin destino: ${href}`);
      }
      continue;
    }

    const disabled=Object.prototype.hasOwnProperty.call(a,'disabled');
    const type=String(a.type||'').toLowerCase();
    const direct=Object.keys(a).some(k=>/^on(?:click|change|input|submit|keydown|keyup)$/.test(k));
    const semantic=type==='submit'||type==='reset';
    if(!disabled&&!direct&&!semantic&&!hasListenerEvidence(a)){
      stats.unverifiedButtons++;
      const label=(tag.match(/aria-label\s*=\s*["']([^"']+)/i)||[])[1]||a.id||String(a.class||'').split(/\s+/).slice(0,3).join('.');
      warnings.push(`${rel(file)}: botón sin cableado verificable estáticamente${label?` (${label})`:''}`);
    }
  }
}

const uniqueIssues=[...new Set(issues)];
const uniqueWarnings=[...new Set(warnings)];
const report={ok:uniqueIssues.length===0,stats,issues:uniqueIssues,warnings:uniqueWarnings.slice(0,80),warningCount:uniqueWarnings.length};
console.log(JSON.stringify(report,null,2));
if(uniqueIssues.length)process.exitCode=1;
