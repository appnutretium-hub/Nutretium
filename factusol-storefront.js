/* NUTRETIUM — FACTUSOL live storefront hydration */
(function(){
'use strict';
const ENDPOINT='/.netlify/functions/factusol-public-catalog';
const REFRESH_MS=60*1000;
let timer=null;

function products(){
  return Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS:[];
}
function tracked(){
  return products().filter(p=>p&&p.active!==false&&p.code&&typeof p.stock==='number');
}
function codes(){
  return tracked().map(p=>String(p.code)).filter(Boolean);
}
function sameCode(a,b){return String(a||'')===String(b||'')}
function applyLive(data){
  if(!data||data.live!==true||data.authoritative!==true||data.status!=='LIVE')return false;
  const byCode=new Map((Array.isArray(data.items)?data.items:[]).map(item=>[String(item.code),item]));
  const missing=new Set(Array.isArray(data.missingCodes)?data.missingCodes.map(String):[]);
  let changed=false;

  for(const product of tracked()){
    const item=byCode.get(String(product.code));
    if(item){
      const nextStock=Math.max(0,Number(item.available)||0);
      const nextPrice=Number(item.price);
      if(product.stock!==nextStock){product.stock=nextStock;changed=true;}
      if(Number.isFinite(nextPrice)&&nextPrice>=0&&Number(product.price)!==nextPrice){product.price=nextPrice;changed=true;}
      product._stockSource='factusol-live';
      product._stockCheckedAt=data.checkedAt||null;
      product._erpBlocked=item.blocked===true;
      if(product._erpBlocked&&product.stock!==0){product.stock=0;changed=true;}
    }else if(missing.has(String(product.code))){
      if(product.stock!==0){product.stock=0;changed=true;}
      product._stockSource='factusol-live-missing';
      product._stockCheckedAt=data.checkedAt||null;
    }
  }

  const appProducts=Array.isArray(window.PRODUCTS)?window.PRODUCTS:null;
  if(appProducts){
    for(const local of appProducts){
      const source=products().find(p=>sameCode(p.code,local.code));
      if(!source)continue;
      local.stock=source.stock;
      local.price=source.price;
      local._stockSource=source._stockSource;
      local._stockCheckedAt=source._stockCheckedAt;
      local._erpBlocked=source._erpBlocked;
    }
  }
  return changed;
}
function rerender(){
  try{if(typeof window.applyFilters==='function')window.applyFilters();else if(typeof window.renderProducts==='function')window.renderProducts();}catch(_){ }
  try{if(typeof window.renderNovedades==='function')window.renderNovedades();}catch(_){ }
  try{if(typeof window.renderRecomendados==='function')window.renderRecomendados();}catch(_){ }
  try{if(typeof window.updateCartUI==='function')window.updateCartUI();}catch(_){ }
  window.dispatchEvent(new CustomEvent('nutretium:factusol-stock-updated'));
}
async function refresh(){
  const list=codes();
  if(!list.length)return;
  const url=ENDPOINT+'?codes='+encodeURIComponent(list.join(','));
  try{
    const res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data)return;
    if(applyLive(data))rerender();
    window.NUTRETIUM_FACTUSOL_LIVE_STATE=data;
  }catch(_){
    window.NUTRETIUM_FACTUSOL_LIVE_STATE={live:false,authoritative:false,status:'UNREACHABLE'};
  }
}
function init(){
  refresh();
  clearInterval(timer);
  timer=setInterval(refresh,REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  window.addEventListener('focus',refresh);
}
window.NUTRETIUM_FACTUSOL_REFRESH=refresh;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
