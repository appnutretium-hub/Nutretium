/* NUTRETIUM — Franchise Trust Layer
   Añade patrones de ecommerce consolidado sin sustituir la web original.
   Este archivo se concatena a app.js durante el build de Netlify. */

(function () {
  'use strict';

  const slugify = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const cleanText = (value) => String(value || '').replace(/[<>]/g, '');

  function productUrl(product) {
    return `/producto/${slugify(product.name)}-${product.id}`;
  }

  function renderTrustFacts() {
    const stats = document.getElementById('statsBar');
    if (!stats) return;
    stats.innerHTML = '';
    const facts = [
      ['📍', 'Tienda física', 'C/ La Albericia 1 · Santander'],
      ['💳', 'Pago bancario', 'Tarjeta mediante Redsys'],
      ['🛍️', 'Recogida en tienda', 'Compra online y recoge en Nutretium'],
      ['☎️', 'Atención directa', '633 753 517'],
    ];
    facts.forEach(([icon, title, text]) => {
      const item = document.createElement('div');
      item.className = 'nt-franchise-fact';
      const i = document.createElement('span'); i.className = 'nt-franchise-fact-icon'; i.textContent = icon;
      const copy = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = title;
      const small = document.createElement('span'); small.textContent = text;
      copy.append(strong, small);
      item.append(i, copy);
      stats.appendChild(item);
    });
  }

  function sectionShell(id, eyebrow, title, subtitle) {
    const section = document.createElement('section');
    section.id = id;
    section.className = 'nt-franchise-section max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16';
    const head = document.createElement('div');
    head.className = 'nt-franchise-head';
    const e = document.createElement('span'); e.className = 'nt-franchise-eyebrow'; e.textContent = eyebrow;
    const h = document.createElement('h2'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = subtitle;
    head.append(e, h, p);
    section.appendChild(head);
    return section;
  }

  function insertGoals() {
    if (document.getElementById('ntGoals')) return;
    const categories = document.getElementById('categories');
    if (!categories) return;
    const section = sectionShell(
      'ntGoals',
      'Encuentra lo que necesitas',
      'Compra según tu objetivo',
      'Una forma rápida de llegar a la categoría más útil para tu entrenamiento o bienestar.'
    );
    const grid = document.createElement('div');
    grid.className = 'nt-goal-grid';
    const goals = [
      ['💪', 'Desarrollo muscular', 'Proteínas'],
      ['⚡', 'Mayor rendimiento', 'Pre-entrenos'],
      ['🔄', 'Recuperación', 'Colágeno y bienestar'],
      ['🌿', 'Salud y bienestar', 'Vitaminas y salud'],
      ['🥣', 'Alimentación proteica', 'Alimentación proteica'],
    ];
    goals.forEach(([icon, label, category]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nt-goal-card';
      btn.addEventListener('click', () => filterByCategory(category));
      const ico = document.createElement('span'); ico.className = 'nt-goal-icon'; ico.textContent = icon;
      const txt = document.createElement('span'); txt.className = 'nt-goal-title'; txt.textContent = label;
      const sub = document.createElement('span'); sub.className = 'nt-goal-sub'; sub.textContent = category;
      btn.append(ico, txt, sub);
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    categories.insertAdjacentElement('afterend', section);
  }

  function brandCounts() {
    const map = new Map();
    (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).forEach((p) => {
      const brand = String(p.brand || '').trim();
      if (!brand) return;
      map.set(brand, (map.get(brand) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }

  function filterBrand(brand) {
    ['searchInput', 'navSearchInput', 'mobileSearchInput'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = brand;
    });
    activeFilter = 'Todos';
    document.querySelectorAll('.filter-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === 'Todos'));
    applyFilters();
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  }

  function insertBrands() {
    if (document.getElementById('ntBrands')) return;
    const brands = brandCounts().slice(0, 12);
    if (!brands.length) return;
    const products = document.getElementById('products');
    if (!products) return;
    const section = sectionShell(
      'ntBrands',
      'Catálogo real',
      'Marcas disponibles en Nutretium',
      'Accede directamente a las marcas que ya forman parte del catálogo publicado.'
    );
    const grid = document.createElement('div');
    grid.className = 'nt-brand-grid';
    brands.forEach(([brand, count]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nt-brand-chip';
      btn.addEventListener('click', () => filterBrand(brand));
      const name = document.createElement('strong'); name.textContent = brand;
      const meta = document.createElement('span'); meta.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
      btn.append(name, meta);
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    products.insertAdjacentElement('beforebegin', section);
  }

  function insertStoreProof() {
    if (document.getElementById('ntStoreProof')) return;
    const products = document.getElementById('products');
    if (!products) return;
    const section = document.createElement('section');
    section.id = 'ntStoreProof';
    section.className = 'nt-store-proof';
    section.innerHTML = `
      <div class="nt-store-proof-inner">
        <div class="nt-store-proof-copy">
          <span class="nt-franchise-eyebrow">Detrás de la web hay una tienda real</span>
          <h2>Nutretium también está en Santander</h2>
          <p>Puedes visitarnos en C/ La Albericia 1, hablar directamente con el equipo y recoger tu pedido en tienda. La web no sustituye la atención personal: la complementa.</p>
          <div class="nt-store-actions">
            <a href="#location">Ver ubicación y horario</a>
            <a href="tel:+34633753517" class="secondary">Llamar al 633 753 517</a>
          </div>
        </div>
        <div class="nt-store-proof-points" aria-label="Información de confianza">
          <div><strong>09:30–22:00</strong><span>Horario continuo</span></div>
          <div><strong>Redsys</strong><span>Pasarela bancaria</span></div>
          <div><strong>Santander</strong><span>Tienda física</span></div>
          <div><strong>Recogida</strong><span>Disponible en tienda</span></div>
        </div>
      </div>`;
    products.insertAdjacentElement('afterend', section);
  }

  function insertLegalIdentity() {
    const footer = document.querySelector('footer .max-w-7xl');
    if (!footer || document.getElementById('ntLegalIdentity')) return;
    const box = document.createElement('div');
    box.id = 'ntLegalIdentity';
    box.className = 'nt-legal-identity';
    box.textContent = 'Nutretium · Establecimiento operado por BAHÍA NORTE CAPITAL, S.L. · NIF B27659754 · C/ La Albericia 1, Santander';
    footer.prepend(box);
  }

  function decorateProductCards(list) {
    const cards = [...document.querySelectorAll('#productGrid .product-card')];
    const ordered = [...(list || PRODUCTS)].sort((a, b) => inStock(b) - inStock(a));
    cards.forEach((card, index) => {
      const product = ordered[index];
      if (!product || card.querySelector('.nt-product-detail-link')) return;
      const actions = card.querySelector('.p-5 .flex.items-center.justify-between');
      if (!actions) return;
      const link = document.createElement('a');
      link.className = 'nt-product-detail-link';
      link.href = productUrl(product);
      link.textContent = 'Ver ficha';
      link.setAttribute('aria-label', `Ver ficha de ${cleanText(product.name)}`);
      const buttonWrap = actions.lastElementChild;
      if (buttonWrap) buttonWrap.prepend(link);
    });
  }

  function enhanceRendering() {
    if (typeof renderProducts !== 'function' || renderProducts.__ntWrapped) return;
    const original = renderProducts;
    const wrapped = function (list = PRODUCTS) {
      original(list);
      decorateProductCards(list);
    };
    wrapped.__ntWrapped = true;
    renderProducts = wrapped;
    decorateProductCards(PRODUCTS);
  }

  function enhanceCategoryUrls() {
    if (typeof filterByCategory !== 'function' || filterByCategory.__ntWrapped) return;
    const original = filterByCategory;
    const wrapped = function (category) {
      original(category);
      const slug = slugify(category);
      if (category && category !== 'Todos' && slug) {
        history.pushState({ category }, '', `/categoria/${slug}`);
      } else {
        history.pushState({}, '', '/');
      }
    };
    wrapped.__ntWrapped = true;
    filterByCategory = wrapped;
  }

  function categoryFromSlug(slug) {
    const categories = (window.NUTRETIUM_CATEGORIES || []);
    return categories.find((c) => slugify(c) === slug) || null;
  }

  function applyRoute() {
    const path = location.pathname.replace(/\/+$/, '');
    if (!path.startsWith('/categoria/')) return;
    const slug = decodeURIComponent(path.split('/').filter(Boolean)[1] || '');
    const category = categoryFromSlug(slug);
    if (!category) return;
    activeFilter = category;
    document.querySelectorAll('.filter-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === category));
    applyFilters();
    setTimeout(() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function handleAddFromProductPage() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('add');
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id)) return;
    setTimeout(() => {
      addToCart(id);
      openCart();
      const clean = location.pathname + location.hash;
      history.replaceState({}, '', clean || '/');
    }, 100);
  }

  function initFranchiseLayer() {
    renderTrustFacts();
    insertGoals();
    insertBrands();
    insertStoreProof();
    insertLegalIdentity();
    enhanceRendering();
    enhanceCategoryUrls();
    applyRoute();
    handleAddFromProductPage();
  }

  window.addEventListener('popstate', applyRoute);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initFranchiseLayer, 0));
  } else {
    setTimeout(initFranchiseLayer, 0);
  }
})();
