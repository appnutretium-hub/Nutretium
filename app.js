/**
 * NUTRETIUM — app.js
 * Handles: auth, products, cart, filters, reviews,
 *           product customization, contact form, and Redsys payment.
 *
 * Backend endpoints (Netlify Functions):
 *   POST /.netlify/functions/auth        — login / register / profile
 *   POST /.netlify/functions/reviews     — submit / fetch reviews
 *   POST /.netlify/functions/contact     — contact form
 *   POST /.netlify/functions/redsys      — payment signature
 */

'use strict';

// ─── CATÁLOGO ─────────────────────────────────────────────────────────────────
//
// products-data.js es la ÚNICA lista de productos. La cargan tanto esta página
// como las funciones de Netlify, que son las que ponen el precio del pedido
// (ver netlify/lib/catalogo.js). Si aquí hubiera otra lista, la web podría
// enseñar productos o precios que el servidor no reconoce al cobrar.

let PRODUCTS = Array.isArray(window.NUTRETIUM_PRODUCTS)
  ? window.NUTRETIUM_PRODUCTS.map(p => ({ ...p }))
  : [];

// ─── AUTH STATE ───────────────────────────────────────────────────────────────

let currentUser = null; // { id, name, surname, email, token }

function loadSession() {
  try {
    const raw = localStorage.getItem('nutretium_user');
    if (raw) currentUser = JSON.parse(raw);
  } catch { currentUser = null; }
}

function saveSession(user) {
  currentUser = user;
  localStorage.setItem('nutretium_user', JSON.stringify(user));
}

function clearSession() {
  currentUser = null;
  localStorage.removeItem('nutretium_user');
}

function updateAuthUI() {
  const authButtons  = document.getElementById('authButtons');
  const profileMenu  = document.getElementById('profileMenu');
  const profileName  = document.getElementById('profileName');
  const mobileAuth   = document.getElementById('mobileAuthButtons');

  // Ojo con authButtons: en el HTML es "hidden lg:flex", y en el styles.css
  // compilado el bloque @media de lg va DESPUÉS de .hidden. A partir de 1024 px
  // gana .lg:flex, así que añadir 'hidden' no oculta nada en escritorio: hay
  // que quitar también 'lg:flex'. Por eso aquí no vale un add/remove de 'hidden'.
  // 'hidden' se queda SIEMPRE puesto: por debajo de 1024 px estos botones no
  // salen nunca, ahí manda el menú móvil (mobileAuthButtons). Lo que decide si
  // se ven en escritorio es 'lg:flex'.
  authButtons.classList.add('hidden');
  authButtons.classList.toggle('lg:flex', !currentUser);
  profileMenu.classList.toggle('hidden', !currentUser);

  if (currentUser) {
    if (profileName) profileName.textContent = currentUser.name || 'Mi cuenta';
    if (mobileAuth) mobileAuth.innerHTML = `
      <p class="px-4 py-2 text-xs text-brand-muted">Hola, <strong class="text-brand-gold">${currentUser.name}</strong></p>
      <button onclick="toggleMobileMenu(); logout()" class="block w-full text-left px-4 py-3 rounded-lg text-red-400 font-semibold transition-colors">Cerrar sesión</button>
    `;
  } else if (mobileAuth) {
    mobileAuth.innerHTML = `
      <button onclick="toggleMobileMenu(); openModal('loginModal')" class="block w-full text-left px-4 py-3 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 font-semibold transition-colors">Iniciar sesión</button>
      <button onclick="toggleMobileMenu(); openModal('registerModal')" class="block w-full text-left px-4 py-3 rounded-lg text-brand-gold font-bold transition-colors">Registrarse</button>
    `;
  }
}

// ─── AUTH ACTIONS ─────────────────────────────────────────────────────────────

async function submitLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  errEl.classList.add('hidden');

  if (!email || !password) { showFieldError(errEl, 'Completa todos los campos.'); return; }

  try {
    const res  = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión.');
    saveSession(data.user);
    updateAuthUI();
    closeModal('loginModal');
    showToast(`Bienvenido/a, ${data.user.name} 👋`);
  } catch (err) {
    showFieldError(errEl, err.message);
  }
}

async function submitRegister() {
  const name     = document.getElementById('regName').value.trim();
  const surname  = document.getElementById('regSurname').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const phone    = document.getElementById('regPhone').value.trim();
  const errEl    = document.getElementById('regError');
  errEl.classList.add('hidden');

  if (!name || !email || !password) { showFieldError(errEl, 'Nombre, email y contraseña son obligatorios.'); return; }
  if (password.length < 8)          { showFieldError(errEl, 'La contraseña debe tener al menos 8 caracteres.'); return; }

  try {
    const res  = await fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, surname, email, password, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrarse.');
    saveSession(data.user);
    updateAuthUI();
    closeModal('registerModal');
    showToast(`Cuenta creada. Bienvenido/a, ${data.user.name} 🎉`);
    // Perfilado del usuario: mostrar el test justo después del registro
    setTimeout(() => openModal('testModal'), 600);
  } catch (err) {
    showFieldError(errEl, err.message);
  }
}

function logout() {
  clearSession();
  updateAuthUI();
  closeProfileDropdown();
  showToast('Sesión cerrada.');
}

function showFieldError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ─── CART STATE ───────────────────────────────────────────────────────────────

/** @type {Map<string, { product: object, quantity: number, customization?: object }>} */
let cart = new Map();

function getCartItemCount() {
  let total = 0;
  cart.forEach(item => { total += item.quantity; });
  return total;
}

function getCartTotal() {
  let total = 0;
  cart.forEach(item => { total += item.product.price * item.quantity; });
  return total;
}

function addToCart(productId, customization = null) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  // Nunca se vende por encima del stock del listado oficial.
  if (!inStock(product)) {
    showToast(`${product.name} está agotado`);
    return;
  }

  // Customizable products get a unique key per customization set
  const key = customization ? `${productId}_custom_${Date.now()}` : String(productId);

  const available = (typeof product.stock === 'number') ? product.stock : Infinity;
  if (!customization && cart.has(key) && cart.get(key).quantity >= available) {
    showToast(`Solo quedan ${available} unidades de ${product.name}`);
    return;
  }

  if (!customization && cart.has(key)) {
    cart.get(key).quantity += 1;
  } else {
    cart.set(key, { product, quantity: 1, customization });
  }

  updateCartUI();
  showToast(`${product.name} añadido al carrito`);
}

function removeFromCart(key) {
  cart.delete(key);
  updateCartUI();
}

function changeQuantity(key, delta) {
  if (!cart.has(key)) return;
  const item = cart.get(key);
  const available = (typeof item.product.stock === 'number') ? item.product.stock : Infinity;
  if (delta > 0 && item.quantity + delta > available) {
    showToast(`Solo quedan ${available} unidades de ${item.product.name}`);
    return;
  }
  item.quantity += delta;
  if (item.quantity <= 0) cart.delete(key);
  updateCartUI();
}

// ─── CART UI ──────────────────────────────────────────────────────────────────

function updateCartUI() {
  const count = getCartItemCount();
  const total = getCartTotal();

  // Badge
  const badge = document.getElementById('cartCount');
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  // Total
  document.getElementById('cartTotal').textContent = `€${total.toFixed(2)}`;

  // Pay button
  const btn = document.getElementById('redsysBtn');
  btn.disabled = count === 0;

  // Items list
  const container = document.getElementById('cartItems');
  const emptyMsg = document.getElementById('emptyCartMsg');

  if (cart.size === 0) {
    emptyMsg.style.display = 'block';
    // Remove all item rows
    container.querySelectorAll('.cart-item-row').forEach(el => el.remove());
    return;
  }

  emptyMsg.style.display = 'none';

  // Rebuild item rows
  container.querySelectorAll('.cart-item-row').forEach(el => el.remove());

  cart.forEach((item, key) => {
    const row = document.createElement('div');
    row.className = 'cart-item-row flex items-start gap-4 bg-brand-dark rounded-xl p-3 border border-brand-border';
    row.dataset.key = key;

    const customBadge = item.customization
      ? `<span class="inline-block mt-1 text-xs bg-brand-gold/20 text-brand-gold border border-brand-gold/30 px-2 py-0.5 rounded-full">✨ Personalizado</span>`
      : '';

    row.innerHTML = `
      <div class="w-12 h-12 rounded-lg bg-brand-dark border border-brand-border overflow-hidden flex-shrink-0">
        ${item.product.image
          ? `<img src="${item.product.image}" alt="${item.product.name}" class="w-full h-full object-cover" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'text-2xl flex items-center justify-center w-full h-full\\'>${item.product.emoji}</span>'" />`
          : `<span class="text-2xl flex items-center justify-center w-full h-full">${item.product.emoji}</span>`
        }
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate">${item.product.name}</p>
        <p class="text-xs text-brand-muted mt-0.5">€${item.product.price.toFixed(2)} / ud.</p>
        ${customBadge}
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          onclick="changeQuantity('${key}', -1)"
          class="w-7 h-7 rounded-md bg-brand-card border border-brand-border text-white hover:border-brand-gold hover:text-brand-gold transition-colors text-sm font-bold flex items-center justify-center"
          aria-label="Reducir cantidad"
        >−</button>
        <span class="text-sm font-bold w-5 text-center">${item.quantity}</span>
        <button
          onclick="changeQuantity('${key}', 1)"
          class="w-7 h-7 rounded-md bg-brand-card border border-brand-border text-white hover:border-brand-gold hover:text-brand-gold transition-colors text-sm font-bold flex items-center justify-center"
          aria-label="Aumentar cantidad"
        >+</button>
        <button
          onclick="removeFromCart('${key}')"
          class="w-7 h-7 rounded-md bg-brand-card border border-brand-border text-brand-muted hover:border-red-500 hover:text-red-400 transition-colors text-sm flex items-center justify-center ml-1"
          aria-label="Eliminar producto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

function openCart() {
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── PRODUCT GRID RENDERING ───────────────────────────────────────────────────

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  let stars = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars += '<span class="text-yellow-400">★</span>';
    } else if (i === full && half) {
      stars += '<span class="text-yellow-400">½</span>';
    } else {
      stars += '<span class="text-brand-border">★</span>';
    }
  }
  return stars;
}

// Un producto es comprable si el listado oficial le reconoce stock disponible.
// stock === undefined (catálogo servido por el backend antiguo) se considera disponible.
function inStock(product) {
  return product.stock === undefined || product.stock === null || product.stock > 0;
}

function renderProducts(list = PRODUCTS) {
  const grid      = document.getElementById('productGrid');
  const noResults = document.getElementById('noResults');

  if (!list.length) {
    grid.innerHTML = '';
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  // Los agotados se muestran, pero siempre al final de la parrilla.
  const ordered = [...list].sort((a, b) => inStock(b) - inStock(a));

  grid.innerHTML = ordered.map(product => `
    <article class="product-card group bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col hover:border-brand-gold/50 transition-colors duration-200">
      <div class="relative bg-gradient-to-br from-[#0f0f0f] to-brand-card h-52 overflow-hidden">
        ${product.image
          ? `<img src="${product.image}" alt="${product.name}" loading="lazy" class="w-full h-full ${product.image.startsWith('sources/') ? 'object-contain p-3' : 'object-cover'} transition-transform duration-500 group-hover:scale-105" onerror="this.style.display='none';this.parentElement.querySelector('.img-fallback').style.display='flex';" /><div class="img-fallback absolute inset-0 hidden items-center justify-center text-8xl select-none" aria-hidden="true">${product.emoji}</div>`
          : `<div class="w-full h-full flex items-center justify-center text-8xl select-none" role="img" aria-label="${product.name}">${product.emoji}</div>`
        }
        <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 pointer-events-none"></div>
        ${product.badge ? `<span class="absolute top-3 left-3 ${product.badgeColor} text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide shadow">${product.badge}</span>` : ''}
        <span class="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-semibold">${product.category}</span>
        ${inStock(product) ? '' : `<span class="absolute bottom-3 left-3 bg-black/75 backdrop-blur-sm text-brand-muted text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">Agotado</span>`}
      </div>
      <div class="p-5 flex flex-col flex-1">
        <h3 class="font-bold text-base leading-snug mb-1">${product.name}</h3>
        ${product.description
          ? `<p class="text-brand-muted text-xs leading-relaxed mb-3 flex-1">${product.description}</p>`
          : `<div class="flex-1"></div>`}
        ${product.reviews > 0 ? `
        <div class="flex items-center gap-2 mb-4">
          <div class="flex text-sm leading-none">${renderStars(product.rating)}</div>
          <span class="text-xs text-brand-muted">${product.rating} (${product.reviews})</span>
        </div>` : `<div class="mb-4"></div>`}
        <div class="flex items-center justify-between gap-3">
          <span class="text-2xl font-black text-white">€${product.price.toFixed(2)}</span>
          <div class="flex gap-2">
            ${!inStock(product)
              ? `<button disabled
                   class="bg-brand-border/40 text-brand-muted font-bold text-sm px-5 py-2.5 rounded-xl cursor-not-allowed flex-shrink-0"
                   aria-label="${product.name} agotado">
                   Agotado
                 </button>`
              : product.customizable
              ? `<button onclick="openCustomModal(${product.id})"
                   class="add-to-cart-btn bg-brand-border text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-colors duration-200 flex items-center gap-1.5 flex-shrink-0"
                   aria-label="Personalizar ${product.name}">
                   ✨ Personalizar
                 </button>`
              : `<button onclick="addToCart(${product.id})"
                   class="add-to-cart-btn bg-brand-border text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors duration-200 flex items-center gap-2 flex-shrink-0"
                   aria-label="Añadir ${product.name} al carrito">
                   <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                     <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                   </svg>
                   Añadir
                 </button>`
            }
          </div>
        </div>
      </div>
    </article>
  `).join('');
}

// ─── FILTER & SEARCH ─────────────────────────────────────────────────────────

let activeFilter = 'Todos';

function setFilter(category) {
  activeFilter = category;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === category);
  });
  applyFilters();
}

function filterByCategory(category) {
  // limpia búsqueda y filtros avanzados para que el filtro por categoría sea limpio
  ['searchInput', 'navSearchInput', 'mobileSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof resetAdvFilters === 'function') {
    advState.priceMin = null; advState.priceMax = null; advState.brand = null;
    advState.offersOnly = false; advState.packsOnly = false;
    document.querySelectorAll('#advFilters .adv-chip').forEach(b => b.classList.remove('active'));
  }
  setFilter(category);
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
}

// Mapea un objetivo a una categoría real del catálogo (ver window.NUTRETIUM_CATEGORIES)
const GOAL_MAP = {
  'Pérdida de grasa':    'Alimentación proteica',
  'Mayor rendimiento':   'Pre-entrenos',
  'Rendimiento':         'Pre-entrenos',
  'Recuperación':        'Colágeno y bienestar',
  'Desarrollo muscular': 'Proteínas',
  'Salud y bienestar':   'Vitaminas y salud',
};

function filterByGoal(goal) {
  const category = GOAL_MAP[goal] || 'Todos';
  filterByCategory(category);
  showToast(`Mostrando lo mejor para: ${goal}`);
}

function applyFilters() {
  // Collect query from any of the three search inputs (whichever has a value)
  const sectionQuery = document.getElementById('searchInput')?.value       || '';
  const navQuery     = document.getElementById('navSearchInput')?.value    || '';
  const mobileQuery  = document.getElementById('mobileSearchInput')?.value || '';
  const query = (sectionQuery || navQuery || mobileQuery).toLowerCase().trim();

  let list = PRODUCTS;

  if (activeFilter === 'Personalizable') {
    list = list.filter(p => p.customizable);
  } else if (activeFilter !== 'Todos') {
    list = list.filter(p => p.category === activeFilter);
  }

  if (query) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.description || '').toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
    );
  }

  // Filtros avanzados (precio / marca / ofertas / packs)
  list = list.filter(advProductMatches);

  renderProducts(list);
}

// ─── PRODUCT CUSTOMIZATION ────────────────────────────────────────────────────

let customizingProductId = null;
let selectedSize  = null;
let selectedColor = null;
let selectedColorName = null;
let logoFile = null;

function openCustomModal(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;
  customizingProductId = productId;
  selectedSize = null; selectedColor = null; selectedColorName = null; logoFile = null;

  document.getElementById('customProductName').textContent = product.name;
  document.getElementById('customText').value  = '';
  document.getElementById('customNotes').value = '';
  document.getElementById('customError').classList.add('hidden');
  document.getElementById('logoPreview').classList.add('hidden');
  document.getElementById('uploadLabel').textContent = 'Haz clic para subir tu logo';
  document.getElementById('logoUpload').value = '';
  document.getElementById('selectedColorLabel').textContent = '';

  // Reset size buttons
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.remove('border-brand-gold', 'text-brand-gold');
  });
  // Reset color buttons
  document.querySelectorAll('.color-btn').forEach(b => {
    b.style.outline = '';
  });
  // Reset font buttons
  document.querySelectorAll('.font-btn').forEach(b => {
    b.classList.remove('border-brand-gold', 'text-brand-gold');
  });
  // Reset text color buttons
  document.querySelectorAll('.text-color-btn').forEach(b => {
    b.style.outline = '';
  });
  // Reset preview state
  previewFont = 'Impact';
  previewTextSize = 24;
  previewTextColor = '#ffffff';
  logoDataUrl = null;
  const slider = document.getElementById('textSizeSlider');
  if (slider) { slider.value = 24; }
  const sizeVal = document.getElementById('textSizeVal');
  if (sizeVal) sizeVal.textContent = '24px';

  openModal('customModal');
  // Draw after modal is visible so canvas has dimensions
  requestAnimationFrame(() => updatePreview());
}

function selectSize(btn, size) {
  selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.remove('border-brand-gold', 'text-brand-gold');
  });
  btn.classList.add('border-brand-gold', 'text-brand-gold');
}

function selectColor(btn, hex, name) {
  selectedColor = hex;
  selectedColorName = name;
  document.querySelectorAll('.color-btn').forEach(b => { b.style.outline = ''; });
  btn.style.outline = '3px solid #D4AF37';
  btn.style.outlineOffset = '2px';
  document.getElementById('selectedColorLabel').textContent = `Color seleccionado: ${name}`;
  updatePreview();
}

// ─── CANVAS PREVIEW ───────────────────────────────────────────────────────────

let previewFont      = 'Impact';
let previewTextSize  = 24;
let previewTextColor = '#ffffff';
let logoDataUrl      = null;

function selectFont(btn, font) {
  previewFont = font;
  document.querySelectorAll('.font-btn').forEach(b => {
    b.classList.remove('border-brand-gold', 'text-brand-gold');
  });
  btn.classList.add('border-brand-gold', 'text-brand-gold');
  updatePreview();
}

function selectTextColor(btn, color) {
  previewTextColor = color;
  document.querySelectorAll('.text-color-btn').forEach(b => {
    b.style.outline = '';
  });
  btn.style.outline = '3px solid #D4AF37';
  btn.style.outlineOffset = '2px';
  updatePreview();
}

function onTextSizeChange(val) {
  previewTextSize = parseInt(val);
  document.getElementById('textSizeVal').textContent = val + 'px';
  updatePreview();
}

function updatePreview() {
  const canvas = document.getElementById('shirtCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  const shirtColor = selectedColor || '#111111';
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  // Draw shirt silhouette
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  // Body
  ctx.roundRect(30, 70, 160, 170, 8);
  ctx.fill();
  // Left sleeve
  ctx.beginPath();
  ctx.moveTo(30, 70);
  ctx.lineTo(0, 110);
  ctx.lineTo(15, 130);
  ctx.lineTo(45, 100);
  ctx.closePath();
  ctx.fill();
  // Right sleeve
  ctx.beginPath();
  ctx.moveTo(190, 70);
  ctx.lineTo(220, 110);
  ctx.lineTo(205, 130);
  ctx.lineTo(175, 100);
  ctx.closePath();
  ctx.fill();
  // Collar
  ctx.fillStyle = shirtColor;
  ctx.beginPath();
  ctx.moveTo(85, 70);
  ctx.quadraticCurveTo(110, 95, 135, 70);
  ctx.closePath();
  ctx.fill();

  // Slight shade on shirt bottom
  const grad = ctx.createLinearGradient(0, 130, 0, 240);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(30, 130, 160, 110);

  // Logo image
  const text = document.getElementById('customText')?.value.trim() || '';

  if (logoDataUrl) {
    const img = new Image();
    img.onload = () => {
      const maxW = 80, maxH = 50;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const iw = img.width * ratio;
      const ih = img.height * ratio;
      ctx.drawImage(img, (W - iw) / 2, text ? 100 : 130, iw, ih);
      // Draw text below logo if both present
      if (text) _drawPreviewText(ctx, text, W, 165);
    };
    img.src = logoDataUrl;
  } else if (text) {
    _drawPreviewText(ctx, text, W, 145);
  } else {
    // Placeholder
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Vista previa', W / 2, 155);
  }

  // Brand watermark bottom
  ctx.fillStyle = 'rgba(212,175,55,0.35)';
  ctx.font = 'bold 9px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NUTRETIUM', W / 2, 228);
}

function _drawPreviewText(ctx, text, W, y) {
  ctx.font = `bold ${previewTextSize}px ${previewFont}, sans-serif`;
  ctx.fillStyle = previewTextColor;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  // Clip text to shirt width
  const maxWidth = 140;
  ctx.fillText(text, W / 2, y, maxWidth);
  ctx.shadowBlur = 0;
}

function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('El archivo supera los 2 MB.');
    event.target.value = '';
    return;
  }
  logoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    logoDataUrl = e.target.result;
    document.getElementById('logoPreviewImg').src = e.target.result;
    document.getElementById('logoFileName').textContent = file.name;
    document.getElementById('logoPreview').classList.remove('hidden');
    document.getElementById('uploadLabel').textContent = 'Logo cargado ✓';
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function clearLogo() {
  logoFile = null;
  logoDataUrl = null;
  document.getElementById('logoUpload').value = '';
  document.getElementById('logoPreview').classList.add('hidden');
  document.getElementById('uploadLabel').textContent = 'Haz clic para subir tu logo';
  updatePreview();
}

function addCustomToCart() {
  const errEl = document.getElementById('customError');
  errEl.classList.add('hidden');

  if (!selectedSize)  { showFieldError(errEl, 'Selecciona una talla.'); return; }
  if (!selectedColor) { showFieldError(errEl, 'Selecciona un color.'); return; }

  const customization = {
    size:      selectedSize,
    color:     selectedColor,
    colorName: selectedColorName,
    text:      document.getElementById('customText').value.trim(),
    notes:     document.getElementById('customNotes').value.trim(),
    logoName:  logoFile ? logoFile.name : null,
    // In production: upload logoFile to storage and store the URL instead
  };

  addToCart(customizingProductId, customization);
  closeModal('customModal');
}

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

let reviewStarValue = 0;
// Sin reseñas semilla: las anteriores describían productos AMIX ya retirados del
// catálogo. Se rellena desde /.netlify/functions/reviews con reseñas reales.
let REVIEWS = [];

function setReviewStar(val) {
  reviewStarValue = val;
  document.querySelectorAll('#starPicker .star-btn').forEach(s => {
    s.style.color = parseInt(s.dataset.val) <= val ? '#D4AF37' : '#2a2200';
  });
}

function populateReviewProductSelect() {
  const sel = document.getElementById('reviewProduct');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecciona un producto...</option>' +
    PRODUCTS.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
}

async function submitReview() {
  const product = document.getElementById('reviewProduct').value;
  const author  = document.getElementById('reviewAuthor').value.trim();
  const text    = document.getElementById('reviewText').value.trim();
  const errEl   = document.getElementById('reviewError');
  errEl.classList.add('hidden');

  if (!product)          { showFieldError(errEl, 'Selecciona un producto.'); return; }
  if (!reviewStarValue)  { showFieldError(errEl, 'Selecciona una valoración.'); return; }
  if (!author)           { showFieldError(errEl, 'Escribe tu nombre.'); return; }
  if (!text)             { showFieldError(errEl, 'Escribe un comentario.'); return; }

  const review = { author, product, rating: reviewStarValue, text, date: new Date().toISOString().slice(0, 10) };

  try {
    const res = await fetch('/.netlify/functions/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', review }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar la reseña.');
    REVIEWS.unshift(review);
  } catch {
    // Backend unavailable — add locally anyway
    REVIEWS.unshift(review);
  }

  renderReviews();
  closeModal('reviewModal');
  showToast('¡Gracias por tu reseña! 🌟');
  reviewStarValue = 0;
}

async function loadReviews() {
  try {
    const res  = await fetch('/.netlify/functions/reviews?action=list');
    const data = await res.json();
    if (res.ok && Array.isArray(data.reviews) && data.reviews.length) {
      REVIEWS = data.reviews;
    }
  } catch { /* use default REVIEWS */ }
  renderReviews();
}

function renderReviews() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;
  if (!REVIEWS.length) {
    grid.innerHTML = `
    <div class="col-span-full bg-brand-card border border-brand-border rounded-2xl p-8 text-center">
      <p class="text-sm text-brand-muted">Todavía no hay reseñas. ¡Sé el primero en opinar!</p>
    </div>`;
    return;
  }
  grid.innerHTML = REVIEWS.slice(0, 6).map(r => `
    <div class="bg-brand-card border border-brand-border rounded-2xl p-6 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="flex text-brand-gold text-lg leading-none">${'★'.repeat(r.rating)}<span style="color:#2a2200">${'★'.repeat(5 - r.rating)}</span></div>
        <span class="text-xs text-brand-muted">${r.date}</span>
      </div>
      <p class="text-sm text-white leading-relaxed">"${r.text}"</p>
      <div class="mt-auto pt-2 border-t border-brand-border flex items-center justify-between">
        <span class="text-xs font-bold text-brand-gold">${r.author}</span>
        <span class="text-xs text-brand-muted">${r.product}</span>
      </div>
    </div>
  `).join('');
}

// ─── CONTACT FORM ─────────────────────────────────────────────────────────────

async function submitContact() {
  const name    = document.getElementById('contactName').value.trim();
  const email   = document.getElementById('contactEmail').value.trim();
  const subject = document.getElementById('contactSubject').value.trim();
  const message = document.getElementById('contactMessage').value.trim();

  if (!name || !email || !message) { showToast('Completa nombre, email y mensaje.'); return; }

  try {
    const res = await fetch('/.netlify/functions/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar.');
    showToast('Mensaje enviado. Te responderemos pronto 📩');
    ['contactName','contactEmail','contactSubject','contactMessage'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

// ─── PERSONAL TRAINER FORM ────────────────────────────────────────────────────

let trainerLevel    = null;
let trainerSchedule = new Set();

function selectTrainerLevel(btn, level) {
  trainerLevel = level;
  document.querySelectorAll('.trainer-level-btn').forEach(b => {
    b.classList.remove('border-brand-gold', 'text-brand-gold');
  });
  btn.classList.add('border-brand-gold', 'text-brand-gold');
}

function toggleSchedule(btn, slot) {
  if (trainerSchedule.has(slot)) {
    trainerSchedule.delete(slot);
    btn.classList.remove('border-brand-gold', 'text-brand-gold');
  } else {
    trainerSchedule.add(slot);
    btn.classList.add('border-brand-gold', 'text-brand-gold');
  }
}

async function submitTrainerRequest() {
  const name  = document.getElementById('trainerName').value.trim();
  const email = document.getElementById('trainerEmail').value.trim();
  const phone = document.getElementById('trainerPhone').value.trim();
  const age   = document.getElementById('trainerAge').value.trim();
  const goal  = document.getElementById('trainerGoal').value;
  const mode  = document.getElementById('trainerMode').value;
  const notes = document.getElementById('trainerNotes').value.trim();
  const errEl = document.getElementById('trainerError');
  errEl.classList.add('hidden');

  if (!name)  { showFieldError(errEl, 'El nombre es obligatorio.'); return; }
  if (!email) { showFieldError(errEl, 'El email es obligatorio.'); return; }
  if (!goal)  { showFieldError(errEl, 'Selecciona tu objetivo principal.'); return; }
  if (!mode)  { showFieldError(errEl, 'Selecciona la modalidad de entrenamiento.'); return; }

  const messageBody = [
    `Objetivo: ${goal}`,
    `Modalidad: ${mode}`,
    `Nivel: ${trainerLevel || 'No indicado'}`,
    `Disponibilidad: ${trainerSchedule.size ? [...trainerSchedule].join(', ') : 'No indicada'}`,
    `Edad: ${age || 'No indicada'}`,
    `Teléfono: ${phone || 'No indicado'}`,
    notes ? `\nNotas: ${notes}` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('/.netlify/functions/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        subject: `[PERSONAL TRAINER] ${goal} — ${mode}`,
        message: messageBody,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar.');
  } catch {
    // Fail silently — show success anyway
  }

  // Reset
  ['trainerName','trainerEmail','trainerPhone','trainerAge','trainerNotes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('trainerGoal').selectedIndex = 0;
  document.getElementById('trainerMode').selectedIndex = 0;
  document.querySelectorAll('.trainer-level-btn').forEach(b =>
    b.classList.remove('border-brand-gold', 'text-brand-gold')
  );
  document.querySelectorAll('.schedule-btn').forEach(b =>
    b.classList.remove('border-brand-gold', 'text-brand-gold')
  );
  trainerLevel    = null;
  trainerSchedule = new Set();

  closeModal('trainerModal');
  showToast('¡Solicitud enviada! Te contactaremos en menos de 24 h 🏋️');
}

// ─── CAREERS FORM ─────────────────────────────────────────────────────────────

let cvFile = null;

function handleCvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('El archivo supera los 5 MB.');
    event.target.value = '';
    return;
  }
  cvFile = file;
  document.getElementById('cvLabel').textContent = `📄 ${file.name}`;
}

async function submitCareerApplication() {
  const name     = document.getElementById('careerName').value.trim();
  const email    = document.getElementById('careerEmail').value.trim();
  const phone    = document.getElementById('careerPhone').value.trim();
  const position = document.getElementById('careerPosition').value;
  const message  = document.getElementById('careerMessage').value.trim();
  const errEl    = document.getElementById('careerError');
  errEl.classList.add('hidden');

  if (!name)     { showFieldError(errEl, 'El nombre es obligatorio.'); return; }
  if (!email)    { showFieldError(errEl, 'El email es obligatorio.'); return; }
  if (!position) { showFieldError(errEl, 'Selecciona un puesto de interés.'); return; }
  if (!message)  { showFieldError(errEl, 'Cuéntanos algo sobre ti.'); return; }

  try {
    const res = await fetch('/.netlify/functions/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        subject: `[CANDIDATURA] ${position}`,
        message: `Puesto: ${position}\nTeléfono: ${phone || 'No indicado'}\nCV adjunto: ${cvFile ? cvFile.name : 'No adjuntado'}\n\n${message}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar.');
  } catch {
    // Fail silently — still show success to the user
  }

  // Reset form
  ['careerName','careerEmail','careerPhone','careerMessage'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('careerPosition').selectedIndex = 0;
  document.getElementById('cvUpload').value = '';
  document.getElementById('cvLabel').textContent = 'Haz clic para adjuntar tu CV';
  cvFile = null;

  closeModal('careersModal');
  showToast('¡Candidatura enviada! Te contactaremos pronto 🎯');
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  // Only restore scroll if no other modal is open
  if (!document.querySelector('.modal-backdrop.open')) {
    document.body.style.overflow = '';
  }
}

// Close modal when clicking the backdrop itself
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
    if (!document.querySelector('.modal-backdrop.open')) {
      document.body.style.overflow = '';
    }
  }
});

// ─── NAVBAR HELPERS ───────────────────────────────────────────────────────────

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburgerBtn');
  if (!menu) return;
  menu.classList.toggle('open');
  const isOpen = menu.classList.contains('open');
  btn?.setAttribute('aria-expanded', isOpen);
  // Focus the mobile search when menu opens
  if (isOpen) {
    setTimeout(() => document.getElementById('mobileSearchInput')?.focus(), 50);
  }
}

// ── Navbar expanding search ───────────────────────────────────────────────────
let navSearchOpen = false;

function toggleNavSearch() {
  navSearchOpen = !navSearchOpen;
  const input = document.getElementById('navSearchInput');
  const btn   = document.getElementById('navSearchBtn');
  if (!input) return;

  if (navSearchOpen) {
    input.classList.add('open');
    btn?.classList.add('active');
    btn?.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 50);
  } else {
    input.classList.remove('open');
    btn?.classList.remove('active');
    btn?.setAttribute('aria-expanded', 'false');
    input.value = '';
    applyFiltersFromNav(); // reset filter when closing
  }
}

// Close search when clicking outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('navSearchWrap');
  if (navSearchOpen && wrap && !wrap.contains(e.target)) {
    navSearchOpen = false;
    const input = document.getElementById('navSearchInput');
    const btn   = document.getElementById('navSearchBtn');
    input?.classList.remove('open');
    btn?.classList.remove('active');
    btn?.setAttribute('aria-expanded', 'false');
  }
});

function handleNavSearchKey(e) {
  if (e.key === 'Escape') {
    // Close navbar search
    navSearchOpen = false;
    const input = document.getElementById('navSearchInput');
    const btn   = document.getElementById('navSearchBtn');
    input?.classList.remove('open');
    btn?.classList.remove('active');
    input.value = '';
    document.getElementById('mobileSearchInput') && (document.getElementById('mobileSearchInput').value = '');
    applyFiltersFromNav();
  }
  if (e.key === 'Enter') {
    // Scroll to products section
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    toggleMobileMenu(); // close mobile menu if open
  }
}

/**
 * Reads query from ALL search inputs (navbar desktop, navbar mobile, products section)
 * and merges into a single filter run.
 */
function applyFiltersFromNav() {
  // Sync all search inputs to the same value
  const navVal    = document.getElementById('navSearchInput')?.value    || '';
  const mobileVal = document.getElementById('mobileSearchInput')?.value || '';
  const query = navVal || mobileVal;

  // Also mirror to the products section input if it exists
  const prodInput = document.getElementById('searchInput');
  if (prodInput && prodInput.value !== query) prodInput.value = query;

  applyFilters();

  // If there's a query, scroll to products
  if (query.trim()) {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function toggleProfileDropdown() {
  document.getElementById('profileDropdown')?.classList.toggle('open');
}

function closeProfileDropdown() {
  document.getElementById('profileDropdown')?.classList.remove('open');
}

// Close profile dropdown on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('profileMenu');
  if (menu && !menu.contains(e.target)) closeProfileDropdown();
});

function showSection(section) {
  closeProfileDropdown();
  if (section === 'profile') showToast('Perfil — próximamente disponible.');
  if (section === 'orders')  openOrders();
}

// ─── MIS PEDIDOS ──────────────────────────────────────────────────────────────

const ORDER_STATUS = {
  PAID:    { label: 'Pagado',        cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  FAILED:  { label: 'No completado', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  PENDING: { label: 'En proceso',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

function formatOrderDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function orderCardHTML(o) {
  const st    = ORDER_STATUS[o.status] || ORDER_STATUS.PENDING;
  const fecha = formatOrderDate(o.createdAt || o.receivedAt);

  const articulos = o.items.length
    ? o.items.map(i => `
        <li class="flex justify-between gap-3">
          <span class="text-brand-muted">${escapeHTML(i.name)} <span class="opacity-60">×${i.qty}</span></span>
          <span class="text-white/80 whitespace-nowrap">${(i.price * i.qty).toFixed(2)} €</span>
        </li>`).join('')
    : '<li class="text-brand-muted opacity-60">Sin detalle de artículos.</li>';

  return `
    <article class="border border-brand-border rounded-xl p-4 bg-white/[0.02]">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-white font-bold text-sm">Pedido ${escapeHTML(o.order)}</p>
          ${fecha ? `<p class="text-xs text-brand-muted mt-0.5">${fecha}</p>` : ''}
        </div>
        <span class="text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls} whitespace-nowrap">${st.label}</span>
      </div>
      <ul class="text-sm space-y-1 mb-3">${articulos}</ul>
      <div class="flex justify-between items-center pt-3 border-t border-brand-border">
        <span class="text-xs text-brand-muted">${o.authCode ? `Autorización ${escapeHTML(o.authCode)}` : ''}</span>
        <span class="text-brand-gold font-black">${Number(o.amount || 0).toFixed(2)} €</span>
      </div>
    </article>`;
}

/** Escapa texto antes de inyectarlo como HTML. */
function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function setOrdersBody(html) {
  const body = document.getElementById('infoBody');
  if (body) body.innerHTML = html;
}

async function openOrders() {
  if (!currentUser) {
    showToast('Inicia sesión para ver tus pedidos.');
    return;
  }

  document.getElementById('infoTitle').textContent = 'Mis pedidos';
  setOrdersBody('<p class="text-center py-6"><span class="spinner"></span></p>');
  openModal('infoModal');

  try {
    const res = await fetch('/.netlify/functions/orders', {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    });

    if (res.status === 401) {
      setOrdersBody('<p>Tu sesión ha caducado. Vuelve a iniciar sesión para ver tus pedidos.</p>');
      return;
    }
    if (!res.ok) throw new Error(`Error ${res.status}`);

    const { orders = [] } = await res.json();

    if (!orders.length) {
      setOrdersBody(`
        <div class="text-center py-6">
          <p class="text-4xl mb-3">📦</p>
          <p class="text-white font-bold mb-1">Aún no tienes pedidos</p>
          <p>Cuando completes una compra, aparecerá aquí.</p>
        </div>`);
      return;
    }

    setOrdersBody(`<div class="space-y-3">${orders.map(orderCardHTML).join('')}</div>`);

  } catch (err) {
    console.error('[Pedidos] Error al cargar:', err);
    setOrdersBody('<p>No hemos podido cargar tus pedidos. Inténtalo de nuevo en unos minutos.</p>');
  }
}

// ─── PINTAR EL CATÁLOGO ───────────────────────────────────────────────────────

// El catálogo ya viene cargado en PRODUCTS desde products-data.js: no hay que
// pedírselo a ningún endpoint. Antes se consultaba /functions/products, que servía
// una lista de ejemplo distinta; se retiró para no tener dos listas de precios.
function loadProducts() {
  renderProducts();
  renderNovedades();
  renderRecomendados();
  populateReviewProductSelect();
}

// ─── REDSYS PAYMENT INITIATION ────────────────────────────────────────────────

async function initiateRedsysPayment() {
  const total = getCartTotal();
  if (total <= 0) return;

  const btn = document.getElementById('redsysBtn');
  const btnText = document.getElementById('redsysBtnText');

  // Set loading state
  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Procesando...';

  try {
    const response = await fetch('/.netlify/functions/redsys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // El importe REAL lo calcula el servidor con los precios del catálogo.
        // Esto va solo para que detecte si la página tiene precios viejos: si no
        // coincide con su cálculo, devuelve 409 y no se cobra nada.
        amount: total,
        // Qué se compra. El servidor resuelve nombre y precio a partir del id;
        // el code viaja para que compruebe que hablamos del mismo catálogo.
        items: Array.from(cart.values()).map(i => ({
          id: i.product.id,
          code: i.product.code,
          qty: i.quantity,
        })),
        // Si hay sesión, el pedido queda asociado al usuario. El servidor
        // saca el email del token firmado, no de aquí.
        token: currentUser?.token || null,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Error del servidor: ${response.status}`);
    }

    const data = await response.json();

    // Validate required fields
    if (!data.Ds_SignatureVersion || !data.Ds_MerchantParameters || !data.Ds_Signature || !data.redsysUrl) {
      throw new Error('Respuesta inválida del servidor de pagos.');
    }

    // Guarda el nº de pedido (va dentro de Ds_MerchantParameters) para poder
    // consultar el estado REAL al volver a /pago-ok, sin fiarnos del redirect.
    try {
      let order = data.order;
      if (!order) {
        // Respaldo: en la PETICIÓN el campo es Ds_Merchant_Order
        // (Ds_Order solo aparece en la respuesta de Redsys).
        const decoded = JSON.parse(atob(data.Ds_MerchantParameters));
        order = decoded.Ds_Merchant_Order || decoded.DS_MERCHANT_ORDER;
      }
      if (order) localStorage.setItem('nutretium_last_order', order);
    } catch { /* si falla, el pedido llega igualmente por la URL de vuelta */ }

    // Populate and submit the hidden Redsys form
    const form = document.getElementById('redsysForm');
    form.action = data.redsysUrl;
    document.getElementById('rf_signatureVersion').value = data.Ds_SignatureVersion;
    document.getElementById('rf_merchantParameters').value = data.Ds_MerchantParameters;
    document.getElementById('rf_signature').value = data.Ds_Signature;

    // Clear cart before redirect
    cart.clear();
    updateCartUI();

    // Efecto: suma un cliente activo al confirmar la compra
    if (typeof window.bumpClients === 'function') window.bumpClients(1);

    form.submit();

  } catch (err) {
    console.error('[Redsys] Payment initiation failed:', err);
    showToast(`Error: ${err.message}`);

    // Restore button
    btn.disabled = false;
    btnText.innerHTML = 'Pagar con Redsys';
  }
}

// ─── REDSYS: RETORNO DEL PAGO (/pago-ok · /pago-ko) ───────────────────────────
//
// Redsys redirige el navegador a /pago-ok o /pago-ko (reescritos a index.html).
// El redirect NO es fiable por sí solo, así que en /pago-ok consultamos el
// estado REAL del pedido contra redsys-status (que lee lo que confirmó la
// notificación servidor-a-servidor). La notificación puede llegar con unos
// segundos de retardo, por eso reintentamos varias veces.

function paymentOverlayHTML(state, order) {
  const wrap = (icon, color, title, msg, extra = '') => `
    <div style="max-width:440px;width:calc(100% - 32px);background:#fff;border-radius:18px;
                padding:36px 28px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.28);
                font-family:inherit;">
      <div style="font-size:56px;line-height:1;margin-bottom:14px;">${icon}</div>
      <h2 style="margin:0 0 8px;font-size:22px;color:${color};">${title}</h2>
      <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:1.5;">${msg}</p>
      ${order ? `<p style="margin:0 0 22px;color:#94a3b8;font-size:12px;">Pedido: ${order}</p>` : ''}
      ${extra}
      <button onclick="closePaymentOverlay()"
        style="border:0;border-radius:999px;padding:13px 26px;font-size:15px;font-weight:600;
               cursor:pointer;background:#0f766e;color:#fff;">Seguir comprando</button>
    </div>`;

  switch (state) {
    case 'loading':
      return `<div style="max-width:440px;width:calc(100% - 32px);background:#fff;border-radius:18px;
              padding:40px 28px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.28);">
              <div class="spinner" style="margin:0 auto 16px;"></div>
              <p style="margin:0;color:#475569;font-size:15px;">Comprobando el estado de tu pago…</p></div>`;
    case 'ok':
      return wrap('✅', '#0f766e', '¡Pago confirmado!',
        'Hemos recibido tu pago correctamente. Te enviaremos la confirmación del pedido por email.');
    case 'ko':
      return wrap('❌', '#b91c1c', 'Pago no completado',
        'El pago no se ha realizado o fue cancelado. No se te ha cobrado nada. Puedes intentarlo de nuevo.');
    case 'pending':
    default:
      return wrap('⏳', '#b45309', 'Pago en verificación',
        'Estamos confirmando tu pago con el banco. Si se completó, recibirás la confirmación en breve por email.');
  }
}

function showPaymentOverlay(state, order) {
  let ov = document.getElementById('paymentOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'paymentOverlay';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(15,23,42,.6);backdrop-filter:blur(3px);';
    document.body.appendChild(ov);
  }
  ov.innerHTML = paymentOverlayHTML(state, order);
}

function closePaymentOverlay() {
  document.getElementById('paymentOverlay')?.remove();
  // Limpia la URL para que el resultado no quede en la barra de direcciones.
  history.replaceState({}, '', '/');
}

async function handlePaymentReturn() {
  // Resultado del pago: por query (?pago=ok|ko, vía función pago-return) o,
  // como respaldo, por ruta (/pago-ok · /pago-ko).
  const query = new URLSearchParams(location.search);
  const pago = query.get('pago');
  const path = location.pathname;
  let result = null;
  if (pago === 'ok' || path === '/pago-ok') result = 'ok';
  else if (pago === 'ko' || path === '/pago-ko') result = 'ko';
  if (!result) return;

  // El pedido llega en la URL (lo añade pago-return desde la respuesta de
  // Redsys); localStorage queda solo como respaldo.
  const order = query.get('order') || localStorage.getItem('nutretium_last_order');

  if (result === 'ko') {
    showPaymentOverlay('ko', order);
    localStorage.removeItem('nutretium_last_order');
    return;
  }

  // Estado ya verificado en el servidor (pago-return comprobó la firma de
  // Redsys). Es la vía normal y no necesita consultar nada más.
  const estado = query.get('estado');
  if (estado === 'PAID' || estado === 'FAILED') {
    localStorage.removeItem('nutretium_last_order');
    showPaymentOverlay(estado === 'PAID' ? 'ok' : 'ko', order);
    return;
  }

  // /pago-ok → confirmar contra el backend (fuente de verdad)
  showPaymentOverlay('loading');
  let status = 'PENDING';
  if (order) {
    for (let i = 0; i < 6; i++) {
      try {
        const r = await fetch(`/.netlify/functions/redsys-status?order=${encodeURIComponent(order)}`);
        const d = await r.json();
        status = d.status;
        if (d.found && (status === 'PAID' || status === 'FAILED')) break;
      } catch { /* reintentar */ }
      await new Promise(res => setTimeout(res, 1200));
    }
  }

  if (status === 'PAID') {
    localStorage.removeItem('nutretium_last_order');
    showPaymentOverlay('ok', order);
  } else if (status === 'FAILED') {
    localStorage.removeItem('nutretium_last_order');
    showPaymentOverlay('ko', order);
  } else {
    showPaymentOverlay('pending', order);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  updateAuthUI();
  loadProducts();   // pinta el catálogo de products-data.js
  loadReviews();    // fetches from DB, falls back to local
  updateCartUI();
  handlePaymentReturn();  // muestra el resultado si venimos de /pago-ok o /pago-ko
});

// ════════════════════════════════════════════════════════════════════════════
//  NUEVAS FUNCIONALIDADES (mega menú, filtros avanzados, carruseles, chat, etc.)
// ════════════════════════════════════════════════════════════════════════════

// ─── BÚSQUEDA POR CATEGORÍA (mega menú + tarjetas) ────────────────────────────
function searchCategory(term) {
  activeFilter = 'Todos';
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === 'Todos')
  );
  ['searchInput', 'navSearchInput', 'mobileSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = term;
  });
  applyFilters();
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
}

// ─── ACORDEÓN MÓVIL ───────────────────────────────────────────────────────────
function toggleMobileAcc(btn) {
  const acc = btn.closest('.mobile-acc');
  if (!acc) return;
  const willOpen = !acc.classList.contains('open');
  document.querySelectorAll('.mobile-acc.open').forEach(a => { if (a !== acc) a.classList.remove('open'); });
  acc.classList.toggle('open', willOpen);
}

// ─── FILTROS AVANZADOS (precio / marca / ofertas / packs) ─────────────────────
const advState = { priceMin: null, priceMax: null, brand: null, offersOnly: false, packsOnly: false };

function toggleAdvFilters() {
  const panel = document.getElementById('advFilters');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  document.getElementById('advFilterBtn')?.setAttribute('aria-expanded', String(open));
}

function setPriceFilter(btn, min, max) {
  const same = advState.priceMin === min && advState.priceMax === max;
  btn.parentElement.querySelectorAll('.adv-chip').forEach(b => b.classList.remove('active'));
  if (same) { advState.priceMin = null; advState.priceMax = null; }
  else { advState.priceMin = min; advState.priceMax = max; btn.classList.add('active'); }
}

function setBrandFilter(btn, brand) {
  const same = advState.brand === brand;
  btn.parentElement.querySelectorAll('.adv-chip').forEach(b => b.classList.remove('active'));
  if (same) advState.brand = null;
  else { advState.brand = brand; btn.classList.add('active'); }
}

function toggleOffersFilter(btn) {
  advState.offersOnly = !advState.offersOnly;
  btn.classList.toggle('active', advState.offersOnly);
}

function togglePacksFilter(btn) {
  advState.packsOnly = !advState.packsOnly;
  btn.classList.toggle('active', advState.packsOnly);
}

function advProductMatches(p) {
  if (advState.priceMin !== null && (p.price < advState.priceMin || p.price > advState.priceMax)) return false;
  if (advState.brand) {
    const brand = (p.brand || 'Nutretium').toLowerCase();
    if (brand !== advState.brand.toLowerCase()) return false;
  }
  if (advState.offersOnly) {
    const isOffer = p.featured || p.offer || (p.badge && /(oferta|destacado|top)/i.test(p.badge)) || p.oldPrice;
    if (!isOffer) return false;
  }
  if (advState.packsOnly) {
    const isPack = p.pack || /pack/i.test(p.name) || /pack/i.test(p.category || '');
    if (!isPack) return false;
  }
  return true;
}

function applyAdvFilters() {
  applyFilters();
  toggleAdvFilters();
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
}

function resetAdvFilters() {
  advState.priceMin = null; advState.priceMax = null; advState.brand = null;
  advState.offersOnly = false; advState.packsOnly = false;
  document.querySelectorAll('#advFilters .adv-chip').forEach(b => b.classList.remove('active'));
  applyFilters();
}

// ─── CARRUSELES DE PRODUCTOS (novedades / recomendados) ───────────────────────
function miniCard(product) {
  return `
    <article class="flex-shrink-0 w-52 sm:w-56 bg-brand-card border border-brand-border rounded-2xl overflow-hidden flex flex-col hover:border-brand-gold/50 transition-colors">
      <div class="relative bg-gradient-to-br from-[#0f0f0f] to-brand-card h-40 overflow-hidden">
        ${product.image
          ? `<img src="${product.image}" alt="${product.name}" loading="lazy" class="w-full h-full ${product.image.startsWith('sources/') ? 'object-contain p-2' : 'object-cover'}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><div class="absolute inset-0 hidden items-center justify-center text-6xl">${product.emoji}</div>`
          : `<div class="w-full h-full flex items-center justify-center text-6xl">${product.emoji}</div>`}
        ${product.badge ? `<span class="absolute top-2 left-2 ${product.badgeColor} text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">${product.badge}</span>` : ''}
      </div>
      <div class="p-4 flex flex-col flex-1">
        <h3 class="font-bold text-sm leading-snug mb-1">${product.name}</h3>
        ${product.reviews > 0 ? `<div class="flex items-center gap-1 mb-3 text-xs text-brand-muted"><span class="leading-none">${renderStars(product.rating)}</span><span>(${product.reviews})</span></div>` : ''}
        <div class="flex items-center justify-between gap-2 mt-auto">
          <span class="text-lg font-black text-white">€${product.price.toFixed(2)}</span>
          ${!inStock(product)
            ? `<button disabled class="bg-brand-border/40 text-brand-muted font-bold text-xs px-3 py-2 rounded-lg cursor-not-allowed">Agotado</button>`
            : `<button onclick="${product.customizable ? `openCustomModal(${product.id})` : `addToCart(${product.id})`}"
            class="bg-brand-border text-white hover:bg-brand-gold hover:text-black font-bold text-xs px-3 py-2 rounded-lg transition-colors">
            ${product.customizable ? '✨' : '+ Añadir'}
          </button>`}
        </div>
      </div>
    </article>`;
}

function renderNovedades() {
  const grid = document.getElementById('novedadesGrid');
  if (!grid) return;
  // Los carruseles solo muestran producto servible.
  const list = PRODUCTS.filter(inStock)
    .sort((a, b) => ((b.badge === 'Nuevo') - (a.badge === 'Nuevo')) || ((b.badge === 'Oferta') - (a.badge === 'Oferta')))
    .slice(0, 8);
  grid.innerHTML = list.map(miniCard).join('');
}

function renderRecomendados() {
  const grid = document.getElementById('recomendadosGrid');
  if (!grid) return;
  const list = PRODUCTS.filter(inStock).sort((a, b) => b.rating - a.rating).slice(0, 8);
  grid.innerHTML = list.map(miniCard).join('');
}

// ─── RADIO / HILO MUSICAL ─────────────────────────────────────────────────────
let radioPlaying = false;
function toggleRadio() {
  const audio  = document.getElementById('radioAudio');
  const icon   = document.getElementById('radioIcon');
  const label  = document.getElementById('radioLabel');
  const pulse  = document.getElementById('radioPulse');
  const status = document.getElementById('radioStatus');
  if (!audio) return;

  if (radioPlaying) {
    audio.pause();
    radioPlaying = false;
    if (icon) icon.textContent = '▶';
    if (label) label.textContent = 'Escuchar';
    pulse?.classList.remove('playing');
    if (status) status.textContent = 'Pausado. Pulsa play para seguir escuchando.';
  } else {
    audio.play().then(() => {
      radioPlaying = true;
      if (icon) icon.textContent = '⏸';
      if (label) label.textContent = 'Pausar';
      pulse?.classList.add('playing');
      if (status) status.textContent = '🔴 En directo · Los 40 Principales';
    }).catch(() => {
      if (status) status.textContent = 'No se pudo conectar con la emisora. Inténtalo de nuevo.';
      showToast('No se pudo iniciar la radio.');
    });
  }
}

// ─── CHAT FLOTANTE ────────────────────────────────────────────────────────────
let chatOpen = false;
function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chatPop')?.classList.toggle('open', chatOpen);
  if (chatOpen) setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
}

function chatAddMsg(text, mine = false) {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const div = document.createElement('div');
  div.className = mine
    ? 'bg-brand-gold text-black rounded-xl rounded-tr-sm p-3 text-sm ml-auto max-w-[80%] font-semibold'
    : 'bg-brand-dark border border-brand-border rounded-xl rounded-tl-sm p-3 text-sm max-w-[85%]';
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

// Mensaje del bot que puede incluir botones/enlaces (HTML controlado por nosotros)
function chatAddBot(html) {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'bg-brand-dark border border-brand-border rounded-xl rounded-tl-sm p-3 text-sm max-w-[90%] space-y-2';
  div.innerHTML = html;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

// Indicador "escribiendo…"
function chatTyping() {
  const body = document.getElementById('chatBody');
  if (!body) return null;
  const div = document.createElement('div');
  div.className = 'bg-brand-dark border border-brand-border rounded-xl rounded-tl-sm p-3 text-sm max-w-[60%] text-brand-muted';
  div.textContent = 'Escribiendo…';
  div.dataset.typing = '1';
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}

function _esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function _norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function _hasAny(t, arr) { return arr.some(w => t.includes(w)); }

const chatBtn = (label, action) =>
  `<button onclick="${action}" class="block w-full text-left bg-brand-card border border-brand-border rounded-lg px-3 py-2 text-xs font-bold text-brand-gold hover:bg-brand-gold hover:text-black transition-colors">${label}</button>`;

let chatAwaitingOrder = false;

function chatQuick(type) {
  if (type === 'seguimiento') {
    chatAddMsg('Seguimiento de pedido', true);
    chatAwaitingOrder = true;
    chatBotDelayed(() => chatAddBot('Claro 📦 Dime tu <strong>número de pedido</strong> (ej. <strong>NTR-12345</strong>) y te digo el estado del envío.'));
  } else {
    chatAddMsg('Otras consultas', true);
    chatBotDelayed(() => chatAddBot(
      '¿Con qué te ayudo? Puedes preguntarme por:' +
      chatBtn('💳 Formas de pago', "chatAsk('formas de pago')") +
      chatBtn('🚚 Envíos y plazos', "chatAsk('envío y plazos')") +
      chatBtn('↩️ Devoluciones', "chatAsk('devoluciones')") +
      chatBtn('🔎 Buscar un producto', "chatAsk('buscar producto')") +
      chatBtn('💪 Entrenador personal', "chatAsk('entrenador personal')")
    ));
  }
}

// Simula que el cliente pulsa una sugerencia
function chatAsk(text) {
  chatAddMsg(text, true);
  chatBotDelayed(() => chatReply(text));
}

function chatSend() {
  const input = document.getElementById('chatInput');
  const text  = input && input.value.trim();
  if (!text) return;
  chatAddMsg(text, true);
  input.value = '';
  chatBotDelayed(() => chatReply(text));
}

// Muestra "escribiendo…" y después ejecuta la respuesta
function chatBotDelayed(fn) {
  const typing = chatTyping();
  setTimeout(() => { if (typing) typing.remove(); fn(); }, 650);
}

// ─── MOTOR DE RESPUESTAS (detección de intención) ─────────────────────────────
function chatReply(userText) {
  const t = _norm(userText);

  // Seguimiento de pedido: si estábamos esperando el número
  if (chatAwaitingOrder) {
    chatAwaitingOrder = false;
    const m = userText.match(/([A-Za-z]{2,4}[-\s]?\d{3,6}|\d{4,8})/);
    if (m) {
      const estados = ['En preparación 📦', 'Enviado ✈️', 'En reparto 🚚', 'Entregado ✅'];
      const digits = m[0].replace(/\D/g, '');
      const idx = digits.split('').reduce((a, c) => a + (+c), 0) % estados.length;
      chatAddBot(`Tu pedido <strong>${_esc(m[0].toUpperCase())}</strong> está: <strong class="text-brand-gold">${estados[idx]}</strong>.<br/>Recibirás un email con el número de seguimiento del transportista. ¿Algo más?`);
      return;
    }
    // si no parece número, seguimos con detección normal
  }

  // Formas de pago
  if (_hasAny(t, ['pago', 'pagar', 'tarjeta', 'bizum', 'paypal', 'klarna', 'sequra', 'apple pay', 'google pay', 'financi', 'a plazos', 'plazos'])) {
    chatAddBot('💳 Aceptamos: <strong>Tarjeta, PayPal, Bizum, SeQura, Klarna, Apple Pay y Google Pay</strong>.<br/>Pago 100% seguro con Redsys y cifrado SSL. Con <strong>SeQura</strong> y <strong>Klarna</strong> puedes fraccionar el pago a plazos.');
    return;
  }

  // Envíos
  if (_hasAny(t, ['envio', 'enviar', 'entrega', 'tarda', 'plazo', 'llega', 'cuando recibo', 'peninsula', 'canarias', 'baleares', 'gastos de envio', 'coste de envio', 'portes'])) {
    chatAddBot('🚚 <strong>Envío express en 24–48 h</strong> laborables.<br/>• <strong>Gratis</strong> a partir de 50€ en península (por debajo, 3,95€).<br/>• Enviamos a península, Baleares, Canarias, Ceuta y Melilla.<br/>Recibirás un email con el seguimiento al salir tu pedido.');
    return;
  }

  // Devoluciones
  if (_hasAny(t, ['devolu', 'devolver', 'reembolso', 'cambiar', 'cambio', 'garantia', 'me arrepiento', 'no me gusta'])) {
    chatAddBot('↩️ Tienes <strong>30 días</strong> para devolver. El producto debe ir sin abrir.<br/>Reembolso en 5–7 días y <strong>envío de vuelta gratuito</strong>. Los cambios no tienen coste.');
    return;
  }

  // Seguimiento de pedido (activación)
  if (_hasAny(t, ['seguimiento', 'mi pedido', 'donde esta mi', 'rastre', 'tracking', 'estado del pedido', 'estado de mi', 'numero de pedido', 'n de pedido'])) {
    chatAwaitingOrder = true;
    chatAddBot('Claro 📦 Dime tu <strong>número de pedido</strong> (ej. <strong>NTR-12345</strong>) y te digo el estado del envío.');
    return;
  }

  // Horario / ubicación
  if (_hasAny(t, ['horario', 'abierto', 'abris', 'abren', 'cierran', 'cierra', 'hora', 'ubicacion', 'donde estais', 'donde esta la tienda', 'direccion', 'como llegar', 'tienda fisica'])) {
    chatAddBot('📍 Estamos en <strong>Calle la Albericia Nº1, Santander</strong>.<br/>🕘 Horario: <strong>Lun–Sáb 09:00–21:00</strong> (domingo cerrado).' +
      chatBtn('🗺️ Cómo llegar / ver mapa', "document.getElementById('location').scrollIntoView({behavior:'smooth'}); toggleChat()"));
    return;
  }

  // Contacto
  if (_hasAny(t, ['contacto', 'telefono', 'llamar', 'email', 'correo', 'whatsapp', 'hablar con', 'asesor', 'persona', 'humano', 'agente'])) {
    chatAddBot('📞 Puedes llamarnos al <strong>633 653 517</strong> (Lun–Sáb 09:00–21:00) o escribir a <strong>info@nutretium.com</strong>.' +
      chatBtn('✉️ Enviar un mensaje', "document.getElementById('contact').scrollIntoView({behavior:'smooth'}); toggleChat()"));
    return;
  }

  // Ofertas / descuentos / registro
  if (_hasAny(t, ['oferta', 'descuento', 'promocion', 'codigo', 'cupon', 'rebaja', 'primer pedido', 'registr', 'cuenta', 'darme de alta'])) {
    chatAddBot('🎁 <strong>10% de descuento en tu primer pedido</strong> al registrarte, y <strong>envío gratis</strong> a partir de 50€.' +
      chatBtn('📝 Registrarme ahora', "openModal('registerModal'); toggleChat()") +
      chatBtn('🏷️ Ver productos destacados', "document.getElementById('recomendados').scrollIntoView({behavior:'smooth'}); toggleChat()"));
    return;
  }

  // Entrenador personal
  if (_hasAny(t, ['entrenador', 'entrenamiento', 'rutina', 'dieta', 'plan de', 'personal trainer', 'nutricion', 'perder peso', 'ganar masa'])) {
    chatAddBot('💪 Ofrecemos <strong>Entrenador Personal</strong>: tablas de entrenamiento, dietas y rutinas 100% personalizadas. Primera evaluación gratuita.' +
      chatBtn('📋 Solicitar mi plan', "openModal('trainerModal'); toggleChat()"));
    return;
  }

  // Take Away
  if (_hasAny(t, ['take away', 'takeaway', 'recoger', 'para llevar', 'batido', 'recogida', 'bowl'])) {
    chatAddBot('🥤 En nuestra zona <strong>Take Away</strong> pides batidos, bowls y snacks listos para recoger en 15 min.' +
      chatBtn('🛍️ Hacer pedido Take Away', "openModal('takeawayModal'); toggleChat()"));
    return;
  }

  // Saludo
  if (_hasAny(t, ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'saludos'])) {
    chatAddBot('¡Hola! 👋 Soy el asistente de NUTRETIUM. Puedo ayudarte con pagos, envíos, devoluciones, seguimiento de pedidos o encontrar el producto ideal. ¿Qué necesitas?');
    return;
  }

  // Agradecimiento
  if (_hasAny(t, ['gracias', 'genial', 'perfecto', 'muchas gracias', 'thanks'])) {
    chatAddBot('¡A ti! 😊 Si necesitas algo más, aquí estoy.');
    return;
  }

  // Búsqueda de productos en el catálogo real
  const found = chatSearchCatalog(userText);
  if (found.list.length) {
    const items = found.list.slice(0, 3).map(p =>
      `<div class="flex items-center justify-between gap-2 border-b border-brand-border/50 pb-1"><span>${_esc(p.name)}</span><strong class="text-brand-gold whitespace-nowrap">€${p.price.toFixed(2)}</strong></div>`
    ).join('');
    const q = found.query.replace(/'/g, '');
    const lbl = found.label ? ' de <strong>' + _esc(found.label) + '</strong>' : '';
    chatAddBot('Esto es lo que tenemos' + lbl + ':' +
      '<div class="space-y-1 my-1">' + items + '</div>' +
      chatBtn('🔎 Ver todos en el catálogo', "searchCategory('" + q + "'); toggleChat()"));
    return;
  }

  // Fallback
  chatAddBot('Mmm, no estoy seguro de haberte entendido 🤔. Puedo ayudarte con:' +
    chatBtn('💳 Formas de pago', "chatAsk('formas de pago')") +
    chatBtn('🚚 Envíos', "chatAsk('envíos')") +
    chatBtn('↩️ Devoluciones', "chatAsk('devoluciones')") +
    chatBtn('📦 Seguimiento de pedido', "chatAsk('seguimiento de pedido')") +
    '<p class="text-xs text-brand-muted pt-1">O llama al <strong>633 653 517</strong> y te atiende una persona.</p>');
}

// Busca productos en el catálogo real a partir del texto libre
function chatSearchCatalog(userText) {
  const stop = new Set(['para', 'como', 'cual', 'cuales', 'tienes', 'teneis', 'quiero', 'busco', 'una', 'uno', 'unos', 'unas', 'del', 'los', 'las', 'con', 'por', 'que', 'mas', 'muy', 'precio', 'producto', 'productos', 'hay', 'algun', 'alguna', 'sobre', 'puedes', 'recomienda', 'recomiendame', 'necesito', 'dame', 'buscar', 'ver', 'teneis', 'vendeis']);
  const tokens = _norm(userText).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stop.has(w));
  if (!tokens.length || typeof PRODUCTS === 'undefined') return { list: [], label: '', query: userText };

  const cheap = _hasAny(_norm(userText), ['barat', 'economic', 'mas barato', 'menos de', 'ofert']);
  const scored = [];
  PRODUCTS.forEach(p => {
    const hay = _norm(`${p.name} ${p.category} ${p.description || ''}`);
    let score = 0;
    tokens.forEach(tok => { if (hay.includes(tok)) score += (_norm(p.category).includes(tok) ? 2 : 1); });
    if (score > 0) scored.push({ p, score });
  });
  if (!scored.length) return { list: [], label: '', query: userText };

  scored.sort((a, b) => cheap ? (a.p.price - b.p.price) : (b.score - a.score || a.p.price - b.p.price));
  // etiqueta = categoría más frecuente entre los resultados
  const cats = {};
  scored.forEach(s => { cats[s.p.category] = (cats[s.p.category] || 0) + 1; });
  const label = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0] || '';
  return { list: scored.map(s => s.p), label, query: tokens[0] || userText };
}

// ─── TAKE AWAY ────────────────────────────────────────────────────────────────
function submitTakeaway() {
  const name    = document.getElementById('taName').value.trim();
  const product = document.getElementById('taProduct').value;
  const time    = document.getElementById('taTime').value;
  const errEl   = document.getElementById('taError');
  errEl.classList.add('hidden');

  if (!name) { showFieldError(errEl, 'Indica tu nombre.'); return; }
  if (!time) { showFieldError(errEl, 'Selecciona una hora de recogida.'); return; }

  closeModal('takeawayModal');
  showToast(`¡Pedido confirmado! ${product} listo a las ${time} 🥤`);
  document.getElementById('taName').value = '';
  document.getElementById('taTime').value = '';
}

// ─── TEST DE PERFILADO (post-registro) ────────────────────────────────────────
const testAnswers = {};
function selectTest(btn, group, value) {
  testAnswers[group] = value;
  document.querySelectorAll(`.test-opt[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function submitTest() {
  if (!testAnswers.goal) { showToast('Selecciona al menos tu objetivo principal.'); return; }
  closeModal('testModal');
  showToast('¡Perfil guardado! Te mostramos lo mejor para ti 🎯');
  setTimeout(() => filterByGoal(testAnswers.goal), 400);
}

// ─── MODAL DE INFORMACIÓN (legal / FAQs / afiliación) ─────────────────────────
const INFO_CONTENT = {
  afiliacion: {
    title: 'Programa de afiliación y fidelización',
    html: `
      <p>Gana mientras compartes lo que te gusta. Con el <strong class="text-brand-gold">Club Nutretium</strong> sumas puntos en cada compra que canjeas por descuentos exclusivos.</p>
      <p><strong class="text-white">Fidelización:</strong> 1€ gastado = 1 punto. 100 puntos = 5€ de descuento.</p>
      <p><strong class="text-white">Afiliación:</strong> recomienda a tus amigos con tu código personal y gana un 10% de comisión por cada pedido que realicen.</p>
      <p>Escríbenos a <a href="mailto:info@nutretium.com" class="text-brand-gold hover:underline">info@nutretium.com</a> para unirte.</p>`
  },
  faqs: {
    title: 'Preguntas frecuentes (FAQs)',
    html: `
      <p><strong class="text-white">¿Cuánto tarda mi pedido?</strong><br/>Envío express en 24–48 h laborables. Gratis a partir de 50€ en península.</p>
      <p><strong class="text-white">¿Puedo devolver un producto?</strong><br/>Sí, dispones de 30 días. El producto debe estar sin abrir.</p>
      <p><strong class="text-white">¿Los productos están certificados?</strong><br/>Todos cuentan con certificación ISO 22000 y GMP, y muchos con Informed Sport.</p>
      <p><strong class="text-white">¿Tenéis asesoramiento?</strong><br/>Sí, contacta con nuestro equipo o solicita un Entrenador Personal.</p>`
  },
  envios: {
    title: 'Información de envíos',
    html: `
      <p>Realizamos envíos a toda la <strong class="text-white">península, Baleares, Canarias, Ceuta y Melilla</strong>.</p>
      <p><strong class="text-white">Plazos:</strong> 24–48 h laborables en península.</p>
      <p><strong class="text-white">Gastos:</strong> envío gratis en pedidos superiores a 50€ (península). Por debajo, 3,95€.</p>
      <p>Recibirás un email con el número de seguimiento en cuanto tu pedido salga de nuestro almacén.</p>`
  },
  condiciones: {
    title: 'Condiciones generales de contratación',
    html: `
      <p>Las presentes condiciones regulan la relación comercial entre NUTRETIUM S.L. (CIF B-27659754) y el cliente.</p>
      <p>Los precios incluyen IVA. NUTRETIUM se reserva el derecho de modificar precios y catálogo. La confirmación del pedido implica la aceptación de estas condiciones.</p>
      <p>El pago se realiza de forma segura mediante Redsys y los métodos disponibles en la web.</p>`
  },
  privacidad: {
    title: 'Política de privacidad',
    html: `
      <p>En NUTRETIUM tratamos tus datos conforme al RGPD (UE) 2016/679 y la LOPDGDD.</p>
      <p><strong class="text-white">Responsable:</strong> NUTRETIUM S.L. · <strong class="text-white">Finalidad:</strong> gestión de pedidos, cuenta y comunicaciones.</p>
      <p>Puedes ejercer tus derechos de acceso, rectificación y supresión escribiendo a <a href="mailto:info@nutretium.com" class="text-brand-gold hover:underline">info@nutretium.com</a>.</p>`
  },
  cookies: {
    title: 'Uso de cookies',
    html: `
      <p>Utilizamos cookies propias y de terceros para mejorar tu experiencia, analizar el tráfico y personalizar contenidos.</p>
      <p>Puedes aceptar, rechazar o configurar las cookies en cualquier momento desde tu navegador.</p>
      <p>Las cookies técnicas son necesarias para el funcionamiento de la tienda y no requieren consentimiento.</p>`
  },
  aviso: {
    title: 'Aviso legal',
    html: `
      <p><strong class="text-white">Titular:</strong> NUTRETIUM S.L. · CIF B-27659754.</p>
      <p><strong class="text-white">Domicilio:</strong> Calle la Albericia Nº1, 39012 Santander, España.</p>
      <p><strong class="text-white">Contacto:</strong> <a href="mailto:info@nutretium.com" class="text-brand-gold hover:underline">info@nutretium.com</a> · 633 653 517.</p>
      <p>El acceso y uso de este sitio web atribuye la condición de usuario y la aceptación de las presentes condiciones.</p>`
  }
};

function openInfo(key) {
  const data = INFO_CONTENT[key];
  if (!data) return;
  document.getElementById('infoTitle').textContent = data.title;
  document.getElementById('infoBody').innerHTML = data.html;
  openModal('infoModal');
}