/* NUTRETIUM — ficha individual de producto */
(function(){
  'use strict';

  const app = document.getElementById('app');
  const products = Array.isArray(window.NUTRETIUM_PRODUCTS)
    ? window.NUTRETIUM_PRODUCTS.filter(p => p.active !== false)
    : [];

  const escapeHtml = (v) => String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  function idFromPath(){
    const last = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    const match = last.match(/-(\d+)$/);
    return match ? Number(match[1]) : Number(new URLSearchParams(location.search).get('id'));
  }

  const id = idFromPath();
  const product = products.find(p => Number(p.id) === id);

  if (!product) {
    app.innerHTML = '<div class="error"><h1>Producto no disponible</h1><p>Este producto no existe, no está publicado o ha sido retirado del catálogo.</p><p><a class="back" href="/#products">Volver al catálogo</a></p></div>';
    document.title = 'Producto no disponible | NUTRETIUM';
    return;
  }

  const title = `${product.name} | NUTRETIUM`;
  document.title = title;
  const meta = document.querySelector('meta[name="description"]') || document.head.appendChild(document.createElement('meta'));
  meta.name = 'description';
  meta.content = product.description
    ? String(product.description).slice(0,155)
    : `${product.name}. Consulta precio, disponibilidad y ficha del producto en Nutretium Santander.`;

  const image = product.image
    ? `<img src="/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.style.display='none';document.getElementById('fallback').style.display='block'"/><div id="fallback" class="emoji" style="display:none">${escapeHtml(product.emoji || '📦')}</div>`
    : `<div class="emoji">${escapeHtml(product.emoji || '📦')}</div>`;

  const stockKnown = typeof product.stock === 'number';
  const available = !stockKnown || product.stock > 0;
  const stockText = stockKnown
    ? (product.stock > 0 ? `${product.stock} uds. registradas en stock` : 'Agotado actualmente')
    : 'Consulta disponibilidad actual';

  const hasDescription = Boolean(String(product.description || '').trim());
  const infoStatus = hasDescription
    ? 'La descripción disponible procede del catálogo publicado.'
    : 'Ficha ampliada pendiente: antes de comprar un alimento o suplemento, consulta ingredientes, alérgenos, información nutricional y condiciones de uso en su etiquetado o con el equipo Nutretium.';

  const detailItems = [
    ['Marca', product.brand || 'No indicada en el catálogo'],
    ['Categoría', product.category || 'No indicada'],
    ['Referencia', product.code || 'No indicada'],
    ['Formato / descripción ERP', product.pdfDescription || product.name],
  ];

  app.innerHTML = `
    <div class="crumb"><a href="/">Inicio</a> · <a href="/categoria/${encodeURIComponent(String(product.category || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''))}">${escapeHtml(product.category || 'Catálogo')}</a> · ${escapeHtml(product.name)}</div>
    <section class="product">
      <div class="visual">${image}</div>
      <div>
        <span class="eyebrow">${escapeHtml(product.brand || product.category || 'Nutretium')}</span>
        <h1 class="title">${escapeHtml(product.name)}</h1>
        <div class="meta">
          ${product.brand ? `<span class="pill">Marca: ${escapeHtml(product.brand)}</span>` : ''}
          ${product.code ? `<span class="pill">Ref. ${escapeHtml(product.code)}</span>` : ''}
          <span class="pill">${escapeHtml(product.category || 'Catálogo')}</span>
        </div>
        <div class="price">€${Number(product.price).toFixed(2)}</div>
        <div class="stock ${available ? 'ok' : ''}">${escapeHtml(stockText)}</div>
        <p class="desc">${escapeHtml(product.description || 'Producto disponible en el catálogo Nutretium. Esta ficha se está ampliando con información específica del fabricante.')}</p>
        <div class="buy">
          ${available ? `<a class="primary" href="/?add=${encodeURIComponent(product.id)}">Añadir al carrito</a>` : '<span class="secondary" style="opacity:.6">Producto agotado</span>'}
          <a class="secondary" href="tel:+34633753517">Consultar al equipo</a>
        </div>
        <div class="trust">
          <div><strong>Tienda física</strong><span>C/ La Albericia 1 · Santander</span></div>
          <div><strong>Pago</strong><span>Pasarela bancaria Redsys</span></div>
          <div><strong>Recogida</strong><span>Consulta disponibilidad para recogida en tienda</span></div>
          <div><strong>Atención directa</strong><span>633 753 517</span></div>
        </div>
      </div>
    </section>
    <section class="details">
      <h2>Información del producto</h2>
      <div class="detail-grid">
        ${detailItems.map(([label,value]) => `<div class="detail"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}
        <div class="detail pending"><strong>Información alimentaria / suplementación</strong><span>${escapeHtml(infoStatus)}</span></div>
        <div class="detail"><strong>Disponibilidad</strong><span>${escapeHtml(stockText)}</span></div>
      </div>
    </section>
    <footer class="foot">Nutretium es un establecimiento de BAHÍA NORTE CAPITAL, S.L. · NIF B27659754 · C/ La Albericia 1, Santander. La información específica de composición y uso debe contrastarse con el etiquetado vigente del producto cuando corresponda.</footer>`;
})();
