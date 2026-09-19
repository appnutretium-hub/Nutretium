/* NUTRETIUM Commerce Suite — integración de cuenta, checkout, cross-sell y analítica */
(function(){
'use strict';
const SESSION='nutretium_user';
const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}};
const consent=()=>{try{const raw=JSON.parse(localStorage.getItem('nutretium_cookies')||'null');return !!(raw&&raw.version===1&&raw.analitica===true)}catch{return false}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function track(name){try{if(consent())fetch('/.netlify/functions/analytics-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),keepalive:true}).catch(()=>{})}catch{}}

// Checkout único: conserva la función antigua en window como respaldo técnico.
if(typeof window.initiateRedsysPayment==='function') window.__legacyRedsysPayment=window.initiateRedsysPayment;
window.initiateRedsysPayment=function(){ if(typeof getCartItemCount==='function'&&getCartItemCount()<=0)return; location.href='/checkout.html'; };

// Analítica first-party, solo después de consentimiento.
if(typeof window.addToCart==='function'&&!window.addToCart.__suite){const original=window.addToCart;const wrapped=function(){const r=original.apply(this,arguments);track('add_to_cart');return r};wrapped.__suite=true;window.addToCart=wrapped;}

// Guarda carrito en servidor para cuentas autenticadas. El servidor vuelve a valorar precios.
function saveCartServer(){const s=session();if(!s?.token||typeof cart==='undefined')return;const items=Array.from(cart.values()).map(i=>({id:i.product.id,code:i.product.code,qty:i.quantity}));fetch('/.netlify/functions/saved-cart',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},body:JSON.stringify({items})}).catch(()=>{});}
if(typeof window.updateCartUI==='function'&&!window.updateCartUI.__suiteSave){const original=window.updateCartUI;const wrapped=function(){const r=original.apply(this,arguments);clearTimeout(window.__nutCartTimer);window.__nutCartTimer=setTimeout(saveCartServer,450);return r};wrapped.__suiteSave=true;window.updateCartUI=wrapped;}

// Reseñas: la sesión se manda al servidor para que pueda verificar la compra.
if(typeof window.submitReview==='function'){
  window.submitReview=async function(){
    const product=document.getElementById('reviewProduct')?.value||'';
    const author=document.getElementById('reviewAuthor')?.value.trim()||'';
    const text=document.getElementById('reviewText')?.value.trim()||'';
    const err=document.getElementById('reviewError');
    if(err)err.classList.add('hidden');
    const rating=typeof reviewStarValue!=='undefined'?reviewStarValue:0;
    if(!product||!rating||!author||!text){if(err){err.textContent='Completa producto, valoración, nombre y comentario.';err.classList.remove('hidden')}return;}
    try{
      const s=session();
      const r=await fetch('/.netlify/functions/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',token:s?.token||null,review:{author,product,rating,text}})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo enviar la reseña.');
      if(typeof closeModal==='function')closeModal('reviewModal');
      if(typeof showToast==='function')showToast(d.verifiedPurchase?'Reseña recibida · compra verificada':'Reseña recibida para moderación');
      if(typeof loadReviews==='function')setTimeout(loadReviews,250);
    }catch(e){if(err){err.textContent=e.message;err.classList.remove('hidden')}}
  };
}

async function decorateVerifiedReviews(){
  const grid=document.getElementById('reviewsGrid');if(!grid)return;
  try{const r=await fetch('/.netlify/functions/reviews?action=list');const d=await r.json();if(!r.ok||!Array.isArray(d.reviews))return;const verified=d.reviews.filter(x=>x.verifiedPurchase);if(!verified.length)return;grid.querySelectorAll(':scope > div').forEach(card=>{const text=card.textContent||'';const hit=verified.find(v=>text.includes(v.author)&&text.includes(v.product));if(hit&&!card.querySelector('[data-verified]')){const badge=document.createElement('span');badge.dataset.verified='1';badge.textContent='✓ Compra verificada';badge.style.cssText='display:inline-block;margin-top:6px;color:#d4af37;font-size:11px;font-weight:800';card.appendChild(badge)}})}catch{}
}

function addNavigation(){
  const profile=document.getElementById('profileDropdown');
  if(profile&&!profile.querySelector('[data-suite-account]')){
    const box=document.createElement('div');box.setAttribute('data-suite-account','1');box.innerHTML='<a href="/cuenta.html" class="block px-4 py-3 text-sm text-brand-muted hover:text-brand-gold">Mi Nutretium</a><a href="/smart-shop.html" class="block px-4 py-3 text-sm text-brand-muted hover:text-brand-gold">Recomendador y packs</a>';profile.prepend(box);
  }
  const footer=document.querySelector('footer');
  if(footer&&!footer.querySelector('[data-suite-links]')){
    const d=document.createElement('div');d.setAttribute('data-suite-links','1');d.style.cssText='max-width:1200px;margin:0 auto;padding:18px 20px;border-top:1px solid rgba(255,255,255,.07);display:flex;gap:18px;flex-wrap:wrap;font-size:13px';d.innerHTML='<a href="/cuenta.html" style="color:#d4af37">Mi Nutretium</a><a href="/smart-shop.html" style="color:#d4af37">Recomendador</a><a href="/checkout.html" style="color:#d4af37">Checkout</a><a href="/ayuda" style="color:#d4af37">Centro de ayuda</a>';footer.appendChild(d);
  }
  const btn=document.getElementById('redsysBtnText');if(btn)btn.textContent='Finalizar compra';
}

function crossSell(){
  const sidebar=document.getElementById('cartSidebar');if(!sidebar||sidebar.querySelector('#suiteCrossSell')||typeof PRODUCTS==='undefined')return;
  const target=document.getElementById('redsysBtn')?.parentElement||sidebar;
  const candidates=PRODUCTS.filter(p=>p.active!==false&&(p.stock==null||p.stock>0)&&['Creatinas','Barritas y snacks','Accesorios gym','Bebidas'].includes(p.category)).slice(0,3);
  if(!candidates.length)return;
  const box=document.createElement('div');box.id='suiteCrossSell';box.style.cssText='margin:14px 0;padding:14px;border:1px solid #2a2a2a;border-radius:14px;background:#101010';box.innerHTML='<p style="font-size:12px;font-weight:800;color:#d4af37;margin:0 0 10px">COMPLETA TU PEDIDO</p>'+candidates.map(p=>`<button data-suite-add="${p.id}" style="width:100%;display:flex;justify-content:space-between;background:none;color:#eee;border:0;padding:7px 0;cursor:pointer;text-align:left"><span>${esc(p.name)}</span><b>${Number(p.price).toFixed(2)} €</b></button>`).join('');target.parentElement?.insertBefore(box,target);box.querySelectorAll('[data-suite-add]').forEach(b=>b.onclick=()=>window.addToCart(Number(b.dataset.suiteAdd)));
}

function trustBar(){if(document.getElementById('suiteTrustBar'))return;const b=document.createElement('div');b.id='suiteTrustBar';b.style.cssText='background:#d4af37;color:#080808;text-align:center;padding:7px 12px;font-size:12px;font-weight:900;letter-spacing:.02em';b.textContent='Tienda física en Santander · Pago mediante Redsys · Atención Nutretium';document.body.prepend(b);}

document.addEventListener('DOMContentLoaded',()=>{trustBar();addNavigation();crossSell();setTimeout(decorateVerifiedReviews,900);if(location.search.includes('cart=1')&&typeof openCart==='function')setTimeout(openCart,200)});
})();
