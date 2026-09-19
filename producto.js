'use strict';
const products=(window.NUTRETIUM_PRODUCTS||[]).filter(p=>p.active!==false);
const money=v=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(v);
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const productSlug=p=>`${slug(p.name)}-${String(p.code).toLowerCase()}`;
const params=new URLSearchParams(location.search);const requested=decodeURIComponent(params.get('slug')||params.get('id')||location.pathname.split('/').filter(Boolean).pop()||'');
const product=products.find(p=>productSlug(p)===requested||String(p.id)===requested||String(p.code).toLowerCase()===requested.toLowerCase());
const view=document.getElementById('productView');
function sizeOf(name){const m=String(name).match(/(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g)\b/i);return m?`${m[1]} ${m[2]}`:null;}
function familyOf(name){return slug(String(name).replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g)\b/ig,''));}
if(!product){view.innerHTML='<div class="not-found"><h1>Producto no encontrado</h1><p>Puede que ya no esté disponible.</p><a class="cta" href="/carta.html">Ver la carta</a></div>';}else{
 const variants=products.filter(p=>p.category===product.category&&familyOf(p.name)===familyOf(product.name));
 const visual=product.image?`<img src="/${esc(String(product.image).replace(/^\//,''))}" alt="${esc(product.name)}">`:`<span>${esc(product.emoji||'N')}</span>`;
 const description=product.description||`Consulta disponibilidad y composición de ${product.name} directamente con el equipo Nutretium antes de finalizar tu pedido.`;
 document.title=`${product.name} | Nutretium`;
 view.innerHTML=`<article class="detail"><div class="visual">${visual}</div><div class="info"><a class="crumb" href="/categoria.html?slug=${encodeURIComponent(slug(product.category))}">${esc(product.category)}</a><h1>${esc(product.name)}</h1>${product.brand?`<p class="brand">${esc(product.brand)}</p>`:''}<p class="price">${money(product.price)}</p><p class="description">${esc(description)}</p><div class="facts"><div class="fact"><small>Código</small><strong>${esc(product.code)}</strong></div><div class="fact"><small>Disponibilidad</small><strong>${product.stock===0?'Agotado':'Disponible'}</strong></div>${sizeOf(product.name)?`<div class="fact"><small>Tamaño</small><strong>${esc(sizeOf(product.name))}</strong></div>`:''}<div class="fact"><small>Preparación</small><strong>${product.stock==null?'Al momento':'Producto en tienda'}</strong></div></div>${variants.length>1?`<section class="variants"><h2>TAMAÑOS DISPONIBLES</h2><div class="variant-list">${variants.map(v=>`<a class="${v.id===product.id?'current':''}" href="/producto.html?slug=${encodeURIComponent(productSlug(v))}">${esc(sizeOf(v.name)||v.name)} · ${money(v.price)}</a>`).join('')}</div></section>`:''}<a class="cta" href="/carta.html?add=${encodeURIComponent(product.id)}">Añadir al pedido</a></div></article>`;
}
