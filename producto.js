/* NUTRETIUM — ficha individual de producto con variantes reales */
(function(){
  'use strict';

  const app = document.getElementById('app');
  const products = Array.isArray(window.NUTRETIUM_PRODUCTS)
    ? window.NUTRETIUM_PRODUCTS.filter(p => p.active !== false)
    : [];
  const variantsApi = window.NUTRETIUM_VARIANTS || null;
  const RECENT_KEY = 'nutretium_recent_v1';
  const CART_KEY = 'nutretium_cart_v1';

  const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const slugify = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
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

  function addStructuredData(product, available){
    const data = {
      '@context':'https://schema.org', '@type':'Product',
      name:product.name,
      sku:product.code || undefined,
      brand: product.brand ? {'@type':'Brand',name:product.brand} : undefined,
      description:product.description || variantsApi?.factualDescription(product) || `${product.name} disponible en Nutretium Santander.`,
      image:product.image ? new URL('/' + product.image, location.origin).href : undefined,
      offers:{'@type':'Offer',priceCurrency:'EUR',price:Number(product.price).toFixed(2),availability:available?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:location.href}
    };
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const script=document.createElement('script'); script.type='application/ld+json'; script.textContent=JSON.stringify(data); document.head.appendChild(script);
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
    if (idx >= 0) {
      cart[idx].quantity = Math.min(max || 99, Math.max(1, Number(cart[idx].quantity || 1) + quantity));
    } else {
      cart.push({ key:String(product.id), id:Number(product.id), quantity, customization:null });
    }
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart.slice(0,100))); } catch { /* ignore */ }
    location.href = '/?cart=1#products';
  }
  window.ntAddProductToCart = addSelectedToCart;

  function unique(values){ return [...new Set(values.filter(Boolean))]; }

  function variantSelectorHtml(product, familyRows){
    const currentMeta = variantsApi?.meta(product) || {};
    if (!familyRows || familyRows.length <= 1) {
      return `<div class="selector-box"><div class="selector-group"><span class="selector-label">Formato</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(currentMeta.size || 'Formato único')}</span></div></div></div>`;
    }

    const flavors = unique(familyRows.map(r => r.meta.flavor));
    const sizes = unique(familyRows.map(r => r.meta.size));
    let html = '<div class="selector-box">';

    if (flavors.length > 1) {
      html += `<div class="selector-group"><span class="selector-label">${escapeHtml(currentMeta.flavorLabel || 'Sabor')}</span><div class="variant-grid">`;
      html += flavors.map(flavor => {
        const row = familyRows.find(r => r.meta.flavor === flavor && (!currentMeta.size || r.meta.size === currentMeta.size))
          || familyRows.find(r => r.meta.flavor === flavor);
        const active = currentMeta.flavor === flavor;
        const unavailable = typeof row?.product?.stock === 'number' && row.product.stock <= 0;
        return `<a class="variant-option ${active ? 'active' : ''} ${unavailable ? 'disabled' : ''}" href="${row ? productUrl(row.product) : '#'}">${escapeHtml(flavor)}${unavailable ? ' · agotado' : ''}</a>`;
      }).join('');
      html += '</div></div>';
    } else if (flavors.length === 1) {
      html += `<div class="selector-group"><span class="selector-label">${escapeHtml(currentMeta.flavorLabel || 'Sabor')}</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(flavors[0])}</span></div></div>`;
    }

    if (sizes.length > 1) {
      html += `<div class="selector-group"><span class="selector-label">Tamaño / formato</span><div class="variant-grid">`;
      html += sizes.map(size => {
        const row = familyRows.find(r => r.meta.size === size && (!currentMeta.flavor || r.meta.flavor === currentMeta.flavor))
          || familyRows.find(r => r.meta.size === size);
        const active = currentMeta.size === size;
        const unavailable = typeof row?.product?.stock === 'number' && row.product.stock <= 0;
        return `<a class="variant-option ${active ? 'active' : ''} ${unavailable ? 'disabled' : ''}" href="${row ? productUrl(row.product) : '#'}">${escapeHtml(size)}${unavailable ? ' · agotado' : ''}</a>`;
      }).join('');
      html += '</div></div>';
    } else if (sizes.length === 1) {
      html += `<div class="selector-group"><span class="selector-label">Tamaño / formato</span><div class="variant-grid"><span class="variant-option active">${escapeHtml(sizes[0])}</span></div></div>`;
    }

    html += '</div>';
    return html;
  }

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
  meta.content = product.description ? String(product.description).slice(0,155) : (variantsApi?.factualDescription(product) || `${product.name}. Precio, disponibilidad y ficha en Nutretium Santander.`).slice(0,155);
  let canonical=document.querySelector('link[rel="canonical"]');
  if(!canonical){ canonical=document.createElement('link'); canonical.rel='canonical'; document.head.appendChild(canonical); }
  canonical.href=new URL(productUrl(product),location.origin).href;

  const image = product.image
    ? `<img src="/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';document.getElementById('fallback').style.display='block'"/><div id="fallback" class="emoji" style="display:none">${escapeHtml(product.emoji || '📦')}</div>`
    : `<div class="emoji">${escapeHtml(product.emoji || '📦')}</div>`;
  const stockKnown = typeof product.stock === 'number';
  const available = !stockKnown || product.stock > 0;
  const stockText = stockKnown ? (product.stock > 0 ? `${product.stock} uds. registradas en stock` : 'Agotado actualmente') : 'Consulta disponibilidad actual';
  addStructuredData(product, available);

  const currentMeta = variantsApi?.meta(product) || { size:null, flavor:null, familyLabel:product.name };
  const familyRows = variantsApi?.family(product, products) || [{ product, meta:currentMeta }];
  const description = product.description || variantsApi?.factualDescription(product) || 'Producto disponible en el catálogo Nutretium.';

  const detailItems = [
    ['Marca', product.brand || 'No indicada en el catálogo'],
    ['Categoría', product.category || 'No indicada'],
    ['Referencia', product.code || 'No indicada'],
    ['Familia', currentMeta.familyLabel || product.name],
    ['Sabor / variedad', currentMeta.flavor || 'No aplica / no indicado'],
    ['Formato', currentMeta.size || product.pdfDescription || 'No indicado'],
  ];
  const related = products.filter(p => p.id !== product.id && p.category === product.category && (typeof p.stock !== 'number' || p.stock > 0)).slice(0,4);
  const maxQty = typeof product.stock === 'number' ? Math.max(1, product.stock) : 99;

  app.innerHTML = `
    <div class="crumb"><a href="/">Inicio</a> · <a href="/categoria/${encodeURIComponent(slugify(product.category))}">${escapeHtml(product.category || 'Catálogo')}</a> · ${escapeHtml(product.name)}</div>
    <section class="product">
      <div class="visual">${image}</div>
      <div>
        <span class="eyebrow">${escapeHtml(product.brand || product.category || 'Nutretium')}</span>
        <h1 class="title">${escapeHtml(product.name)}</h1>
        <div class="meta">${product.brand ? `<span class="pill">Marca: ${escapeHtml(product.brand)}</span>` : ''}${product.code ? `<span class="pill">Ref. ${escapeHtml(product.code)}</span>` : ''}<span class="pill">${escapeHtml(product.category || 'Catálogo')}</span></div>
        <div class="price">€${Number(product.price).toFixed(2)}</div>
        <div class="stock ${available ? 'ok' : ''}">${escapeHtml(stockText)}</div>
        <p class="desc">${escapeHtml(description)}</p>
        ${variantSelectorHtml(product, familyRows)}
        <div class="selector-box">
          <div class="selector-group">
            <span class="selector-label">Cantidad</span>
            <div class="quantity-row">
              <button class="qty-btn" type="button" id="qtyMinus" aria-label="Reducir cantidad">−</button>
              <input class="qty-input" id="qtyInput" type="number" value="1" min="1" max="${maxQty}" inputmode="numeric" aria-label="Cantidad" />
              <button class="qty-btn" type="button" id="qtyPlus" aria-label="Aumentar cantidad">+</button>
            </div>
            ${stockKnown ? `<div class="notice">Máximo disponible para este SKU: ${Math.max(0, product.stock)} uds.</div>` : ''}
          </div>
        </div>
        <div class="buy">${available ? `<button class="primary" id="addToCartBtn" type="button">Añadir al carrito</button>` : '<button class="primary" disabled type="button">Producto agotado</button>'}<a class="secondary" href="tel:+34633753517">Consultar al equipo</a></div>
        <div class="trust"><div><strong>Tienda física</strong><span>C/ La Albericia 1 · Santander</span></div><div><strong>Pago</strong><span>Tarjeta mediante Redsys</span></div><div><strong>Pedido</strong><span>Confirmación tras pago autorizado</span></div><div><strong>Atención directa</strong><span>633 753 517</span></div></div>
      </div>
    </section>
    <section class="details"><h2>Descripción y datos del producto</h2><div class="detail-grid">${detailItems.map(([label,value]) => `<div class="detail"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}<div class="detail pending"><strong>Ingredientes, alérgenos y nutrición</strong><span>${product.description ? 'Consulta siempre el etiquetado vigente del producto. Si necesitas confirmar un ingrediente, alérgeno o modo de empleo antes de comprar, contacta con Nutretium.' : 'Información estructurada pendiente de incorporar desde documentación del fabricante. No inventamos estos datos.'}</span></div><div class="detail"><strong>Disponibilidad</strong><span>${escapeHtml(stockText)}</span></div></div></section>
    ${related.length ? `<section class="details"><h2>También puedes consultar</h2><div class="detail-grid">${related.map(p=>`<a class="detail" style="text-decoration:none" href="${productUrl(p)}"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.brand || p.category)} · €${Number(p.price).toFixed(2)}</span></a>`).join('')}</div></section>` : ''}
    <footer class="foot">Nutretium es un establecimiento de BAHÍA NORTE CAPITAL, S.L. · NIF B27659754 · C/ La Albericia 1, Santander. La información específica de composición y uso debe contrastarse con el etiquetado vigente cuando corresponda. <a class="back" href="/ayuda">Centro de ayuda</a></footer>`;

  const qtyInput = document.getElementById('qtyInput');
  const clampQty = () => {
    const value = Math.max(1, Math.min(maxQty, Number(qtyInput.value) || 1));
    qtyInput.value = String(value);
    return value;
  };
  document.getElementById('qtyMinus')?.addEventListener('click', () => { qtyInput.value = String(Math.max(1, clampQty() - 1)); });
  document.getElementById('qtyPlus')?.addEventListener('click', () => { qtyInput.value = String(Math.min(maxQty, clampQty() + 1)); });
  qtyInput?.addEventListener('change', clampQty);
  document.getElementById('addToCartBtn')?.addEventListener('click', () => addSelectedToCart(product, clampQty()));
})();
