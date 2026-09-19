/* NUTRETIUM — ficha individual de producto */
(function(){
  'use strict';

  const app = document.getElementById('app');
  const products = Array.isArray(window.NUTRETIUM_PRODUCTS)
    ? window.NUTRETIUM_PRODUCTS.filter(p => p.active !== false)
    : [];
  const RECENT_KEY = 'nutretium_recent_v1';

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
      description:product.description || `${product.name} disponible en Nutretium Santander.`,
      image:product.image ? new URL('/' + product.image, location.origin).href : undefined,
      offers:{'@type':'Offer',priceCurrency:'EUR',price:Number(product.price).toFixed(2),availability:available?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:location.href}
    };
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const script=document.createElement('script'); script.type='application/ld+json'; script.textContent=JSON.stringify(data); document.head.appendChild(script);
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
  meta.content = product.description ? String(product.description).slice(0,155) : `${product.name}. Precio, disponibilidad y ficha en Nutretium Santander.`;
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

  const detailItems = [
    ['Marca', product.brand || 'No indicada en el catálogo'],
    ['Categoría', product.category || 'No indicada'],
    ['Referencia', product.code || 'No indicada'],
    ['Formato / descripción ERP', product.pdfDescription || product.name],
  ];
  const related = products.filter(p => p.id !== product.id && p.category === product.category && (typeof p.stock !== 'number' || p.stock > 0)).slice(0,4);

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
        <p class="desc">${escapeHtml(product.description || 'Producto disponible en el catálogo Nutretium. Esta ficha se está ampliando con información específica del fabricante.')}</p>
        <div class="buy">${available ? `<a class="primary" href="/?add=${encodeURIComponent(product.id)}">Añadir al carrito</a>` : '<span class="secondary" style="opacity:.6">Producto agotado</span>'}<a class="secondary" href="tel:+34633753517">Consultar al equipo</a></div>
        <div class="trust"><div><strong>Tienda física</strong><span>C/ La Albericia 1 · Santander</span></div><div><strong>Pago</strong><span>Tarjeta mediante Redsys</span></div><div><strong>Recogida</strong><span>Consulta disponibilidad para recogida en tienda</span></div><div><strong>Atención directa</strong><span>633 753 517</span></div></div>
      </div>
    </section>
    <section class="details"><h2>Información del producto</h2><div class="detail-grid">${detailItems.map(([label,value]) => `<div class="detail"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}<div class="detail pending"><strong>Ingredientes, alérgenos y nutrición</strong><span>${product.description ? 'Consulta siempre el etiquetado vigente del producto. Si necesitas confirmar un ingrediente, alérgeno o modo de empleo antes de comprar, contacta con Nutretium.' : 'Información estructurada pendiente de incorporar desde documentación del fabricante. No inventamos estos datos.'}</span></div><div class="detail"><strong>Disponibilidad</strong><span>${escapeHtml(stockText)}</span></div></div></section>
    ${related.length ? `<section class="details"><h2>También puedes consultar</h2><div class="detail-grid">${related.map(p=>`<a class="detail" style="text-decoration:none" href="${productUrl(p)}"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.brand || p.category)} · €${Number(p.price).toFixed(2)}</span></a>`).join('')}</div></section>` : ''}
    <footer class="foot">Nutretium es un establecimiento de BAHÍA NORTE CAPITAL, S.L. · NIF B27659754 · C/ La Albericia 1, Santander. La información específica de composición y uso debe contrastarse con el etiquetado vigente cuando corresponda. <a class="back" href="/ayuda">Centro de ayuda</a></footer>`;
})();
