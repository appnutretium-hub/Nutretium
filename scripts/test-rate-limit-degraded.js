'use strict';
require('./test-env');
const assert=require('assert');
const Module=require('module');
const path=require('path');

const target=path.resolve(__dirname,'../netlify/lib/rate-limit.js');
const storage=path.resolve(__dirname,'../netlify/lib/blob-store.js');
const realLoad=Module._load;
Module._load=function(request,parent,isMain){
  let resolved=request;try{resolved=Module._resolveFilename(request,parent)}catch{}
  if(resolved===storage)return{getBlobStore:()=>null};
  return realLoad.apply(this,arguments);
};
delete require.cache[target];
const rate=require(target);
Module._load=realLoad;

(async()=>{
  const event={headers:{'x-nf-client-connection-ip':'127.0.0.1'}};
  const strict=await rate.consume({scope:'checkout',event,extra:'a',limit:2,windowMs:60000});
  assert.strictEqual(strict.allowed,false,'El resto de endpoints debe seguir fail-closed');
  assert.strictEqual(strict.degraded,true);

  const a=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000,allowDegradedFallback:true});
  const b=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000,allowDegradedFallback:true});
  const c=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000,allowDegradedFallback:true});
  assert.strictEqual(a.allowed,true);assert.strictEqual(a.degraded,true);assert.strictEqual(a.fallback,true);
  assert.strictEqual(b.allowed,true);assert.strictEqual(b.degraded,true);assert.strictEqual(b.fallback,true);
  assert.strictEqual(c.allowed,false);assert.strictEqual(c.degraded,true);assert.strictEqual(c.fallback,true);
  await rate.reset({scope:'staff-login',event,extra:'user@example.test'});
  const d=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000,allowDegradedFallback:true});
  assert.strictEqual(d.allowed,true);
  console.log('[test-rate-limit-degraded] OK · fallback solo staff-login · resto fail-closed');
})().catch(e=>{console.error(e);process.exit(1)});
