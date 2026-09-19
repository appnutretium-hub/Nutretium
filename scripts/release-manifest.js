'use strict';
const fs=require('fs');
const manifest={commit:String(process.env.COMMIT_REF||process.env.HEAD||'local').slice(0,64),context:String(process.env.CONTEXT||'local').slice(0,40),builtAt:new Date().toISOString(),commerceLive:String(process.env.COMMERCE_LIVE||'').toLowerCase()==='true',redsysEnvironment:String(process.env.REDSYS_ENV||'test')};
fs.writeFileSync('version.json',JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('[release-manifest]',manifest.commit,manifest.context);