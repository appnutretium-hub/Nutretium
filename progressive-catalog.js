/* NUTRETIUM — progressive catalogue rendering
   Mantiene búsqueda/filtros sobre el catálogo completo, pero evita construir
   decenas de tarjetas fuera de pantalla durante el primer render. */
(function(){
'use strict';
const original=window.renderProducts;
if(typeof original!=='function')return;
const FIRST=18;
const CHUNK=18;
let generation=0;
let observer=null;

function catalogFallback(){
  return (Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS:[]).filter(p=>p&&p.active!==false);
}
function removeMore(){
  if(observer){observer.disconnect();observer=null}
  document.getElementById('ntCatalogMore')?.remove();
}
function renderProgressively(full){
  const token=++generation;
  let limit=Math.min(FIRST,full.length);
  const paint=()=>{
    if(token!==generation)return;
    original(full.slice(0,limit));
    removeMore();
    if(limit>=full.length)return;
    const grid=document.getElementById('productGrid');
    if(!grid)return;
    const holder=document.createElement('div');
    holder.id='ntCatalogMore';
    holder.className='col-span-full flex justify-center py-5';
    const button=document.createElement('button');
    button.type='button';
    button.className='border border-brand-border rounded-xl px-5 py-3 text-sm font-bold text-brand-gold hover:border-brand-gold transition-colors';
    button.textContent=`Mostrar más productos (${full.length-limit} restantes)`;
    holder.appendChild(button);
    grid.appendChild(holder);
    const more=()=>{
      if(token!==generation)return;
      limit=Math.min(full.length,limit+CHUNK);
      paint();
    };
    button.addEventListener('click',more,{once:true});
    if('IntersectionObserver'in window){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(e=>e.isIntersecting)){observer.disconnect();observer=null;more()}
      },{rootMargin:'500px 0px'});
      observer.observe(holder);
    }
  };
  paint();
}
window.renderProducts=function(list){
  const full=Array.isArray(list)?list:catalogFallback();
  if(full.length<=FIRST){generation++;removeMore();return original.apply(this,arguments)}
  renderProgressively(full);
};
})();
