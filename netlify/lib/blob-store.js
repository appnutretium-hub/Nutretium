/** Acceso centralizado a Netlify Blobs. */
'use strict';
function memoryStore(name){
  const root=globalThis.__NUTRETIUM_TEST_BLOBS__||(globalThis.__NUTRETIUM_TEST_BLOBS__=new Map());
  if(!root.has(name))root.set(name,new Map());const map=root.get(name);
  const etags=globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__||(globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map());
  if(!etags.has(name))etags.set(name,new Map());const tagMap=etags.get(name);
  const tag=key=>tagMap.get(String(key))||null;
  const bump=key=>{const next=`\"mem-${Date.now()}-${Math.random().toString(36).slice(2)}\"`;tagMap.set(String(key),next);return next};
  function canWrite(key,opts={}){
    const k=String(key),exists=map.has(k),current=tag(k);
    if(opts.onlyIfNew===true&&exists)return false;
    if(opts.onlyIfMatch!==undefined&&opts.onlyIfMatch!==null){if(!exists||current!==opts.onlyIfMatch)return false;}
    return true;
  }
  return{
    async get(key,opts={}){const v=map.get(String(key));if(v===undefined)return null;if(opts.type==='json')return JSON.parse(JSON.stringify(v));return typeof v==='string'?v:JSON.stringify(v)},
    async getWithMetadata(key,opts={}){const k=String(key);if(!map.has(k))return null;const v=map.get(k),etag=tag(k);const data=opts.etag&&opts.etag===etag?null:(opts.type==='json'?JSON.parse(JSON.stringify(v)):(typeof v==='string'?v:JSON.stringify(v)));return{data,etag,metadata:{}}},
    async setJSON(key,value,opts={}){const k=String(key);if(!canWrite(k,opts))return{modified:false};map.set(k,JSON.parse(JSON.stringify(value)));return{modified:true,etag:bump(k)}},
    async set(key,value,opts={}){const k=String(key);if(!canWrite(k,opts))return{modified:false};map.set(k,value);return{modified:true,etag:bump(k)}},
    async delete(key){const k=String(key);map.delete(k);tagMap.delete(k)},
    async list(){return{blobs:[...map.keys()].map(key=>({key,etag:tag(key)}))}}
  };
}
function getBlobStore(name){
  if(process.env.NUTRETIUM_TEST_MEMORY_BLOBS==='true')return memoryStore(name);
  try{
    const{getStore}=require('@netlify/blobs');const siteID=process.env.SITE_ID,token=process.env.NETLIFY_API_TOKEN;
    if(siteID&&token)return getStore({name,siteID,token});
    return getStore(name);
  }catch{return null}
}
module.exports={getBlobStore};