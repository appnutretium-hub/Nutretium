'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('./blob-store');
const DEFAULT_TTL=5*60*1000;
function safeKey(value){return String(value||'').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,180)}
async function acquire(key,{ttlMs=DEFAULT_TTL,attempts=8}={}){
 const store=getBlobStore('critical-locks');if(!store||typeof store.getWithMetadata!=='function')throw Object.assign(new Error('Lock store no disponible'),{code:'LOCK_UNAVAILABLE'});
 const k=safeKey(key),token=crypto.randomUUID(),now=Date.now(),record={token,createdAt:now,expiresAt:now+ttlMs};
 let write=await store.setJSON(k,record,{onlyIfNew:true}).catch(()=>null);if(write?.modified===true)return{store,key:k,token};
 for(let i=0;i<attempts;i++){
  const entry=await store.getWithMetadata(k,{type:'json',consistency:'strong'}).catch(()=>null),current=entry?.data;
  if(!current){write=await store.setJSON(k,record,{onlyIfNew:true}).catch(()=>null);if(write?.modified===true)return{store,key:k,token};continue}
  if(Number(current.expiresAt||0)>Date.now())return null;
  if(!entry?.etag)return null;
  const fresh={token,createdAt:Date.now(),expiresAt:Date.now()+ttlMs};
  write=await store.setJSON(k,fresh,{onlyIfMatch:entry.etag}).catch(()=>null);if(write?.modified===true)return{store,key:k,token};
 }
 return null;
}
async function release(lock){if(!lock)return false;try{const entry=await lock.store.getWithMetadata(lock.key,{type:'json',consistency:'strong'});if(entry?.data?.token!==lock.token)return false;await lock.store.delete(lock.key);return true}catch{return false}}
async function withLock(key,fn,options={}){const lock=await acquire(key,options);if(!lock)throw Object.assign(new Error('Operación crítica ya en curso'),{code:'LOCK_BUSY'});try{return await fn()}finally{await release(lock)}}
module.exports={acquire,release,withLock,safeKey};