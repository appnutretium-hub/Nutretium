/* NUTRETIUM — sincronización de favoritos para usuarios autenticados. */
(function(){
  'use strict';
  const WISH='nutretium_wishlist_v1';
  // Quién tiene sesión lo dice sesion-cliente.js, no un token en localStorage:
  // ese token ya no se guarda y los favoritos dejaban de subir al servidor.
  const sesion=window.NutretiumSesion;
  const getLocal=()=>{try{const x=JSON.parse(localStorage.getItem(WISH)||'[]');return Array.isArray(x)?x.map(Number).filter(Number.isFinite):[]}catch{return[]}};
  const setLocal=(ids)=>{try{localStorage.setItem(WISH,JSON.stringify([...new Set(ids.map(Number).filter(Number.isFinite))].slice(0,200)))}catch{}};
  const request=async(method,body)=>{
    if(!sesion.activa())return null;
    const r=await sesion.pide('/.netlify/functions/customer-data',{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    if(!r.ok)return null;return r.json().catch(()=>null);
  };
  let last='';
  async function pull(){
    const remote=await request('GET');if(!remote||!Array.isArray(remote.wishlist))return;
    const merged=[...new Set([...remote.wishlist,...getLocal()])];setLocal(merged);last=JSON.stringify(merged.sort((a,b)=>a-b));
  }
  async function push(){
    if(!sesion.activa())return;
    const ids=getLocal();const sig=JSON.stringify([...ids].sort((a,b)=>a-b));if(sig===last)return;
    const remote=await request('POST',{action:'save-wishlist',ids});if(remote&&Array.isArray(remote.wishlist)){setLocal(remote.wishlist);last=JSON.stringify([...remote.wishlist].sort((a,b)=>a-b));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',pull,{once:true});else pull();
  setInterval(push,10000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')push();else pull();});
  window.addEventListener('pagehide',push);
})();
