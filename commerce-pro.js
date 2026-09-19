/* NUTRETIUM — Commerce Pro
   Capa de ecommerce orientada a confianza, usabilidad y funcionalidad real.
   Se carga después de app.js, trust-fixes.js y franchise-trust.js. */
(function () {
  'use strict';

  const CART_KEY = 'nutretium_cart_v1';
  const WISHLIST_KEY = 'nutretium_wishlist_v1';
  const RECENT_KEY = 'nutretium_recent_v1';
  const MAX_RECENT = 8;

  const state = {
    sort: 'relevance',
    onlyStock: false,
    wishlistOnly: false,
    lastList: null,
  };

  const slugify = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const productUrl = (p) => `/producto/${slugify(p.name)}-${p.id}`;

  function safeStorageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  // ─── CARRITO PERSISTENTE ───────────────────────────────────────────────────
  function persistCart() {
    if (typeof cart === 'undefined') return;
    const data = Array.from(cart.entries()).slice(0, 100).map(([key, item]) => ({
      key,
      id: Number(item?.product?.id),
      quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)),
      customization: item?.customization || null,
    })).filter(i => Number.isFinite(i.id));
    safeStorageSet(CART_KEY, data);
  }

  function restoreCart() {
    if (typeof cart === 'undefined' || typeof PRODUCTS === 'undefined') return;
    const saved = safeStorageGet(CART_KEY, []);
    if (!Array.isArray(saved)) return;
    cart.clear();
    saved.forEach((row) => {
      const product = PRODUCTS.find(p => Number(p.id) === Number(row.id));
      if (!product || (typeof inStock === 'function' && !inStock(product))) return;
      const max = typeof product.stock === 'number' ? Math.max(0, product.stock) : 99;
      const quantity = Math.max(1, Math.min(max || 1, Number(row.quantity) || 1));
      const key = String(row.key || (row.customization ? `${product.id}_restored_${Date.now()}` : product.id));
      cart.set(key, { product, quantity, customization: row.customization || null });
    });
  }

  function installCartPersistence() {
    if (typeof updateCartUI !== 'function' || updateCartUI.__commercePersist) return;
    const original = updateCartUI;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      persistCart();
      return result;
    };
    wrapped.__commercePersist = true;
    updateCartUI = wrapped;
    restoreCart();
    updateCartUI();
  }

  // ─── FAVORITOS ─────────────────────────────────────────────────────────────
  function getWishlist() {
    const ids = safeStorageGet(WISHLIST_KEY, []);
    return new Set(Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : []);
  }

  function saveWishlist(set) { safeStorageSet(WISHLIST_KEY, [...set]); }

  function toggleWishlist(id) {
    const wishlist = getWishlist();
    const n = Number(id);
    if (wishlist.has(n)) wishlist.delete(n); else wishlist.add(n);
    saveWishlist(wishlist);
    decorateProductCards();
    updateWishlistButton();
    if (state.wishlistOnly) renderProducts(state.lastList || PRODUCTS);
    if (typeof showToast === 'function') showToast(wishlist.has(n) ? 'Añadido a favoritos' : 'Eliminado de favoritos');
  }
  window.toggleWishlist = toggleWishlist;

  function decorateProductCards() {
    if (typeof PRODUCTS === 'undefined') return;
    const wishlist = getWishlist();
    document.querySelectorAll('#productGrid .product-card').forEach((card) => {
      const link = card.querySelector('.nt-product-detail-link');
      const href = link?.getAttribute('href') || '';
      const match = href.match(/-(\d+)$/);
      const product = match ? PRODUCTS.find(p => Number(p.id) === Number(match[1])) : null;
      if (!product) return;

      const visual = card.firstElementChild;
      if (visual && !visual.querySelector('.nt-wish-btn')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nt-wish-btn';
        btn.dataset.productId = String(product.id);
        btn.setAttribute('aria-label', `Guardar ${product.name} en favoritos`);
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleWishlist(product.id); });
        visual.appendChild(btn);
      }

      const btn = card.querySelector('.nt-wish-btn');
      if (btn) {
        const active = wishlist.has(Number(product.id));
        btn.textContent = active ? '♥' : '♡';
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
      }

      const title = card.querySelector('h3');
      if (title && !title.querySelector('a')) {
        const a = document.createElement('a');
        a.href = productUrl(product);
        a.className = 'nt-card-title-link';
        a.textContent = title.textContent;
        title.textContent = '';
        title.appendChild(a);
      }
    });
  }

  function updateWishlistButton() {
    const btn = document.getElementById('ntWishlistToggle');
    if (!btn) return;
    const count = getWishlist().size;
    btn.textContent = state.wishlistOnly ? `♥ Favoritos (${count}) · mostrando` : `♡ Favoritos (${count})`;
    btn.classList.toggle('active', state.wishlistOnly);
  }

  // ─── ORDENACIÓN / TOOLBAR ─────────────────────────────────────────────────
  function sortProducts(list) {
    const copy = [...list];
    if (state.sort === 'price-asc') copy.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'es'));
    if (state.sort === 'price-desc') copy.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'es'));
    if (state.sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (state.sort === 'stock') copy.sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));
    return copy;
  }

  function installRenderEnhancer() {
    if (typeof renderProducts !== 'function' || renderProducts.__commercePro) return;
    const previous = renderProducts;
    const wrapped = function (list = PRODUCTS) {
      state.lastList = Array.isArray(list) ? [...list] : [...PRODUCTS];
      let output = [...state.lastList];
      if (state.onlyStock && typeof inStock === 'function') output = output.filter(inStock);
      if (state.wishlistOnly) {
        const wanted = getWishlist();
        output = output.filter(p => wanted.has(Number(p.id)));
      }
      output = sortProducts(output);
      const result = previous(output);
      decorateProductCards();
      const count = document.getElementById('ntProductCount');
      if (count) count.textContent = `${output.length} ${output.length === 1 ? 'producto' : 'productos'}`;
      return result;
    };
    wrapped.__commercePro = true;
    renderProducts = wrapped;
  }

  function insertCatalogToolbar() {
    if (document.getElementById('ntCatalogToolbar')) return;
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const bar = document.createElement('div');
    bar.id = 'ntCatalogToolbar';
    bar.className = 'nt-catalog-toolbar';
    bar.innerHTML = `
      <div class="nt-toolbar-left">
        <strong id="ntProductCount">${typeof PRODUCTS !== 'undefined' ? PRODUCTS.length : 0} productos</strong>
        <button type="button" id="ntWishlistToggle" class="nt-toolbar-btn">♡ Favoritos</button>
        <label class="nt-stock-toggle"><input id="ntOnlyStock" type="checkbox" /> Solo disponibles</label>
      </div>
      <label class="nt-sort-label">Ordenar
        <select id="ntSortSelect" aria-label="Ordenar productos">
          <option value="relevance">Relevancia</option>
          <option value="price-asc">Precio: menor a mayor</option>
          <option value="price-desc">Precio: mayor a menor</option>
          <option value="name">Nombre A–Z</option>
          <option value="stock">Mayor disponibilidad</option>
        </select>
      </label>`;
    grid.insertAdjacentElement('beforebegin', bar);

    bar.querySelector('#ntSortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      renderProducts(state.lastList || PRODUCTS);
    });
    bar.querySelector('#ntOnlyStock').addEventListener('change', (e) => {
      state.onlyStock = e.target.checked;
      renderProducts(state.lastList || PRODUCTS);
    });
    bar.querySelector('#ntWishlistToggle').addEventListener('click', () => {
      state.wishlistOnly = !state.wishlistOnly;
      updateWishlistButton();
      renderProducts(state.lastList || PRODUCTS);
    });
    updateWishlistButton();
  }

  // ─── BÚSQUEDA CON SUGERENCIAS ─────────────────────────────────────────────
  function matchProducts(query) {
    const q = String(query || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (q.length < 2 || typeof PRODUCTS === 'undefined') return [];
    const score = (p) => {
      const name = String(p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const brand = String(p.brand || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cat = String(p.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      let s = 0;
      if (name.startsWith(q)) s += 8;
      else if (name.includes(q)) s += 5;
      if (brand.startsWith(q)) s += 4;
      else if (brand.includes(q)) s += 2;
      if (cat.includes(q)) s += 1;
      return s;
    };
    return PRODUCTS.map(p => ({ p, s: score(p) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.price - b.p.price).slice(0, 6).map(x => x.p);
  }

  function attachSuggestions(input) {
    if (!input || input.dataset.ntSuggestions === '1') return;
    input.dataset.ntSuggestions = '1';
    const host = input.parentElement;
    if (!host) return;
    host.classList.add('nt-search-host');
    const box = document.createElement('div');
    box.className = 'nt-search-suggestions';
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    host.appendChild(box);

    const hide = () => { box.hidden = true; box.replaceChildren(); };
    input.addEventListener('input', () => {
      const results = matchProducts(input.value);
      box.replaceChildren();
      if (!results.length) { hide(); return; }
      results.forEach((p) => {
        const a = document.createElement('a');
        a.href = productUrl(p);
        a.className = 'nt-search-result';
        a.setAttribute('role', 'option');
        const copy = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = p.name;
        const meta = document.createElement('small'); meta.textContent = [p.brand, p.category].filter(Boolean).join(' · ');
        copy.append(name, meta);
        const price = document.createElement('b'); price.textContent = `€${Number(p.price).toFixed(2)}`;
        a.append(copy, price);
        box.appendChild(a);
      });
      box.hidden = false;
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    input.addEventListener('blur', () => setTimeout(hide, 160));
  }

  function installSearchSuggestions() {
    ['searchInput', 'navSearchInput', 'mobileSearchInput'].forEach(id => attachSuggestions(document.getElementById(id)));
  }

  // ─── VISTOS RECIENTEMENTE ─────────────────────────────────────────────────
  function renderRecentlyViewed() {
    if (document.getElementById('ntRecentlyViewed') || typeof PRODUCTS === 'undefined') return;
    const ids = safeStorageGet(RECENT_KEY, []);
    if (!Array.isArray(ids) || !ids.length) return;
    const items = ids.map(id => PRODUCTS.find(p => Number(p.id) === Number(id))).filter(Boolean).slice(0, 6);
    if (!items.length) return;
    const products = document.getElementById('products');
    if (!products) return;
    const section = document.createElement('section');
    section.id = 'ntRecentlyViewed';
    section.className = 'nt-recent-section max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10';
    const h = document.createElement('h2'); h.textContent = 'Vistos recientemente';
    const p = document.createElement('p'); p.textContent = 'Vuelve rápidamente a los productos que has consultado.';
    const grid = document.createElement('div'); grid.className = 'nt-recent-grid';
    items.forEach((product) => {
      const a = document.createElement('a'); a.href = productUrl(product); a.className = 'nt-recent-card';
      if (product.image) {
        const img = document.createElement('img'); img.src = `/${product.image}`; img.alt = product.name; img.loading = 'lazy';
        a.appendChild(img);
      } else {
        const icon = document.createElement('span'); icon.className = 'nt-recent-emoji'; icon.textContent = product.emoji || '📦'; a.appendChild(icon);
      }
      const copy = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = product.name;
      const price = document.createElement('span'); price.textContent = `€${Number(product.price).toFixed(2)}`;
      copy.append(name, price); a.appendChild(copy); grid.appendChild(a);
    });
    section.append(h, p, grid);
    products.insertAdjacentElement('beforebegin', section);
  }

  // ─── CENTRO DE AYUDA / CONFIANZA ──────────────────────────────────────────
  function insertHelpCenter() {
    if (document.getElementById('ntHelpCenter')) return;
    const footer = document.querySelector('footer');
    if (!footer) return;
    const section = document.createElement('section');
    section.id = 'ntHelpCenter';
    section.className = 'nt-help-center';
    section.innerHTML = `
      <div class="nt-help-inner">
        <div><span class="nt-help-eyebrow">Antes y después de comprar</span><h2>¿Necesitas ayuda?</h2><p>Información clara, atención directa y acceso a tus pedidos.</p></div>
        <div class="nt-help-links">
          <a href="/ayuda#pedidos"><strong>Mis pedidos</strong><span>Consulta compras asociadas a tu cuenta</span></a>
          <a href="/ayuda#devoluciones"><strong>Cambios y devoluciones</strong><span>Derechos, excepciones y procedimiento</span></a>
          <a href="/ayuda#pago"><strong>Pago</strong><span>Tarjeta mediante Redsys</span></a>
          <a href="/ayuda#contacto"><strong>Hablar con Nutretium</strong><span>Teléfono, email y tienda física</span></a>
        </div>
      </div>`;
    footer.insertAdjacentElement('beforebegin', section);
  }

  function improveFooterLinks() {
    document.querySelectorAll('footer button').forEach((btn) => {
      const text = (btn.textContent || '').trim();
      if (/Programa de afiliación y fidelización/i.test(text)) {
        const li = btn.closest('li'); if (li) li.remove();
      }
      if (/Preguntas frecuentes/i.test(text)) {
        btn.textContent = 'Centro de ayuda y FAQs';
        btn.onclick = () => { location.href = '/ayuda'; };
      }
      if (/Take Away/i.test(text)) {
        const li = btn.closest('li'); if (li) li.remove();
      }
    });

    // La radio depende de un stream externo y no es parte de la compra: se retira
    // para no introducir un punto de fallo ajeno a la tienda.
    const radioButton = document.querySelector('[onclick*="toggleRadio"]');
    const radioSection = radioButton?.closest('section');
    if (radioSection) radioSection.hidden = true;
  }

  // ─── FORMULARIOS: NUNCA SIMULAR ÉXITO ─────────────────────────────────────
  function installRealFormSubmissions() {
    if (typeof submitTrainerRequest === 'function') {
      submitTrainerRequest = async function submitTrainerRequestVerified() {
        const name = document.getElementById('trainerName')?.value.trim() || '';
        const email = document.getElementById('trainerEmail')?.value.trim() || '';
        const phone = document.getElementById('trainerPhone')?.value.trim() || '';
        const age = document.getElementById('trainerAge')?.value.trim() || '';
        const goal = document.getElementById('trainerGoal')?.value || '';
        const mode = document.getElementById('trainerMode')?.value || '';
        const notes = document.getElementById('trainerNotes')?.value.trim() || '';
        const errEl = document.getElementById('trainerError');
        errEl?.classList.add('hidden');
        if (!name) return showFieldError(errEl, 'El nombre es obligatorio.');
        if (!email) return showFieldError(errEl, 'El email es obligatorio.');
        if (!goal) return showFieldError(errEl, 'Selecciona tu objetivo principal.');
        if (!mode) return showFieldError(errEl, 'Selecciona la modalidad de entrenamiento.');

        const lines = [
          `Objetivo: ${goal}`, `Modalidad: ${mode}`,
          `Nivel: ${typeof trainerLevel !== 'undefined' && trainerLevel ? trainerLevel : 'No indicado'}`,
          `Disponibilidad: ${typeof trainerSchedule !== 'undefined' && trainerSchedule?.size ? [...trainerSchedule].join(', ') : 'No indicada'}`,
          `Edad: ${age || 'No indicada'}`, `Teléfono: ${phone || 'No indicado'}`, notes ? `Notas: ${notes}` : ''
        ].filter(Boolean);
        try {
          const res = await fetch('/.netlify/functions/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, email, subject:`[PERSONAL TRAINER] ${goal} — ${mode}`, message:lines.join('\n') }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'No se pudo enviar la solicitud.');
          closeModal('trainerModal');
          showToast('Solicitud recibida. El equipo te contactará para informarte de disponibilidad y condiciones.');
        } catch (err) {
          showFieldError(errEl, err.message || 'No se pudo enviar la solicitud. Inténtalo de nuevo.');
        }
      };
    }

    if (typeof submitCareerApplication === 'function') {
      submitCareerApplication = async function submitCareerApplicationVerified() {
        const name = document.getElementById('careerName')?.value.trim() || '';
        const email = document.getElementById('careerEmail')?.value.trim() || '';
        const phone = document.getElementById('careerPhone')?.value.trim() || '';
        const position = document.getElementById('careerPosition')?.value || 'Candidatura espontánea';
        const message = document.getElementById('careerMessage')?.value.trim() || '';
        const errEl = document.getElementById('careerError');
        errEl?.classList.add('hidden');
        if (!name) return showFieldError(errEl, 'El nombre es obligatorio.');
        if (!email) return showFieldError(errEl, 'El email es obligatorio.');
        if (!message) return showFieldError(errEl, 'Cuéntanos algo sobre ti.');
        try {
          const res = await fetch('/.netlify/functions/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, email, subject:`[CANDIDATURA] ${position}`, message:`Teléfono: ${phone || 'No indicado'}\n\n${message}` }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'No se pudo enviar la candidatura.');
          closeModal('careersModal');
          showToast('Candidatura recibida correctamente.');
        } catch (err) {
          showFieldError(errEl, err.message || 'No se pudo enviar la candidatura. Inténtalo de nuevo.');
        }
      };
    }

    // El formulario actual de CV solo leía el nombre del archivo: nunca enviaba
    // el adjunto. Se oculta para no prometer una subida inexistente.
    const cv = document.getElementById('cvUpload');
    const cvBlock = cv?.closest('div');
    if (cvBlock) cvBlock.hidden = true;
  }

  // ─── CHAT: SOLO ESTADOS Y CONDICIONES REALES ───────────────────────────────
  function installGroundedChat() {
    if (typeof chatReply !== 'function') return;
    chatReply = async function groundedChatReply(userText) {
      const t = _norm(userText);

      if (chatAwaitingOrder) {
        chatAwaitingOrder = false;
        const order = String(userText || '').toUpperCase().replace(/\s+/g, '').match(/\d{4}[A-Z0-9]{8}/)?.[0];
        if (!order) {
          chatAddBot('No reconozco ese número. El identificador de pago de Redsys tiene 12 caracteres. También puedes entrar en <strong>Mi cuenta → Mis pedidos</strong>.');
          return;
        }
        try {
          const res = await fetch(`/.netlify/functions/redsys-status?order=${encodeURIComponent(order)}`);
          const data = await res.json();
          if (!res.ok || !data.found) throw new Error('no encontrado');
          const labels = { PAID:'Pago confirmado ✅', PENDING:'Pago pendiente de confirmación ⏳', FAILED:'Pago no completado ❌' };
          chatAddBot(`<strong>${labels[data.status] || 'Estado registrado'}</strong><br/><span class="text-xs text-brand-muted">Este estado corresponde al pago. El seguimiento logístico se gestiona desde atención al cliente.</span>`);
        } catch {
          chatAddBot('No he podido localizar ese pago. Revisa el número o entra en <strong>Mi cuenta → Mis pedidos</strong>.');
        }
        return;
      }

      if (_hasAny(t, ['pago','pagar','tarjeta','redsys'])) {
        chatAddBot('💳 El pago online se procesa con <strong>tarjeta mediante Redsys</strong>. Nutretium no necesita guardar los datos de tu tarjeta.');
        return;
      }
      if (_hasAny(t, ['devolu','devolver','reembolso','desistimiento','cambio'])) {
        chatAddBot('↩️ En compras a distancia existe con carácter general un <strong>plazo legal de 14 días naturales</strong> para desistir, con excepciones —por ejemplo determinados productos precintados abiertos por razones de salud o higiene o productos perecederos—. Consulta el procedimiento en nuestro centro de ayuda.' + chatBtn('Ver cambios y devoluciones', "location.href='/ayuda#devoluciones'"));
        return;
      }
      if (_hasAny(t, ['seguimiento','mi pedido','estado del pedido','numero de pedido','n de pedido','tracking'])) {
        chatAwaitingOrder = true;
        chatAddBot('📦 Puedo comprobar el <strong>estado del pago</strong>. Escribe el identificador de pedido de 12 caracteres. Para logística y entrega, usa Mi cuenta o atención al cliente.');
        return;
      }
      if (_hasAny(t, ['envio','envíos','plazo','entrega','transportista'])) {
        chatAddBot('🚚 Para condiciones concretas de entrega, cobertura o una incidencia de transporte, consulta el centro de ayuda o contacta con el equipo. No te daré un plazo o coste que no esté confirmado para tu pedido.' + chatBtn('Abrir centro de ayuda', "location.href='/ayuda#envios'"));
        return;
      }
      if (_hasAny(t, ['horario','abierto','abris','abren','cierran','ubicacion','donde estais','direccion','tienda fisica'])) {
        chatAddBot('📍 Estamos en <strong>C/ La Albericia 1, Santander</strong>. Horario continuo: <strong>09:30–22:00</strong>.' + chatBtn('Ver ubicación', "document.getElementById('location')?.scrollIntoView({behavior:'smooth'}); toggleChat()"));
        return;
      }
      if (_hasAny(t, ['contacto','telefono','llamar','email','correo','whatsapp','hablar con','persona','humano','agente'])) {
        chatAddBot('☎️ Puedes llamarnos al <strong>633 753 517</strong> o escribir a <strong>appnutretium@gmail.com</strong>.' + chatBtn('Centro de ayuda', "location.href='/ayuda#contacto'"));
        return;
      }
      if (_hasAny(t, ['oferta','descuento','promocion','codigo','cupon','rebaja'])) {
        chatAddBot('🏷️ Las promociones válidas son únicamente las que aparezcan identificadas en el catálogo en ese momento. Puedo enseñarte los productos publicados.' + chatBtn('Ver catálogo', "document.getElementById('products')?.scrollIntoView({behavior:'smooth'}); toggleChat()"));
        return;
      }
      if (_hasAny(t, ['entrenador','entrenamiento','rutina','personal trainer'])) {
        chatAddBot('💪 Puedes solicitar información sobre el servicio de entrenamiento. El equipo te confirmará disponibilidad y condiciones.' + chatBtn('Solicitar información', "openModal('trainerModal'); toggleChat()"));
        return;
      }
      if (_hasAny(t, ['take away','takeaway','para llevar','recogida','bowl','batido'])) {
        chatAddBot('🥤 Para productos preparados y recogida en tienda, llama al <strong>633 753 517</strong> para confirmar carta y disponibilidad actual.');
        return;
      }
      if (_hasAny(t, ['hola','buenas','buenos dias','buenas tardes','buenas noches','hey'])) {
        chatAddBot('Hola. Puedo ayudarte a encontrar productos, revisar el estado de un pago, consultar devoluciones o ponerte en contacto con Nutretium.');
        return;
      }
      if (_hasAny(t, ['gracias','genial','perfecto','muchas gracias'])) {
        chatAddBot('De acuerdo. Si necesitas otra cosa, dime qué buscas.');
        return;
      }

      const found = typeof chatSearchCatalog === 'function' ? chatSearchCatalog(userText) : { list:[] };
      if (found.list?.length) {
        const items = found.list.slice(0, 3).map(p => `<div class="flex items-center justify-between gap-2 border-b border-brand-border/50 pb-1"><a class="hover:text-brand-gold" href="${productUrl(p)}">${_esc(p.name)}</a><strong class="text-brand-gold whitespace-nowrap">€${Number(p.price).toFixed(2)}</strong></div>`).join('');
        chatAddBot('He encontrado estos productos en el catálogo:<div class="space-y-1 my-2">' + items + '</div>');
        return;
      }

      chatAddBot('No tengo información suficiente para responder eso con seguridad. Puedes consultar el catálogo o hablar directamente con el equipo.' + chatBtn('Centro de ayuda', "location.href='/ayuda'"));
    };
  }

  // ─── SEO / RUTAS / ACCESIBILIDAD ──────────────────────────────────────────
  function setMeta(name, content) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.appendChild(meta); }
    meta.content = content;
  }

  function updateCategorySeo(category) {
    if (!category || category === 'Todos') {
      document.title = 'NUTRETIUM | Nutrición deportiva y alimentación saludable en Santander';
      setMeta('description', 'Nutretium: suplementación deportiva, alimentación saludable y tienda física en Santander. Consulta catálogo, disponibilidad y compra online.');
      return;
    }
    document.title = `${category} | NUTRETIUM Santander`;
    setMeta('description', `Compra ${category.toLowerCase()} en Nutretium. Catálogo disponible, tienda física en Santander y atención directa.`);
  }

  function installCategorySeo() {
    if (typeof filterByCategory === 'function' && !filterByCategory.__commerceSeo) {
      const previous = filterByCategory;
      const wrapped = function (category) { const r = previous.apply(this, arguments); updateCategorySeo(category); return r; };
      wrapped.__commerceSeo = true;
      filterByCategory = wrapped;
    }
    const path = location.pathname.replace(/\/+$/, '');
    if (path.startsWith('/categoria/')) {
      const slug = path.split('/').filter(Boolean)[1];
      const category = (window.NUTRETIUM_CATEGORIES || []).find(c => slugify(c) === slug);
      if (category) updateCategorySeo(category);
    }
  }

  function installQueryActions() {
    const params = new URLSearchParams(location.search);
    if (params.get('login') === '1') setTimeout(() => openModal('loginModal'), 150);
    if (params.get('account') === 'orders') {
      setTimeout(() => {
        if (typeof currentUser !== 'undefined' && currentUser) openOrders(); else openModal('loginModal');
      }, 180);
    }
  }

  function addSkipLink() {
    if (document.querySelector('.nt-skip-link')) return;
    const a = document.createElement('a'); a.href = '#products'; a.className = 'nt-skip-link'; a.textContent = 'Saltar al catálogo';
    document.body.prepend(a);
  }

  function init() {
    installCartPersistence();
    installRenderEnhancer();
    insertCatalogToolbar();
    installSearchSuggestions();
    renderRecentlyViewed();
    insertHelpCenter();
    improveFooterLinks();
    installRealFormSubmissions();
    installGroundedChat();
    installCategorySeo();
    installQueryActions();
    addSkipLink();
    // Repinta una vez con todas las capas ya instaladas.
    if (typeof renderProducts === 'function' && typeof PRODUCTS !== 'undefined') renderProducts(PRODUCTS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 40), { once:true });
  } else {
    setTimeout(init, 40);
  }
})();
