/* NUTRETIUM — comparador de productos basado solo en catálogo real */
(function(){
'use strict';
const KEY='nutretium_compare_v1';
const MAX=3;
const read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.map(Number).filter(Number.isFinite).slice(0,MAX):[]}catch{return[]}};
const write=(ids)=>{try{localStorage.setItem(KEY,JSON.stringify(ids.slice(0,MAX)))}catch{}};
function toggle(id){
  let ids=read();const n=Number(id);if(ids.includes(n))ids=ids.filter(x=>x!==n);else{if(ids.length>=MAX){if(typeof showToast==='function')showToast('Puedes comparar hasta 3 productos.');return}ids.push(n)}
  write(ids);decorate();tray();
}
window.ntToggleCompare=toggle;
function idFromCard(card){const href=card.querySelector('.nt-product-detail-link')?.getAttribute('href')||card.querySelector('a[href*="/producto/"]')?.getAttribute('href')||'';const m=href.match(/-(\d+)(?:$|[?#])/);return m?Number(m[1]):null}
function setAttrIfChanged(el,name,value){if(el.getAttribute(name)!==value)el.setAttribute(name,value)}
function setTextIfChanged(el,value){if(el.textContent!==value)el.textContent=value}
function decorate(){
  const selected=new Set(read());
  document.querySelectorAll('#productGrid .product-card').forEach(card=>{
    const id=idFromCard(card);if(!id)return;
    let btn=card.querySelector('.nt-compare-btn');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.className='nt-compare-btn';btn.dataset.productId=String(id);
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle(id)});
      const action=card.querySelector('.p-5')||card;action.appendChild(btn);
    }
    const on=selected.has(id);
    if(btn.classList.contains('active')!==on)btn.classList.toggle('active',on);
    setAttrIfChanged(btn,'aria-pressed',String(on));
    setTextIfChanged(btn,on?'✓ En comparación':'+ Comparar');
  });
}
function tray(){
  const ids=read();let el=document.getElementById('ntCompareTray');
  if(!ids.length){el?.remove();return}
  if(!el){el=document.createElement('aside');el.id='ntCompareTray';el.className='nt-compare-tray';document.body.appendChild(el)}
  const products=(window.NUTRETIUM_PRODUCTS||[]).filter(p=>ids.includes(Number(p.id)));
  const markup=`<div><strong>${ids.length}/${MAX} para comparar</strong><span>${products.map(p=>String(p.name).replace(/[<>]/g,'')).join(' · ')}</span></div><div class="nt-compare-actions"><button type="button" id="ntClearCompare">Limpiar</button><a href="/comparar">Comparar ahora</a></div>`;
  if(el.innerHTML!==markup)el.innerHTML=markup;
  const clear=el.querySelector('#ntClearCompare');if(clear&&!clear.dataset.bound){clear.dataset.bound='1';clear.onclick=()=>{write([]);decorate();tray()};}
}
let decorateQueued=false;
function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  requestAnimationFrame(()=>{decorateQueued=false;decorate();});
}
function observe(){
  const grid=document.getElementById('productGrid');if(!grid)return;
  new MutationObserver(scheduleDecorate).observe(grid,{childList:true,subtree:true});
}
function init(){decorate();tray();observe()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,180),{once:true});else setTimeout(init,180);
})();