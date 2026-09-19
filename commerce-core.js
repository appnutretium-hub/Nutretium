/* NUTRETIUM — Commerce Experience Layer
   Progressive enhancement over the existing storefront. It does not own prices,
   stock, payments or orders: those remain in the validated core/backend. */
(function () {
  'use strict';

  const STORAGE = { wishlist: 'nt_wishlist_v1', compare: 'nt_compare_v1', recent: 'nt_recent_products_v1', sort: 'nt_catalog_sort_v1' };
  const MAX_COMPARE = 3;
  const products = () => (Array.isArray(window.NUTRETIUM_PRODUCTS) ? window.NUTRETIUM_PRODUCTS.filter((p) => p && p.active !== false) : []);
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const slugify = (value) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const money = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
  const productUrl = (p) => `/producto/${slugify(p.name)}-${p.id}`;
  const safeParse = (raw, fallback) => { try { return JSON.parse(raw); } catch { return fallback; } };
  const readSet = (key) => new Set((safeParse(localStorage.getItem(key), []) || []).map(Number).filter(Number.isFinite));
  const writeSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (_) {} };

  let wishlist = readSet(STORAGE.wishlist);
  let compare = readSet(STORAGE.compare);
  let lastBaseList = products();
  let nativeRender = null;
  let catalogSort = localStorage.getItem(STORAGE.sort) || 'recommended';
  const catalogFlags = { inStock: false, favorites: false, featured: false };

  function track(name, payload) {
    const event = { event: `nt_${name}`, at: new Date().toISOString(), ...(payload || {}) };
    window.dataLayer = window.dataLayer || []; window.dataLayer.push(event);
    try { const history = safeParse(sessionStorage.getItem('nt_analytics_buffer_v1'), []) || []; history.push(event); sessionStorage.setItem('nt_analytics_buffer_v1', JSON.stringify(history.slice(-50))); } catch (_) {}
  }
  function getProduct(id) { return products().find((p) => Number(p.id) === Number(id)) || null; }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }

  function productIdFromCard(card) {
    const detail = card.querySelector('.nt-product-detail-link[href*="/producto/"]');
    if (detail) { const match = detail.getAttribute('href').match(/-(\d+)\/?$/); if (match) return Number(match[1]); }
    const button = [...card.querySelectorAll('button[onclick]')].find((b) => /(?:addToCart|openCustomModal)\((\d+)/.test(b.getAttribute('onclick') || ''));
    if (button) { const match = (button.getAttribute('onclick') || '').match(/(?:addToCart|openCustomModal)\((\d+)/); if (match) return Number(match[1]); }
    return null;
  }
  function setButtonState(button, active, activeLabel, inactiveLabel) {
    button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', active ? 'true' : 'false'); button.setAttribute('aria-label', active ? activeLabel : inactiveLabel);
  }
  function toggleWishlist(id) {
    const product = getProduct(id); if (!product) return;
    wishlist.has(id) ? wishlist.delete(id) : wishlist.add(id); writeSet(STORAGE.wishlist, wishlist); refreshCardActions(); updateToolbarCounters();
    track(wishlist.has(id) ? 'wishlist_add' : 'wishlist_remove', { product_id: id, product_name: product.name }); if (catalogFlags.favorites) rerenderLast();
  }
  function toggleCompare(id) {
    const product = getProduct(id); if (!product) return;
    if (compare.has(id)) compare.delete(id); else { if (compare.size >= MAX_COMPARE) { if (typeof window.showToast === 'function') window.showToast(`Puedes comparar hasta ${MAX_COMPARE} productos.`); return; } compare.add(id); }
    writeSet(STORAGE.compare, compare); refreshCardActions(); renderCompareBar(); track(compare.has(id) ? 'compare_add' : 'compare_remove', { product_id: id, product_name: product.name });
  }
  function enhanceCard(card) {
    const id = productIdFromCard(card); if (!id || card.querySelector('.nt-card-commerce-actions')) return;
    const product = getProduct(id); if (!product) return;
    const visual = card.querySelector('.relative') || card; if (getComputedStyle(visual).position === 'static') visual.style.position = 'relative';
    const actions = document.createElement('div'); actions.className = 'nt-card-commerce-actions';
    const fav = document.createElement('button'); fav.type = 'button'; fav.className = 'nt-icon-action'; fav.innerHTML = '<span aria-hidden="true">♡</span>';
    setButtonState(fav, wishlist.has(id), `Quitar ${product.name} de favoritos`, `Guardar ${product.name} en favoritos`); fav.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); toggleWishlist(id); });
    const cmp = document.createElement('button'); cmp.type = 'button'; cmp.className = 'nt-icon-action nt-compare-action'; cmp.innerHTML = '<span aria-hidden="true">⇄</span>';
    setButtonState(cmp, compare.has(id), `Quitar ${product.name} de la comparación`, `Comparar ${product.name}`); cmp.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); toggleCompare(id); });
    actions.append(fav, cmp); visual.appendChild(actions);
  }
  function refreshCardActions() {
    document.querySelectorAll('#productGrid .product-card').forEach((card) => { const id = productIdFromCard(card); if (!id) return; const buttons = card.querySelectorAll('.nt-card-commerce-actions button'); if (buttons[0]) setButtonState(buttons[0], wishlist.has(id), 'Quitar de favoritos', 'Guardar en favoritos'); if (buttons[1]) setButtonState(buttons[1], compare.has(id), 'Quitar de la comparación', 'Comparar producto'); });
  }
  function enhanceCards() { document.querySelectorAll('#productGrid .product-card').forEach(enhanceCard); refreshCardActions(); }

  function applyCommerceFilters(list) {
    let result = Array.isArray(list) ? [...list] : [];
    if (catalogFlags.inStock) result = result.filter((p) => typeof p.stock !== 'number' || p.stock > 0);
    if (catalogFlags.favorites) result = result.filter((p) => wishlist.has(Number(p.id)));
    if (catalogFlags.featured) result = result.filter((p) => p.featured === true || p.badge);
    switch (catalogSort) {
      case 'price-asc': result.sort((a, b) => Number(a.price) - Number(b.price)); break;
      case 'price-desc': result.sort((a, b) => Number(b.price) - Number(a.price)); break;
      case 'rating': result.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || Number(b.reviews || 0) - Number(a.reviews || 0)); break;
      case 'name': result.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')); break;
      default: break;
    }
    return result;
  }
  function wrapRendering() {
    if (typeof window.renderProducts !== 'function' || window.renderProducts.__ntCommerceWrapped) return;
    nativeRender = window.renderProducts;
    const wrapped = function (list) { lastBaseList = Array.isArray(list) ? [...list] : products(); const transformed = applyCommerceFilters(lastBaseList); nativeRender(transformed); requestAnimationFrame(() => { enhanceCards(); updateResultCount(transformed.length); }); };
    wrapped.__ntCommerceWrapped = true; window.renderProducts = wrapped; rerenderLast();
  }
  function rerenderLast() { if (typeof window.renderProducts === 'function') window.renderProducts(lastBaseList); }
  function makeToggle(label, key) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nt-toolbar-toggle'; button.dataset.flag = key; button.textContent = label; button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => { catalogFlags[key] = !catalogFlags[key]; button.classList.toggle('is-active', catalogFlags[key]); button.setAttribute('aria-pressed', catalogFlags[key] ? 'true' : 'false'); rerenderLast(); track('catalog_filter', { filter: key, active: catalogFlags[key] }); }); return button;
  }
  function insertToolbar() {
    const grid = document.getElementById('productGrid'); if (!grid || document.getElementById('ntCommerceToolbar')) return;
    const toolbar = document.createElement('div'); toolbar.id = 'ntCommerceToolbar'; toolbar.className = 'nt-commerce-toolbar';
    const left = document.createElement('div'); left.className = 'nt-commerce-toolbar-left'; left.append(makeToggle('En stock', 'inStock'), makeToggle('Favoritos', 'favorites'), makeToggle('Destacados', 'featured'));
    const right = document.createElement('div'); right.className = 'nt-commerce-toolbar-right'; const count = document.createElement('span'); count.id = 'ntResultCount'; count.className = 'nt-result-count';
    const label = document.createElement('label'); label.className = 'nt-sort-label'; label.textContent = 'Ordenar'; const select = document.createElement('select'); select.id = 'ntCatalogSort'; select.className = 'nt-sort-select';
    [['recommended','Recomendados'],['price-asc','Precio: menor a mayor'],['price-desc','Precio: mayor a menor'],['rating','Mejor valorados'],['name','Nombre A–Z']].forEach(([value,text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option); }); select.value = catalogSort;
    select.addEventListener('change', () => { catalogSort = select.value; try { localStorage.setItem(STORAGE.sort, catalogSort); } catch (_) {} rerenderLast(); track('catalog_sort', { sort: catalogSort }); }); label.appendChild(select); right.append(count, label); toolbar.append(left, right); grid.parentElement.insertBefore(toolbar, grid); updateToolbarCounters();
  }
  function updateResultCount(count) { const node = document.getElementById('ntResultCount'); if (node) node.textContent = `${Number.isFinite(count) ? count : document.querySelectorAll('#productGrid .product-card').length} productos`; }
  function updateToolbarCounters() { const button = document.querySelector('[data-flag="favorites"]'); if (button) button.textContent = `Favoritos${wishlist.size ? ` (${wishlist.size})` : ''}`; }

  function renderCompareBar() {
    let bar = document.getElementById('ntCompareBar'); if (!compare.size) { if (bar) bar.remove(); return; } if (!bar) { bar = document.createElement('div'); bar.id = 'ntCompareBar'; bar.className = 'nt-compare-bar'; document.body.appendChild(bar); }
    const selected = [...compare].map(getProduct).filter(Boolean); bar.innerHTML = '';
    const summary = document.createElement('div'); summary.className = 'nt-compare-summary'; const strong = document.createElement('strong'); strong.textContent = `${selected.length}/${MAX_COMPARE} para comparar`; const names = document.createElement('span'); names.textContent = selected.map((p) => p.name).join(' · '); summary.append(strong,names);
    const buttons = document.createElement('div'); const clear = document.createElement('button'); clear.type='button'; clear.className='nt-compare-clear'; clear.textContent='Vaciar'; clear.addEventListener('click',()=>{compare.clear();writeSet(STORAGE.compare,compare);refreshCardActions();renderCompareBar();}); const open=document.createElement('button');open.type='button';open.className='nt-compare-open';open.textContent='Comparar';open.addEventListener('click',openCompareModal);buttons.append(clear,open);bar.append(summary,buttons);
  }
  function openCompareModal() {
    const selected=[...compare].map(getProduct).filter(Boolean);if(!selected.length)return;let dialog=document.getElementById('ntCompareDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='ntCompareDialog';dialog.className='nt-compare-dialog';document.body.appendChild(dialog);}const rows=[['Precio',(p)=>money(p.price)],['Marca',(p)=>p.brand||'No indicada'],['Categoría',(p)=>p.category||'No indicada'],['Disponibilidad',(p)=>typeof p.stock==='number'?(p.stock>0?`${p.stock} uds.`:'Agotado'):'Consultar'],['Valoración',(p)=>Number(p.reviews||0)>0?`${Number(p.rating||0).toFixed(1)}/5 (${p.reviews})`:'Sin reseñas'],['Referencia',(p)=>p.code||'—']];dialog.innerHTML=`<div class="nt-compare-dialog-head"><div><span>Comparador Nutretium</span><h2>Compara antes de decidir</h2></div><button type="button" data-close aria-label="Cerrar">×</button></div><div class="nt-compare-scroll"><table><thead><tr><th>Característica</th>${selected.map((p)=>`<th>${escapeHtml(p.name)}<a href="${productUrl(p)}">Ver ficha</a></th>`).join('')}</tr></thead><tbody>${rows.map(([label,getter])=>`<tr><th>${label}</th>${selected.map((p)=>`<td>${escapeHtml(getter(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());dialog.showModal();track('compare_open',{products:selected.map((p)=>p.id)});
  }

  const aliases={prote:['proteina','proteinas','whey'],protein:['proteina','proteinas','whey'],whey:['proteina','proteinas','whey'],crea:['creatina','creatinas'],creatine:['creatina','creatinas'],pre:['pre-entreno','pre entreno','preentreno'],preworkout:['pre-entreno','pre entreno'],vitamina:['vitaminas','salud'],snack:['barritas','snacks'],barrita:['barritas','snacks']};
  function expandedTerms(query){const clean=normalize(query);const terms=new Set(clean.split(/\s+/).filter(Boolean));for(const term of [...terms])(aliases[term]||[]).forEach((alias)=>terms.add(alias));return[...terms];}
  function searchScore(product,query){const q=normalize(query);if(!q)return 0;const terms=expandedTerms(q),title=normalize(product.name),brand=normalize(product.brand),category=normalize(product.category),code=normalize(product.code);let score=0;if(title===q)score+=120;if(title.startsWith(q))score+=70;if(title.includes(q))score+=50;if(code===q)score+=100;if(code.includes(q))score+=45;if(brand.includes(q))score+=35;if(category.includes(q))score+=30;terms.forEach((term)=>{if(title.includes(term))score+=14;if(brand.includes(term))score+=10;if(category.includes(term))score+=8;});if(product.featured)score+=3;return score;}
  function autocompleteResults(query){return products().map((p)=>({p,score:searchScore(p,query)})).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score||Number(b.p.reviews||0)-Number(a.p.reviews||0)).slice(0,6).map((x)=>x.p);}
  function attachAutocomplete(input){if(!input||input.dataset.ntAutocomplete)return;input.dataset.ntAutocomplete='1';const holder=input.parentElement;if(!holder)return;holder.classList.add('nt-search-holder');const panel=document.createElement('div');panel.className='nt-search-suggestions';panel.hidden=true;holder.appendChild(panel);const close=()=>{panel.hidden=true;panel.innerHTML='';};const render=()=>{const query=input.value.trim();if(query.length<2){close();return;}const matches=autocompleteResults(query);panel.innerHTML='';if(!matches.length){const empty=document.createElement('div');empty.className='nt-search-empty';empty.textContent='No encontramos coincidencias directas.';panel.appendChild(empty);}else{matches.forEach((p)=>{const link=document.createElement('a');link.href=productUrl(p);link.className='nt-search-suggestion';const media=document.createElement('span');media.className='nt-search-thumb';if(p.image){const img=document.createElement('img');img.src=p.image;img.alt='';img.loading='lazy';media.appendChild(img);}else media.textContent=p.emoji||'📦';const copy=document.createElement('span');copy.className='nt-search-copy';const title=document.createElement('strong');title.textContent=p.name;const meta=document.createElement('small');meta.textContent=[p.brand,p.category].filter(Boolean).join(' · ');copy.append(title,meta);const price=document.createElement('b');price.textContent=money(p.price);link.append(media,copy,price);link.addEventListener('click',()=>track('search_select',{query,product_id:p.id}));panel.appendChild(link);});}panel.hidden=false;};input.addEventListener('input',render);input.addEventListener('focus',render);input.addEventListener('keydown',(event)=>{if(event.key==='Escape')close();});document.addEventListener('click',(event)=>{if(!holder.contains(event.target))close();});}
  function initAutocomplete(){['navSearchInput','mobileSearchInput','searchInput'].forEach((id)=>attachAutocomplete(document.getElementById(id)));}

  function recentIds(){return(safeParse(localStorage.getItem(STORAGE.recent),[])||[]).map(Number).filter(Number.isFinite);}
  function insertRecentProducts(){const productSection=document.getElementById('products');if(!productSection||document.getElementById('ntRecentProducts'))return;const recent=recentIds().map(getProduct).filter(Boolean).slice(0,6);if(!recent.length)return;const section=document.createElement('section');section.id='ntRecentProducts';section.className='nt-recent-section max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';const header=document.createElement('div');header.className='nt-recent-head';header.innerHTML='<div><span>Continúa donde lo dejaste</span><h2>Vistos recientemente</h2></div>';const grid=document.createElement('div');grid.className='nt-recent-grid';recent.forEach((p)=>{const link=document.createElement('a');link.href=productUrl(p);link.className='nt-recent-card';const visual=document.createElement('span');visual.className='nt-recent-visual';if(p.image){const img=document.createElement('img');img.src=p.image;img.alt=p.name;img.loading='lazy';visual.appendChild(img);}else visual.textContent=p.emoji||'📦';const copy=document.createElement('span');copy.className='nt-recent-copy';const title=document.createElement('strong');title.textContent=p.name;const meta=document.createElement('small');meta.textContent=`${p.category||'Catálogo'} · ${money(p.price)}`;copy.append(title,meta);link.append(visual,copy);grid.appendChild(link);});section.append(header,grid);productSection.insertAdjacentElement('beforebegin',section);}

  function upsertMeta(selector,attrs){let node=document.head.querySelector(selector);if(!node){node=document.createElement(attrs.tag||'meta');document.head.appendChild(node);}Object.entries(attrs).forEach(([key,value])=>{if(key!=='tag')node.setAttribute(key,value);});return node;}
  function updateSeoFromLocation(){const path=location.pathname.replace(/\/+$/,'');if(!path.startsWith('/categoria/'))return;const slug=decodeURIComponent(path.split('/').filter(Boolean)[1]||'');const category=(window.NUTRETIUM_CATEGORIES||[]).find((c)=>slugify(c)===slug);if(!category)return;document.title=`${category} | Nutretium`;const description=`Compra ${category.toLowerCase()} en Nutretium. Consulta disponibilidad, precios y catálogo actual en nuestra tienda online y física de Santander.`;upsertMeta('meta[name="description"]',{name:'description',content:description});let canonical=document.head.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}canonical.href=`https://nutretium.com/categoria/${slug}`;}
  function wrapCategoryNavigation(){if(typeof window.filterByCategory!=='function'||window.filterByCategory.__ntCommerceSeoWrapped)return;const original=window.filterByCategory;const wrapped=function(category){const result=original.apply(this,arguments);setTimeout(updateSeoFromLocation,0);track('category_view',{category:category||'Todos'});return result;};wrapped.__ntCommerceSeoWrapped=true;window.filterByCategory=wrapped;}
  function wrapCartTracking(){if(typeof window.addToCart!=='function'||window.addToCart.__ntTracked)return;const original=window.addToCart;const wrapped=function(id){const product=getProduct(id);const result=original.apply(this,arguments);if(product)track('add_to_cart',{product_id:product.id,product_name:product.name,price:product.price});return result;};wrapped.__ntTracked=true;window.addToCart=wrapped;}
  function handleProductPageQuantity(){const params=new URLSearchParams(location.search),raw=params.get('add');if(raw===null)return;const id=Number(raw),requested=Math.max(1,Math.min(20,Number(params.get('qty'))||1)),variantSku=(params.get('variantSku')||'').trim(),customization=variantSku?{variantSku}:null;if(!Number.isInteger(id)||id<1)return;setTimeout(()=>{if(typeof window.addToCart!=='function')return;for(let i=0;i<requested;i+=1)window.addToCart(id,customization);params.delete('add');params.delete('qty');params.delete('variantSku');const clean=params.toString()?location.pathname+'?'+params.toString()+location.hash:location.pathname+location.hash;history.replaceState(null,'',clean);},150);}
  function init(){handleProductPageQuantity();insertToolbar();wrapRendering();enhanceCards();initAutocomplete();renderCompareBar();insertRecentProducts();wrapCategoryNavigation();wrapCartTracking();updateSeoFromLocation();updateResultCount(document.querySelectorAll('#productGrid .product-card').length);window.addEventListener('popstate',()=>setTimeout(updateSeoFromLocation,0));window.NTCommerce=Object.freeze({track,productUrl,getWishlist:()=>[...wishlist],getComparison:()=>[...compare]});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,25));else setTimeout(init,25);
})();
