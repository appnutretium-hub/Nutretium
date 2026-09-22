/* NUTRETIUM — configuración pública editable desde administración + catálogo FACTUSOL live */
(function(){'use strict';
const byId=id=>document.getElementById(id);
function hideMatching(selector,visible){document.querySelectorAll(selector).forEach(el=>{el.style.display=visible?'':'none'})}
function ensureMeta(name){let el=document.querySelector(`meta[name="${name}"]`);if(!el){el=document.createElement('meta');el.name=name;document.head.appendChild(el)}return el}
function managedBanner(c){let bar=byId('ntManagedBanner');if(!c.bannerEnabled||!c.bannerText){if(bar)bar.remove();return}if(!bar){bar=document.createElement('div');bar.id='ntManagedBanner';bar.setAttribute('role','status');bar.style.cssText='background:#d4af37;color:#080808;text-align:center;padding:9px 14px;font:800 13px/1.3 Inter,system-ui,sans-serif;letter-spacing:.01em';document.body.prepend(bar)}bar.textContent=String(c.bannerText).slice(0,180)}
function infoBar(c){const nav=document.querySelector('nav');if(!nav)return;let bar=byId('ntManagedInfoBar');if(!c.infoBarEnabled){if(bar)bar.remove();return}if(!bar){bar=document.createElement('div');bar.id='ntManagedInfoBar';bar.style.cssText='background:#111;border-bottom:1px solid #2a2200;color:#aaa;text-align:center;padding:7px 14px;font:600 12px/1.3 Inter,system-ui,sans-serif';nav.parentNode.insertBefore(bar,nav)}bar.textContent=String(c.infoBarText||'').slice(0,140)}
function hero(c){const section=document.querySelector('.hero-bg');if(!section)return;section.style.display=c.heroEnabled===false?'none':'';if(c.heroEnabled===false)return;const badge=section.querySelector('span');if(badge)badge.textContent=c.heroBadge||'';const title=section.querySelector('.hero-title');if(title)title.textContent=c.heroTitle||'';const paragraph=section.querySelector('.hero-title + p');if(paragraph)paragraph.textContent=c.heroSubtitle||'';const links=[...section.querySelectorAll('a')];if(links[0]){links[0].textContent=c.heroPrimaryLabel||'Ver Productos';links[0].href=c.heroPrimaryHref||'#products'}if(links[1]){links[1].textContent=c.heroSecondaryLabel||'Explorar Categorías';links[1].href=c.heroSecondaryHref||'#categories'}}
function navigation(n){if(!n||!n.managed)return;const nav=document.querySelector('nav');if(!nav)return;nav.querySelectorAll('.mega').forEach(x=>x.style.display='none');const mobile=byId('mobileMenu');if(mobile)mobile.style.display='none';[...nav.querySelectorAll('a')].filter(a=>/Take Away/i.test(a.textContent||'')).forEach(a=>a.style.display='none');let bar=byId('ntManagedNavigation');if(!bar){bar=document.createElement('div');bar.id='ntManagedNavigation';bar.setAttribute('aria-label','Menú principal');bar.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:4px;padding:8px 12px;border-top:1px solid #2a2200;background:#0a0a0a';nav.appendChild(bar)}bar.innerHTML='';(n.items||[]).filter(x=>x.enabled!==false).sort((a,b)=>(a.order||0)-(b.order||0)).forEach(item=>{const a=document.createElement('a');a.href=item.href||'#';a.textContent=item.label||'Enlace';a.style.cssText='color:#cbb88a;text-decoration:none;font:700 13px/1.2 Inter,system-ui,sans-serif;padding:9px 12px;border-radius:9px';a.addEventListener('mouseenter',()=>a.style.color='#d4af37');a.addEventListener('mouseleave',()=>a.style.color='#cbb88a');bar.appendChild(a)})}
function contact(c){if(!c)return;document.querySelectorAll('a[href^="tel:"]').forEach(a=>{a.href='tel:'+c.phone;const span=a.querySelector('span');if(span)span.textContent=c.phone;else if(!a.querySelector('svg'))a.textContent=c.phone});document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{a.href='mailto:'+c.email;const text=[...a.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());if(text)text.textContent=' '+c.email;else if(!a.querySelector('svg'))a.textContent=c.email});const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){const t=node.nodeValue;if(!t||node.parentElement?.closest('script,style'))continue;if(/Lun\s*[–-]\s*Sáb/i.test(t)&&/\d{2}:\d{2}/.test(t))node.nodeValue=t.replace(/Lun\s*[–-]\s*Sáb[^\n|<]*/i,c.hours)}}
function features(f){if(!f)return;hideMatching('[onclick*="trainerModal"]',f.trainer!==false);hideMatching('[href="#trainer"]',f.trainer!==false);hideMatching('[onclick*="takeawayModal"]',f.takeaway!==false);hideMatching('[href="#takeaway"]',f.takeaway!==false);if(f.reviews===false)document.querySelectorAll('[id*="review" i],[class*="review" i]').forEach(x=>x.style.display='none');if(f.wishlist===false)document.querySelectorAll('[class*="wishlist" i],[data-wishlist]').forEach(x=>x.style.display='none');if(f.compare===false)document.querySelectorAll('[class*="compare" i],[data-compare]').forEach(x=>x.style.display='none');if(f.search===false){['navSearchWrapDesktop','mobileSearchInput'].forEach(id=>{const el=byId(id);if(el)(el.closest('div')||el).style.display='none'})}}
function footer(c){const footer=document.querySelector('footer');if(!footer||!c.footerAbout)return;const p=[...footer.querySelectorAll('p')].find(x=>/En Nutretium/i.test(x.textContent||''));if(p)p.textContent=c.footerAbout}
function payment(p){const btn=byId('redsysBtn'),label=byId('redsysBtnText');if(label&&p?.label)label.textContent=p.enabled===false?'Pago online no disponible':p.label;if(btn&&p?.enabled===false){btn.disabled=true;btn.setAttribute('aria-disabled','true')}}

/* FACTUSOL es la fuente autoritativa de precio/stock cuando el modo live está listo.
   products-data.js sigue siendo el fallback visual si el ERP no está disponible;
   el checkout permanece fail-closed y vuelve a validar contra FACTUSOL antes de cobrar. */
const FACTUSOL_ENDPOINT='/.netlify/functions/factusol-public-catalog';
const FACTUSOL_REFRESH_MS=60*1000;
let factusolTimer=null;
let factusolMap=new Map();
function catalogProducts(){return Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS:[]}
function factusolTracked(){return catalogProducts().filter(p=>p&&p.active!==false&&p.code&&typeof p.stock==='number')}
function overlayProduct(product){
  if(!product||!product.code)return product;
  const live=factusolMap.get(String(product.code));
  if(!live)return product;
  const available=Math.max(0,Number(live.available)||0);
  const price=Number(live.price);
  product.stock=live.blocked===true?0:available;
  if(Number.isFinite(price)&&price>=0)product.price=price;
  product._stockSource='factusol-live';
  product._stockCheckedAt=window.NUTRETIUM_FACTUSOL_LIVE_STATE?.checkedAt||null;
  return product;
}
function installFactusolHooks(){
  if(window.__NUTRETIUM_FACTUSOL_HOOKS__)return;
  window.__NUTRETIUM_FACTUSOL_HOOKS__=true;
  const originalInStock=window.inStock;
  if(typeof originalInStock==='function'){
    window.inStock=function(product){overlayProduct(product);return originalInStock(product)};
  }
  const originalRender=window.renderProducts;
  if(typeof originalRender==='function'){
    window.renderProducts=function(list){if(Array.isArray(list))list.forEach(overlayProduct);return originalRender.apply(this,arguments)};
  }
  const originalMini=window.miniCard;
  if(typeof originalMini==='function'){
    window.miniCard=function(product){overlayProduct(product);return originalMini.apply(this,arguments)};
  }
  const originalAdd=window.addToCart;
  if(typeof originalAdd==='function'){
    window.addToCart=function(productId){
      const product=catalogProducts().find(p=>Number(p.id)===Number(productId));
      if(product){overlayProduct(product);const live=factusolMap.get(String(product.code));if(live&&((live.blocked===true)||Number(live.available)<=0)){if(typeof window.showToast==='function')window.showToast(`${product.name} está agotado`);return}}
      return originalAdd.apply(this,arguments);
    };
  }
}
function applyFactusolPayload(data){
  window.NUTRETIUM_FACTUSOL_LIVE_STATE=data||null;
  if(!data||data.status!=='LIVE'||data.live!==true||data.authoritative!==true)return false;
  factusolMap=new Map((Array.isArray(data.items)?data.items:[]).map(item=>[String(item.code),item]));
  const missing=new Set(Array.isArray(data.missingCodes)?data.missingCodes.map(String):[]);
  for(const product of factusolTracked()){
    const live=factusolMap.get(String(product.code));
    if(live)overlayProduct(product);
    else if(missing.has(String(product.code))){product.stock=0;product._stockSource='factusol-live-missing';product._stockCheckedAt=data.checkedAt||null}
  }
  installFactusolHooks();
  try{if(typeof window.applyFilters==='function')window.applyFilters();else if(typeof window.renderProducts==='function')window.renderProducts(catalogProducts().filter(p=>p.active!==false))}catch(_){ }
  try{if(typeof window.renderNovedades==='function')window.renderNovedades()}catch(_){ }
  try{if(typeof window.renderRecomendados==='function')window.renderRecomendados()}catch(_){ }
  try{if(typeof window.updateCartUI==='function')window.updateCartUI()}catch(_){ }
  window.dispatchEvent(new CustomEvent('nutretium:factusol-stock-updated',{detail:data}));
  return true;
}
async function refreshFactusol(){
  const codes=factusolTracked().map(p=>String(p.code));
  if(!codes.length)return;
  try{
    const r=await fetch(FACTUSOL_ENDPOINT+'?codes='+encodeURIComponent(codes.join(',')),{cache:'no-store',headers:{Accept:'application/json'}});
    const data=await r.json().catch(()=>null);
    if(r.ok&&data)applyFactusolPayload(data);
  }catch(err){window.NUTRETIUM_FACTUSOL_LIVE_STATE={live:false,authoritative:false,status:'UNREACHABLE',checkedAt:new Date().toISOString()};console.warn('[FACTUSOL] disponibilidad live no accesible',err?.message||err)}
}
function startFactusol(){installFactusolHooks();refreshFactusol();clearInterval(factusolTimer);factusolTimer=setInterval(refreshFactusol,FACTUSOL_REFRESH_MS);window.addEventListener('focus',refreshFactusol);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshFactusol()})}
window.NUTRETIUM_FACTUSOL_REFRESH=refreshFactusol;

async function init(){
  startFactusol();
  try{const r=await fetch('/.netlify/functions/site-config',{cache:'no-store'});if(!r.ok)return;const d=await r.json();const c=d.content||{};managedBanner(c);infoBar(c);hero(c);navigation(d.navigation);contact(d.contact);features(d.features);footer(c);payment(d.payment);if(d.seo?.siteTitle)document.title=d.seo.siteTitle;if(d.seo?.metaDescription)ensureMeta('description').content=d.seo.metaDescription;window.NUTRETIUM_SITE_CONFIG=d;document.dispatchEvent(new CustomEvent('nutretium:site-config',{detail:d}))}catch(err){console.warn('[runtime-content] configuración no disponible',err?.message||err)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();