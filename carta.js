'use strict';

const DELIVERY_FEE = 2.99;
const DELIVERY_MINIMUM = 15;
const MENU_CATEGORIES = ['Todos','Bowls','Smoothies y batidos','Waffles y caprichos','Yogures','Café y matcha','Bebidas','Barritas y snacks'];
const products = (window.NUTRETIUM_PRODUCTS || []).filter(p => p.active !== false && Number(p.price) > 0);
const state = { category:'Todos', cart:new Map() };
const money = value => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value);
const $ = id => document.getElementById(id);

function visibleProducts(){
  return products.filter(p => state.category === 'Todos' || p.category === state.category);
}
function cartRows(){
  return [...state.cart.entries()].map(([id,qty]) => ({product:products.find(p=>String(p.id)===id),qty})).filter(x=>x.product);
}
function subtotal(){ return cartRows().reduce((sum,x)=>sum+Number(x.product.price)*x.qty,0); }
function renderCategories(){
  const available = MENU_CATEGORIES.filter(c => c==='Todos' || products.some(p=>p.category===c));
  $('categories').innerHTML = available.map(c=>`<button class="${c===state.category?'active':''}" data-category="${c}">${c}</button>`).join('');
  $('categories').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{state.category=btn.dataset.category;renderCategories();renderMenu();}));
}
function renderMenu(){
  const list=visibleProducts();
  $('categoryTitle').textContent=state.category==='Todos'?'Toda la carta':state.category;
  $('resultCount').textContent=`${list.length} opciones`;
  $('menu').innerHTML=list.length?list.map(p=>{
    const image=p.image?`<img class="product-image" src="/${String(p.image).replace(/^\//,'')}" alt="${escapeHtml(p.name)}" loading="lazy">`:'';
    return `<article class="product ${p.image?'':'no-image'}">${image}<a class="product-link" href="/producto/${productSlug(p)}" aria-label="Ver ${escapeHtml(p.name)}"></a><div class="product-content"><span class="tag">${escapeHtml(p.category||'Nutretium')}</span><h3><a href="/producto/${productSlug(p)}">${escapeHtml(p.name)}</a></h3><div class="product-meta"><span class="price">${money(p.price)}</span><button class="add" data-add="${p.id}" aria-label="Añadir ${escapeHtml(p.name)}">+</button></div></div></article>`;
  }).join(''):'<p class="loading">No hay productos disponibles en esta categoría.</p>';
  $('menu').querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>changeQty(btn.dataset.add,1)));
}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function productSlug(p){return `${slug(p.name)}-${String(p.code).toLowerCase()}`;}
function slug(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function changeQty(id,delta){
  id=String(id); const next=(state.cart.get(id)||0)+delta;
  if(next>0)state.cart.set(id,next);else state.cart.delete(id);
  renderCart();
}
function renderCart(){
  const rows=cartRows(), count=rows.reduce((s,x)=>s+x.qty,0), sub=subtotal();
  $('cartCount').textContent=count;$('floatingCount').textContent=count;$('floatingTotal').textContent=money(sub);$('floatingCart').hidden=!count;
  $('cartLines').innerHTML=rows.length?rows.map(({product:p,qty})=>`<div class="cart-line"><div><p>${escapeHtml(p.name)}</p><small>${money(p.price)} unidad</small></div><div class="qty"><button data-minus="${p.id}">−</button><b>${qty}</b><button data-plus="${p.id}">+</button></div></div>`).join(''):'<p class="empty">Tu pedido está vacío.</p>';
  $('cartLines').querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.minus,-1));
  $('cartLines').querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>changeQty(b.dataset.plus,1));
  const delivery=document.querySelector('[name="fulfillment"]:checked')?.value==='delivery';
  const fee=delivery&&sub>=DELIVERY_MINIMUM?DELIVERY_FEE:0;
  $('subtotal').textContent=money(sub);$('deliveryFee').textContent=fee?money(fee):'Gratis';$('grandTotal').textContent=money(sub+fee);
  $('addressFields').hidden=!delivery;
  [...$('addressFields').querySelectorAll('input')].forEach(i=>i.required=delivery);
}
function toggleCart(open){$('cartDrawer').classList.toggle('open',open);$('cartDrawer').setAttribute('aria-hidden',String(!open));$('drawerBackdrop').hidden=!open;document.body.style.overflow=open?'hidden':'';}

async function checkout(event){
  event.preventDefault(); const rows=cartRows(); if(!rows.length)return;
  const delivery=document.querySelector('[name="fulfillment"]:checked').value==='delivery';
  if(delivery&&subtotal()<DELIVERY_MINIMUM){$('checkoutError').textContent=`El pedido mínimo a domicilio es ${money(DELIVERY_MINIMUM)}.`;return;}
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const button=$('checkoutButton');button.disabled=true;$('checkoutError').textContent='';
  try{
    const response=await fetch('/.netlify/functions/stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:rows.map(x=>({id:x.product.id,code:x.product.code,qty:x.qty})),fulfillment:delivery?'delivery':'pickup',customer:data})});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'No se pudo iniciar el pago.');
    if(!body.url)throw new Error('Stripe no devolvió una página de pago.');window.location.assign(body.url);
  }catch(error){$('checkoutError').textContent=error.message;}finally{button.disabled=false;}
}

$('cartButton').onclick=()=>toggleCart(true);$('floatingCart').onclick=()=>toggleCart(true);$('closeCart').onclick=()=>toggleCart(false);$('drawerBackdrop').onclick=()=>toggleCart(false);
document.querySelectorAll('[name="fulfillment"]').forEach(r=>r.onchange=renderCart);$('checkoutForm').onsubmit=checkout;
renderCategories();renderMenu();renderCart();
