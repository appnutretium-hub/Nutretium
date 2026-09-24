/* NUTRETIUM — lightweight Smart Store loader
   Evita construir el drawer y sus paneles durante el primer render. */
(function(){
'use strict';
let loading=null;
let requestedTab='finder';
const valid=new Set(['finder','stacks','foryou','reorder','club','prepared','store']);

function script(src){
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[data-nt-lazy="${src}"]`);
    if(existing){
      if(existing.dataset.loaded==='1')return resolve();
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const el=document.createElement('script');
    el.src=src;
    el.defer=true;
    el.dataset.ntLazy=src;
    el.onload=()=>{el.dataset.loaded='1';resolve()};
    el.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(el);
  });
}
function removeLauncher(){document.getElementById('ntSmartLazyLauncher')?.remove()}
async function load(tab='finder'){
  requestedTab=valid.has(tab)?tab:'finder';
  if(window.NutretiumSmartStore?.__real===true){window.NutretiumSmartStore.open(requestedTab);return}
  if(!loading){
    loading=(async()=>{
      removeLauncher();
      await script('/smart-store-engine.js');
      await script('/smart-store.js');
      const api=window.NutretiumSmartStore;
      if(!api||typeof api.open!=='function')throw new Error('Smart Store no se inicializó');
      api.__real=true;
      return api;
    })().catch(err=>{loading=null;mountLauncher();console.warn('[smart-store-loader]',err?.message||err);throw err});
  }
  const api=await loading;
  api.open(requestedTab);
}
function mountLauncher(){
  if(document.getElementById('ntSmartLazyLauncher')||document.getElementById('ntSmartDrawer'))return;
  const launcher=document.createElement('div');
  launcher.id='ntSmartLazyLauncher';
  launcher.className='nt-smart-launcher';
  launcher.innerHTML='<button type="button" id="ntSmartOpen" class="nt-smart-pulse">Smart Store</button>';
  document.body.appendChild(launcher);
  const button=launcher.querySelector('#ntSmartOpen');
  button.addEventListener('click',()=>load('finder'));
  button.addEventListener('pointerenter',()=>{if(!loading){script('/smart-store-engine.js').catch(()=>{})}},{once:true,passive:true});
}

window.NutretiumSmartStore={
  open:tab=>load(tab),
  close:()=>{},
  showTab:tab=>load(tab),
  __lazy:true
};
function init(){
  const requested=new URL(location.href).searchParams.get('smart');
  if(requested&&valid.has(requested))load(requested).catch(()=>{});
  else mountLauncher();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
