/** Acceso centralizado a Netlify Blobs. */
'use strict';
function memoryStore(name){
  const root=globalThis.__NUTRETIUM_TEST_BLOBS__||(globalThis.__NUTRETIUM_TEST_BLOBS__=new Map());
  if(!root.has(name))root.set(name,new Map());const map=root.get(name);
  return{
    async get(key,opts={}){const v=map.get(String(key));if(v===undefined)return null;if(opts.type==='json')return JSON.parse(JSON.stringify(v));return typeof v==='string'?v:JSON.stringify(v)},
    async setJSON(key,value){map.set(String(key),JSON.parse(JSON.stringify(value)))},
    async set(key,value){map.set(String(key),value)},
    async delete(key){map.delete(String(key))},
    async list(){return{blobs:[...map.keys()].map(key=>({key}))}}
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