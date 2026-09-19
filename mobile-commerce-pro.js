/* NUTRETIUM — Mobile Commerce PRO
   Repara la relación tarjeta/SKU y optimiza compra táctil sin depender del orden del DOM. */
(function(){
'use strict';
const CART_KEY='nutretium_cart_v1';
const slugify=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const productUrl=p=>`/producto/${slugify(p.name)}-${p.id}`;
const catalog=()=>Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS:[];
function loadCss(){if(document.querySelector('link[href="/mobile-commerce-pro.css"]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/mobile-commerce-pro.css';document.head.appendChild(l);}
function productIdFromCard(card){
  const add=card.querySelector('.add-to-cart-btn[onclick*="addToCart"]');
  const custom=card.querySelector('.add-to-cart-btn[onclick*="openCustomModal"]');
  const source=add||custom;
  const m=source?.getAttribute('onclick')?.match(/(?:addToCart|openCustomModal)\((\d+)\)/);
  if(m)return Number(m[1]);
  const existing=card.querySelector('[data-product-id]');if(existing?.dataset.productId)return Number(existing.dataset.productId);
  return null;
}
function repairCard(card){
  const id=productIdFromCard(card);if(!Number.isFinite(id))return;
  const product=catalog().find(p=>Number(p.id)===id);if(!product)return;
  card.dataset.productId=String(id);
  const body=card.querySelector('.p-5');if(!body)return;
  const purchase=[...body.querySelectorAll('div.flex.items-center.justify-between')].pop();
  if(purchase){
    purchase.classList.add('nt-mobile-purchase');
    const price=purchase.querySelector('.text-2xl');if(price)price.classList.add('nt-mobile-price');
    const actions=purchase.lastElementChild;if(actions){actions.classList.add('nt-mobile-actions');
      let detail=actions.querySelector('.nt-product-detail-link');
      if(!detail){detail=document.createElement('a');detail.className='nt-product-detail-link';actions.prepend(detail);}
      detail.href=productUrl(product);detail.textContent='Ver ficha';detail.setAttribute('aria-label',`Ver ficha de ${product.name}`);
      const add=actions.querySelector('.add-to-cart-btn');if(add){add.dataset.productId=String(id);add.setAttribute('aria-label',product.customizable?`Personalizar ${product.name}`:`Añadir ${product.name} al carrito`);}
    }
  }
  const title=card.querySelector('h3');if(title){let a=title.querySelector('a');if(!a){a=document.createElement('a');a.className='nt-card-title-link';a.textContent=title.textContent;title.textContent='';title.appendChild(a);}a.href=productUrl(product);}
  let wish=card.querySelector('.nt-wish-btn');if(wish){wish.dataset.productId=String(id);wish.setAttribute('aria-label',`Guardar ${product.name} en favoritos`);wish.onclick=e=>{e.preventDefault();e.stopPropagation();if(typeof window.toggleWishlist==='function')window.toggleWishlist(id);};}
  let compare=card.querySelector('.nt-compare-btn');if(compare){compare.dataset.productId=String(id);compare.onclick=e=>{e.preventDefault();e.stopPropagation();if(typeof window.ntToggleCompare==='function')window.ntToggleCompare(id);};}
}
function repairAll(){document.querySelectorAll('#productGrid .product-card').forEach(repairCard);updateDockCart();}
function cartCount(){try{const rows=JSON.parse(localStorage.getItem(CART_KEY)||'[]');return Array.isArray(rows)?rows.reduce((n,r)=>n+Math.max(0,Number(r.quantity)||0),0):0}catch{return 0}}
function updateDockCart(){const b=document.getElementById('ntDockCartBadge');if(!b)return;const n=typeof getCartItemCount==='function'?getCartItemCount():cartCount();b.textContent=n>99?'99+':String(n);b.hidden=n<=0;}
function enhanceDock(){
  const dock=document.getElementById('ntMobileDock');if(!dock||dock.dataset.purchaseReady==='1')return;dock.dataset.purchaseReady='1';
  const buy=[...dock.querySelectorAll('a')].find(a=>(a.textContent||'').trim()==='Comprar');if(!buy)return;
  const btn=document.createElement('button');btn.type='button';btn.id='ntDockCart';btn.innerHTML='<span>Carrito</span><span id="ntDockCartBadge" class="nt-dock-cart-badge" hidden>0</span>';btn.setAttribute('aria-label','Abrir carrito');btn.onclick=()=>{if(typeof openCart==='function')openCart();else location.href='/?cart=1#products';};buy.replaceWith(btn);updateDockCart();
}
let confirmTimer;
function showAdded(product){
  if(!window.matchMedia('(max-width:767px)').matches)return;
  let el=document.getElementById('ntMobileCartConfirm');if(!el){el=document.createElement('div');el.id='ntMobileCartConfirm';el.className='nt-mobile-cart-confirm';el.innerHTML='<div><strong></strong><span>Añadido al carrito</span></div><button type="button">Ver carrito</button>';el.querySelector('button').onclick=()=>{if(typeof openCart==='function')openCart();};document.body.appendChild(el);}
  el.querySelector('strong').textContent=product?.name||'Producto';el.classList.add('show');clearTimeout(confirmTimer);confirmTimer=setTimeout(()=>el.classList.remove('show'),2600);
}
function wrapAddToCart(){
  if(typeof window.addToCart!=='function'||window.addToCart.__ntMobilePro)return;
  const original=window.addToCart;
  const wrapped=function(id){const before=typeof getCartItemCount==='function'?getCartItemCount():cartCount();const r=original.apply(this,arguments);const after=typeof getCartItemCount==='function'?getCartItemCount():cartCount();repairAll();if(after>before){const p=catalog().find(x=>Number(x.id)===Number(id));showAdded(p);}return r;};wrapped.__ntMobilePro=true;window.addToCart=wrapped;
}
function wrapUpdateCart(){if(typeof window.updateCartUI!=='function'||window.updateCartUI.__ntMobilePro)return;const old=window.updateCartUI;const fn=function(){const r=old.apply(this,arguments);updateDockCart();return r;};fn.__ntMobilePro=true;window.updateCartUI=fn;}
function observeGrid(){const g=document.getElementById('productGrid');if(!g)return;let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;repairAll();});}).observe(g,{childList:true,subtree:true});}
function removeStaleMobileNoise(){
  // Si la capa de hardening no llegó a retirar Take Away, se evita enlazarlo desde móvil.
  document.querySelectorAll('#mobileMenu a[href="#takeaway"],#mobileMenu [onclick*="takeawayModal"]').forEach(el=>el.remove());
}
function init(){loadCss();wrapAddToCart();wrapUpdateCart();repairAll();enhanceDock();removeStaleMobileNoise();observeGrid();setTimeout(()=>{repairAll();enhanceDock();},450);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,260),{once:true});else setTimeout(init,260);
})();
