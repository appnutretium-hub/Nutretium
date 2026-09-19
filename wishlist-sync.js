/* NUTRETIUM — sincronización de favoritos para usuarios autenticados. */
(function(){
  'use strict';
  const SESSION='nutretium_user', WISH='nutretium_wishlist_v1';
  const getSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}};
  const getLocal=()=>{try{const x=JSON.parse(localStorage.getItem(WISH)||'[]');return Array.isArray(x)?x.map(Number).filter(Number.isFinite):[]}catch{return[]}};
  const setLocal=(ids)=>{try{localStorage.setItem(WISH,JSON.stringify([...new Set(ids.map(Number).filter(Number.isFinite))].slice(0,200)))}catch{}};
  const request=async(method,body)=>{
    const token=getSession()?.token;if(!token)return null;
    const r=await fetch('/.netlify/functions/customer-data',{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(!r.ok)return null;return r.json().catch(()=>null);
  };
  let last='';
  async function pull(){
    const remote=await request('GET');if(!remote||!Array.isArray(remote.wishlist))return;
    const merged=[...new Set([...remote.wishlist,...getLocal()])];setLocal(merged);last=JSON.stringify(merged.sort((a,b)=>a-b));
  }
  async function push(){
    if(!getSession()?.token)return;
    const ids=getLocal();const sig=JSON.stringify([...ids].sort((a,b)=>a-b));if(sig===last)return;
    const remote=await request('POST',{action:'save-wishlist',ids});if(remote&&Array.isArray(remote.wishlist)){setLocal(remote.wishlist);last=JSON.stringify([...remote.wishlist].sort((a,b)=>a-b));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pull,{once:true});else pull();
  setInterval(push,10000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')push();else pull();});
  window.addEventListener('pagehide',push);
})();
