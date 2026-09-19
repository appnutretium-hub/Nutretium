/* NUTRETIUM — ficha individual de producto sobre PIM normalizado */
(function(){
  'use strict';

  const app = document.getElementById('app');
  const rawProducts = Array.isArray(window.NUTRETIUM_PRODUCTS)
    ? window.NUTRETIUM_PRODUCTS.filter(p => p.active !== false)
    : [];
  const pim = window.NUTRETIUM_PIM || null;
  const variantsApi = window.NUTRETIUM_VARIANTS || null;
  const products = rawProducts.map(p => pim?.normalize ? pim.normalize(p) : p);
  const RECENT_KEY = 'nutretium_recent_v1';
  const CART_KEY = 'nutretium_cart_v1';

  const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const slugify = pim?.slugify || ((v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''));
  const productUrl = (p) => `/producto/${slugify(p.name)}-${p.id}`;

  function idFromPath(){
    const last = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    const match = last.match(/-(\d+)$/);
    return match ? Number(match[1]) : Number(new URLSearchParams(location.search).get('id'));
  }

  function remember(id){
    try {
      const old = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      const next = [Number(id), ...old.map(Number).filter(x => x !== Number(id) && Number.isFinite(x))].slice(0,8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* optional */ }
  }

  function injectJsonLd(id, data){
    const old = document.getElementById(id);
    if (old) old.remove();
    const script=document.createElement('script');
    script.id=id; script.type='application/ld+json'; script.textContent=JSON.stringify(data);
    document.head.appendChild(script);
  }

  function addStructuredData(product, available){
    const productSchema = {
      '@context':'https://schema.org', '@type':'Product',
      name:product.name,
      sku:product.sku || product.code || undefined,
      gtin:product.gtin || undefined,
      brand: product.brand ? {'@type':'Brand',name:product.brand} : undefined,
      manufacturer: product.manufacturer ? {'@type':'Organization',name:product.manufacturer} : undefined,
      description:product.description || variantsApi?.factualDescription(product) || `${product.name} disponible en Nutretium Santander.`,
      image:(product.images || []).map(src => new URL('/' + src.replace(/^\//,''), location.origin).href),
      offers:{'@type':'Offer',priceCurrency:'EUR',price:Number(product.price).toFixed(2),availability:available?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:new URL(productUrl(product),location.origin).href,itemCondition:'https://schema.org/NewCondition'}
    };
    if (!productSchema.image.length) delete productSchema.image;
    Object.keys(productSchema).forEach(k => productSchema[k] === undefined && delete productSchema[k]);
    injectJsonLd('nt-product-schema', productSchema);
    injectJsonLd('nt-breadcrumb-schema', {
      '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
        {'@type':'ListItem',position:1,name:'Inicio',item:new URL('/',location.origin).href},
        {'@type':'ListItem',position:2,name:product.category || 'Catálogo',item:new URL(`/categoria/${slugify(product.category || 'catalogo')}`,location.origin).href},
        {'@type':'ListItem',position:3,name:product.name,item:new URL(productUrl(product),location.origin).href}
      ]
    });
  }

  function loadCart(){
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function addSelectedToCart(product, qty){
    const max = typeof product.stock === 'number' ? Math.max(0, product.stock) : 99;
    const quantity = Math.max(1, Math.min(max || 1, Number(qty) || 1));
    const cart = loadCart();
    const idx = cart.findIndex(row => Number(row.id) === Number(product.id) && !row.customization);
    if (idx >= 0) cart[idx].quantity = Math.min(max || 99, Math.max(1, Number(cart[idx].quantity || 1) + quantity));
    else cart.push({ key:String(product.id), id:Number(product.id), quantity, customization:null });
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart.slice(0,100))); } catch { /* ignore */ }
    location.href = '/?cart=1#products';
  }
  window.ntAddProductToCart = addSelectedToCart;

  function unique(values){ return [...new Set(values.filter(Boolean))]; }

  function variantSelectorHtml(product, familyRows){
    const currentMeta = variantsApi?.meta(product) || product;
    if (!familyRows || familyRows.length <= 1) return `<div class="selector-box"><div class="selector-group"><span class="selector-label">Formato</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(currentMeta.size || 'Formato único')}</span></div></div></div>`;
    const flavors = unique(familyRows.map(r => r.meta.flavor));
    const sizes = unique(familyRows.map(r => r.meta.size));
    let html = '<div class="selector-box">';
    if (flavors.length > 1) {
      html += `<div class="selector-group"><span class="selector-label">${escapeHtml(currentMeta.flavorLabel || 'Sabor')}</span><div class="variant-grid">`;
      html += flavors.map(flavor => {
        const row = familyRows.find(r => r.meta.flavor === flavor && (!currentMeta.size || r.meta.size === currentMeta.size)) || familyRows.find(r => r.meta.flavor === flavor);
        const active = currentMeta.flavor === flavor;
        const unavailable = typeof row?.product?.stock === 'number' && row.product.stock <= 0;
        return `<a class="variant-option ${active ? 'active' : ''} ${unavailable ? 'disabled' : ''}" href="${row ? productUrl(row.product) : '#'}">${escapeHtml(flavor)}${unavailable ? ' · agotado' : ''}</a>`;
      }).join('');
      html += '</div></div>';
    } else if (flavors.length === 1) html += `<div class="selector-group"><span class="selector-label">${escapeHtml(currentMeta.flavorLabel || 'Sabor')}</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(flavors[0])}</span></div></div>`;
    if (sizes.length > 1) {
      html += '<div class="selector-group"><span class="selector-label">Tamaño / formato</span><div class="variant-grid">';
      html += sizes.map(size => {
        const row = familyRows.find(r => r.meta.size === size && (!currentMeta.flavor || r.meta.flavor === currentMeta.flavor)) || familyRows.find(r => r.meta.size === size);
        const active = currentMeta.size === size;
        const unavailable = typeof row?.product?.stock === 'number' && row.product.stock <= 0;
        return `<a class="variant-option ${active ? 'active' : ''} ${unavailable ? 'disabled' : ''}" href="${row ? productUrl(row.product) : '#'}">${escapeHtml(size)}${unavailable ? ' · agotado' : ''}</a>`;
      }).join('');
      html += '</div></div>';
    } else if (sizes.length === 1) html += `<div class="selector-group"><span class="selector-label">Tamaño / formato</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(sizes[0])}</span></div></div>`;
    return html + '</div>';
  }

  function fact(value, fallback='No indicado en el catálogo'){ return value ? escapeHtml(Array.isArray(value) ? value.join(', ') : value) : fallback; }

  const id = idFromPath();
  const product = products.find(p => Number(p.id) === id);
  if (!product) {
    app.innerHTML = '<div class="error"><h1>Producto no disponible</h1><p>Este producto no existe, no está publicado o ha sido retirado del catálogo.</p><p><a class="back" href="/#products">Volver al catálogo</a></p></div>';
    document.title = 'Producto no disponible | NUTRETIUM';
    return;
  }

  remember(product.id);
  document.title = `${product.name} | NUTRETIUM`;
  const meta = document.querySelector('meta[name="description"]') || document.head.appendChild(document.createElement('meta'));
  meta.name = 'description';
  meta.content = (product.description || variantsApi?.factualDescription(product) || `${product.name}. Precio, disponibilidad y ficha en Nutretium Santander.`).slice(0,155);
  let canonical=document.querySelector('link[rel="canonical"]');
  if(!canonical){ canonical=document.createElement('link'); canonical.rel='canonical'; document.head.appendChild(canonical); }
  canonical.href=new URL(productUrl(product),location.origin).href;

  const gallery = product.images || (product.image ? [product.image] : []);
  const image = gallery.length
    ? `<img id="mainProductImage" src="/${escapeHtml(gallery[0])}" alt="${escapeHtml(product.name)}"/><div class="gallery">${gallery.map((src,i)=>`<button type="button" class="${i===0?'active':''}" data-gallery-src="/${escapeHtml(src)}" aria-label="Ver imagen ${i+1} de ${escapeHtml(product.name)}"><img src="/${escapeHtml(src)}" alt=""/></button>`).join('')}</div>`
    : `<div class="emoji">${escapeHtml(product.emoji || '📦')}</div>`;
  const stockKnown = typeof product.stock === 'number';
  const available = !stockKnown || product.stock > 0;
  const stockText = stockKnown ? (product.stock > 0 ? `${product.stock} uds. registradas en stock` : 'Agotado actualmente') : 'Consulta disponibilidad actual';
  addStructuredData(product, available);

  const currentMeta = variantsApi?.meta(product) || product;
  const familyRows = variantsApi?.family(product, products) || [{ product, meta:currentMeta }];
  const description = product.description || variantsApi?.factualDescription(product) || 'Producto disponible en el catálogo Nutretium.';
  const detailItems = [
    ['Marca', product.brand || null], ['Fabricante', product.manufacturer || null], ['Categoría', product.category || null],
    ['Referencia / SKU', product.sku || product.code || null], ['EAN / GTIN', product.gtin || null],
    ['Familia', currentMeta.familyLabel || product.name], ['Sabor / variedad', currentMeta.flavor || null], ['Formato', currentMeta.size || product.pdfDescription || null]
  ];
  const related = products.filter(p => p.id !== product.id && p.category === product.category && (typeof p.stock !== 'number' || p.stock > 0)).slice(0,4);
  const maxQty = typeof product.stock === 'number' ? Math.max(1, product.stock) : 99;
  const compositionKnown = Boolean(product.ingredients || product.allergens || product.nutrition || product.directions || product.warnings);

  app.innerHTML = `
    <div class="crumb"><a href="/">Inicio</a> · <a href="/categoria/${slugify(product.category || 'catalogo')}">${escapeHtml(product.category || 'Catálogo')}</a> · ${escapeHtml(product.name)}</div>
    <section class="product">
      <div class="visual">${image}</div>
      <div>
        <span class="eyebrow">${escapeHtml(product.brand || product.category || 'Nutretium')}</span>
        <h1 class="title">${escapeHtml(product.name)}</h1>
        <div class="meta">${product.brand ? `<a class="pill" href="/marca/${slugify(product.brand)}">Marca: ${escapeHtml(product.brand)}</a>` : ''}${product.sku || product.code ? `<span class="pill">Ref. ${escapeHtml(product.sku || product.code)}</span>` : ''}<span class="pill">${escapeHtml(product.category || 'Catálogo')}</span></div>
        <div class="price">€${Number(product.price).toFixed(2)}</div>
        <div class="stock ${available ? 'ok' : ''}">${escapeHtml(stockText)}</div>
        <p class="desc">${escapeHtml(description)}</p>
        ${variantSelectorHtml(product, familyRows)}
        <div class="selector-box"><div class="selector-group"><span class="selector-label">Cantidad</span><div class="quantity-row"><button class="qty-btn" type="button" id="qtyMinus" aria-label="Reducir cantidad">−</button><input class="qty-input" id="qtyInput" type="number" value="1" min="1" max="${maxQty}" inputmode="numeric" aria-label="Cantidad" /><button class="qty-btn" type="button" id="qtyPlus" aria-label="Aumentar cantidad">+</button></div>${stockKnown ? `<div class="notice">Máximo disponible para este SKU: ${Math.max(0, product.stock)} uds.</div>` : ''}</div></div>
        <div class="buy">${available ? `<button class="primary" id="addToCartBtn" type="button">Añadir al carrito</button>` : '<button class="primary" disabled type="button">Producto agotado</button>'}<a class="secondary" href="tel:+34633753517">Consultar al equipo</a></div>
        <div class="trust"><div><strong>Tienda física</strong><span>C/ La Albericia 1 · Santander</span></div><div><strong>Pago</strong><span>Tarjeta mediante Redsys</span></div><div><strong>Pedido</strong><span>Confirmación tras pago autorizado</span></div><div><strong>Atención directa</strong><span>633 753 517</span></div></div>
      </div>
    </section>
    <section class="details"><h2>Descripción y datos del producto</h2><div class="detail-grid">${detailItems.map(([label,value]) => `<div class="detail ${value?'':'pending'}"><strong>${escapeHtml(label)}</strong><span>${value ? escapeHtml(value) : 'Pendiente de documentación verificada.'}</span></div>`).join('')}<div class="detail ${compositionKnown?'':'pending'}"><strong>Ingredientes</strong><span>${fact(product.ingredients,'Pendiente de documentación verificada del fabricante.')}</span></div><div class="detail ${product.allergens?'':'pending'}"><strong>Alérgenos</strong><span>${fact(product.allergens,'Pendiente de documentación verificada del fabricante.')}</span></div><div class="detail ${product.nutrition?'':'pending'}"><strong>Información nutricional</strong><span>${fact(product.nutrition,'Pendiente de documentación verificada del fabricante.')}</span></div><div class="detail ${product.directions?'':'pending'}"><strong>Modo de empleo</strong><span>${fact(product.directions,'Consulta el etiquetado vigente. Información estructurada pendiente.')}</span></div><div class="detail ${product.warnings?'':'pending'}"><strong>Advertencias</strong><span>${fact(product.warnings,'Consulta las advertencias del etiquetado vigente del producto.')}</span></div><div class="detail"><strong>Disponibilidad</strong><span>${escapeHtml(stockText)}</span></div></div></section>
    ${related.length ? `<section class="details"><h2>También puedes consultar</h2><div class="detail-grid">${related.map(p=>`<a class="detail" style="text-decoration:none" href="${productUrl(p)}"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.brand || p.category)} · €${Number(p.price).toFixed(2)}</span></a>`).join('')}</div></section>` : ''}
    <footer class="foot">Nutretium es un establecimiento de BAHÍA NORTE CAPITAL, S.L. · NIF B27659754 · C/ La Albericia 1, Santander. La información específica de composición y uso debe contrastarse con el etiquetado vigente cuando corresponda. <a class="back" href="/ayuda">Centro de ayuda</a></footer>`;

  const qtyInput = document.getElementById('qtyInput');
  const clampQty = () => { const value = Math.max(1, Math.min(maxQty, Number(qtyInput.value) || 1)); qtyInput.value = String(value); return value; };
  document.getElementById('qtyMinus')?.addEventListener('click', () => { qtyInput.value = String(Math.max(1, clampQty() - 1)); });
  document.getElementById('qtyPlus')?.addEventListener('click', () => { qtyInput.value = String(Math.min(maxQty, clampQty() + 1)); });
  qtyInput?.addEventListener('change', clampQty);
  document.getElementById('addToCartBtn')?.addEventListener('click', () => addSelectedToCart(product, clampQty()));
  document.querySelectorAll('[data-gallery-src]').forEach(btn => btn.addEventListener('click', () => {
    const main = document.getElementById('mainProductImage');
    if (main) main.src = btn.dataset.gallerySrc;
    document.querySelectorAll('[data-gallery-src]').forEach(x => x.classList.toggle('active', x === btn));
  }));
})();
