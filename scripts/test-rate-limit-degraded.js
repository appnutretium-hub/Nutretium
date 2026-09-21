'use strict';
const assert=require('assert');
const Module=require('module');
const path=require('path');

const target=path.resolve(__dirname,'../netlify/lib/rate-limit.js');
const storage=path.resolve(__dirname,'../netlify/lib/blob-store.js');
const realLoad=Module._load;
Module._load=function(request,parent,isMain){
  const resolved=(()=>{try{return Module._resolveFilename(request,parent)}catch{return request}})();
  if(resolved===storage)return{getBlobStore:()=>null};
  return realLoad.apply(this,arguments);
};
delete require.cache[target];
const rate=require(target);
Module._load=realLoad;

(async()=>{
  const event={headers:{'x-nf-client-connection-ip':'127.0.0.1'}};
  const a=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000});
  const b=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000});
  const c=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000});
  assert.strictEqual(a.allowed,true);assert.strictEqual(a.degraded,true);
  assert.strictEqual(b.allowed,true);assert.strictEqual(b.degraded,true);
  assert.strictEqual(c.allowed,false);assert.strictEqual(c.degraded,true);
  await rate.reset({scope:'staff-login',event,extra:'user@example.test'});
  const d=await rate.consume({scope:'staff-login',event,extra:'user@example.test',limit:2,windowMs:60000});
  assert.strictEqual(d.allowed,true);
  console.log('[test-rate-limit-degraded] OK');
})().catch(e=>{console.error(e);process.exit(1)});
