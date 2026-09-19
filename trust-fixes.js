/* NUTRETIUM — Trust & Safety frontend corrections
   Loaded after app.js. Keeps existing functionality but removes unsupported
   claims and closes unsafe HTML rendering paths. */
'use strict';

(function () {
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  /* ── Safe auth UI: never interpolate a user-supplied name as raw HTML. ── */
  window.updateAuthUI = function updateAuthUITrustSafe() {
    const authButtons = document.getElementById('authButtons');
    const profileMenu = document.getElementById('profileMenu');
    const profileName = document.getElementById('profileName');
    const mobileAuth = document.getElementById('mobileAuthButtons');

    if (authButtons) {
      authButtons.classList.add('hidden');
      authButtons.classList.toggle('lg:flex', !currentUser);
    }
    if (profileMenu) profileMenu.classList.toggle('hidden', !currentUser);

    const enlacePanel = document.getElementById('enlacePanel');
    if (enlacePanel) enlacePanel.classList.toggle('hidden', !currentUser || currentUser.role !== 'admin');

    if (currentUser) {
      const safeName = esc(currentUser.name || 'Mi cuenta');
      if (profileName) profileName.textContent = currentUser.name || 'Mi cuenta';
      if (mobileAuth) {
        mobileAuth.innerHTML = `
          <p class="px-4 py-2 text-xs text-brand-muted">Hola, <strong class="text-brand-gold">${safeName}</strong></p>
          <button onclick="toggleMobileMenu(); logout()" class="block w-full text-left px-4 py-3 rounded-lg text-red-400 font-semibold transition-colors">Cerrar sesión</button>
        `;
      }
    } else if (mobileAuth) {
      mobileAuth.innerHTML = `
        <button onclick="toggleMobileMenu(); openModal('loginModal')" class="block w-full text-left px-4 py-3 rounded-lg text-brand-muted hover:text-white hover:bg-white/5 font-semibold transition-colors">Iniciar sesión</button>
        <button onclick="toggleMobileMenu(); openModal('registerModal')" class="block w-full text-left px-4 py-3 rounded-lg text-brand-gold font-bold transition-colors">Registrarse</button>
      `;
    }
  };

  /* ── Reviews: escape user content and never fake a successful submission. ── */
  window.renderReviews = function renderReviewsTrustSafe() {
    const grid = document.getElementById('reviewsGrid');
    if (!grid) return;

    if (typeof REVIEWS === 'undefined' || !REVIEWS.length) {
      grid.innerHTML = `
        <div class="col-span-full bg-brand-card border border-brand-border rounded-2xl p-8 text-center">
          <p class="text-sm text-brand-muted">Todavía no hay opiniones publicadas.</p>
        </div>`;
      return;
    }

    grid.innerHTML = REVIEWS.map((r) => {
      const rating = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
      return `
        <div class="bg-brand-card border border-brand-border rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex text-brand-gold text-lg leading-none">${'★'.repeat(rating)}<span style="color:#2a2200">${'★'.repeat(5 - rating)}</span></div>
            <span class="text-xs text-brand-muted">${esc(r.date)}</span>
          </div>
          <p class="text-sm text-white leading-relaxed">“${esc(r.text)}”</p>
          <div class="mt-auto pt-2 border-t border-brand-border flex items-center justify-between gap-3">
            <span class="text-xs font-bold text-brand-gold">${esc(r.author)}</span>
            <span class="text-xs text-brand-muted text-right">${esc(r.product)}</span>
          </div>
        </div>`;
    }).join('');
  };

  window.submitReview = async function submitReviewTrustSafe() {
    const product = document.getElementById('reviewProduct')?.value || '';
    const author = document.getElementById('reviewAuthor')?.value.trim() || '';
    const text = document.getElementById('reviewText')?.value.trim() || '';
    const errEl = document.getElementById('reviewError');
    if (errEl) errEl.classList.add('hidden');

    if (!product) return showFieldError(errEl, 'Selecciona un producto.');
    if (!reviewStarValue) return showFieldError(errEl, 'Selecciona una valoración.');
    if (!author) return showFieldError(errEl, 'Escribe tu nombre.');
    if (!text) return showFieldError(errEl, 'Escribe un comentario.');

    const review = { author, product, rating: reviewStarValue, text };

    try {
      const res = await fetch('/.netlify/functions/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', review }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la reseña.');

      closeModal('reviewModal');
      showToast('Gracias. Tu reseña se publicará tras ser revisada.');
    } catch (err) {
      showFieldError(errEl, err.message || 'No se pudo enviar la reseña. Inténtalo de nuevo.');
    }
  };

  /* ── Legal / FAQ copy grounded in what is implemented and verified. ── */
  try {
    if (typeof INFO_CONTENT !== 'undefined') {
      Object.values(INFO_CONTENT).forEach((entry) => {
        if (entry && typeof entry.html === 'string') {
          entry.html = entry.html.replace(/NUTRETIUM S\.L\./g, 'BAHÍA NORTE CAPITAL, S.L.');
        }
      });

      INFO_CONTENT.faqs = {
        title: 'Preguntas frecuentes (FAQs)',
        html: `
          <p><strong class="text-white">¿Dónde está Nutretium?</strong><br/>Puedes visitarnos en Calle La Albericia 1, Santander.</p>
          <p><strong class="text-white">¿Cómo puedo saber si un producto es adecuado para mí?</strong><br/>Consulta la ficha y el etiquetado del producto. Si tienes dudas sobre ingredientes, alérgenos o uso, contacta con el equipo antes de comprar.</p>
          <p><strong class="text-white">¿Los productos tienen certificaciones?</strong><br/>Las certificaciones dependen de cada fabricante y referencia. No atribuimos una certificación global a todo el catálogo.</p>
          <p><strong class="text-white">¿Cómo se gestiona una devolución?</strong><br/>Contacta con atención al cliente indicando tu pedido y el producto. Te informaremos de las condiciones aplicables según el tipo de artículo y la normativa vigente.</p>`
      };

      INFO_CONTENT.condiciones = {
        title: 'Condiciones generales de contratación',
        html: `
          <p>Las presentes condiciones regulan la relación comercial entre <strong class="text-white">BAHÍA NORTE CAPITAL, S.L.</strong> (NIF B27659754), titular de Nutretium, y el cliente.</p>
          <p>Los precios mostrados en la tienda son los precios de venta vigentes en el catálogo publicado. Antes de confirmar el pago se valida el contenido del carrito en el servidor.</p>
          <p>El pago online se procesa mediante la pasarela bancaria Redsys. Las condiciones de envío, entrega y devolución aplicables se informarán al cliente durante el proceso de compra y/o atención al cliente.</p>`
      };

      INFO_CONTENT.aviso = {
        title: 'Aviso legal',
        html: `
          <p><strong class="text-white">Titular:</strong> BAHÍA NORTE CAPITAL, S.L. · NIF B27659754.</p>
          <p><strong class="text-white">Domicilio social:</strong> Avda. de la Concordia 6, 5º E, 39600 Muriedas (Camargo), Cantabria.</p>
          <p><strong class="text-white">Establecimiento Nutretium:</strong> Calle La Albericia 1, 39012 Santander, Cantabria.</p>
          <p><strong class="text-white">Contacto:</strong> <a href="mailto:appnutretium@gmail.com" class="text-brand-gold hover:underline">appnutretium@gmail.com</a> · 633 753 517.</p>`
      };
    }
  } catch (err) {
    console.warn('[Trust] No se pudieron actualizar los textos legales:', err);
  }

  function replaceText(root, from, to) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue && node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
    });
  }

  function applyTrustCorrections() {
    /* Visible business identity and hours. */
    replaceText(document.body, 'NUTRETIUM S.L.', 'BAHÍA NORTE CAPITAL, S.L.');
    replaceText(document.body, 'Lun – Sáb   09:00 – 21:00', 'Lun – Sáb   09:30 – 22:00');
    replaceText(document.body, 'Lunes – Sábado: 09:00 – 21:00', 'Lunes – Sábado: 09:30 – 22:00');

    /* Do not label reviews as verified purchases when purchase verification is not implemented. */
    replaceText(document.body, 'Opiniones verificadas de compradores reales.', 'Opiniones publicadas tras revisión.');

    /* Product grid is a catalog, not a proven bestseller ranking. */
    replaceText(document.body, 'Los más vendidos de nuestra tienda.', 'Explora el catálogo disponible de Nutretium.');

    /* Trainer claims: keep the service without unsupported credentials / response guarantees. */
    replaceText(document.body, 'Trabaja con profesionales certificados y consigue resultados reales con un acompañamiento 100% personalizado.', 'Solicita información sobre el servicio de entrenamiento y el acompañamiento disponible.');
    replaceText(document.body, 'Primera evaluación gratuita · Respuesta en menos de 24 h', 'Consulta disponibilidad y condiciones del servicio.');
    replaceText(document.body, 'Te contactaremos en menos de 24 h para confirmar tu sesión gratuita de evaluación.', 'Te contactaremos para informarte de disponibilidad, condiciones y próximos pasos.');

    /* Take Away: remove timing and price promises that are hardcoded outside the catalog. */
    replaceText(document.body, 'Pedido listo en 15 minutos', 'Consulta el tiempo estimado al realizar el pedido');
    replaceText(document.body, 'Paga online o al recoger', 'Consulta las opciones de pago disponibles');
    document.querySelectorAll('#takeaway .text-brand-muted.text-xs').forEach((el) => {
      if (/Desde\s+[0-9]/i.test(el.textContent || '')) el.textContent = 'Consulta carta y disponibilidad';
    });
    document.querySelectorAll('#taProduct option').forEach((opt) => {
      opt.textContent = opt.textContent.replace(/\s+—\s+[0-9].*€\s*$/u, '');
    });

    /* Careers: no fictitious open positions. Keep spontaneous applications only. */
    const careers = document.getElementById('careersModal');
    if (careers) {
      const positions = careers.querySelector('.grid.sm\\:grid-cols-3');
      if (positions) positions.style.display = 'none';
      replaceText(careers, '¿Apasionado/a por el deporte y la nutrición? Queremos conocerte.', 'Si quieres formar parte de Nutretium, puedes enviarnos una candidatura espontánea.');
      replaceText(careers, 'Nos pondremos en contacto contigo en un plazo de 5 días hábiles.', 'Revisaremos las candidaturas cuando exista una necesidad de incorporación.');
      const select = document.getElementById('careerPosition');
      if (select) {
        select.innerHTML = '<option value="Candidatura espontánea">Candidatura espontánea</option>';
      }
    }

    /* Remove the hardcoded >50€ promotion until commercial conditions are documented. */
    document.querySelectorAll('section').forEach((section) => {
      if ((section.textContent || '').includes('Compras superiores a')) section.style.display = 'none';
    });

    /* Promo ribbon: keep brand/location, not unverified discounts. */
    const promo = document.body.querySelector('body > div.bg-gradient-to-r');
    if (promo) {
      const p = promo.querySelector('p');
      if (p) p.textContent = 'NUTRETIUM SANTANDER · SUPLEMENTACIÓN DEPORTIVA · ALIMENTACIÓN SALUDABLE';
    }

    /* Footer brand copy: factual, local and concrete. */
    const why = Array.from(document.querySelectorAll('footer h4')).find((h) => (h.textContent || '').trim() === 'Por qué Nutretium');
    if (why?.nextElementSibling) {
      why.nextElementSibling.textContent = 'Nutretium combina suplementación deportiva, alimentación saludable y atención en tienda física en Santander. Nuestro objetivo es ofrecer un catálogo claro, precios visibles y ayuda directa para resolver dudas antes de comprar.';
    }

    /* Return promises in footer are not shown until the policy is documented. */
    const customerHeading = Array.from(document.querySelectorAll('footer h4')).find((h) => (h.textContent || '').trim() === 'Atención al cliente');
    const list = customerHeading?.nextElementSibling;
    if (list) {
      Array.from(list.querySelectorAll('li')).forEach((li) => {
        const txt = li.textContent || '';
        if (/30 días|vuelta gratuito|Cambios sin coste/i.test(txt)) li.remove();
      });
    }

    /* Checkout copy: avoid absolute security wording; state the actual provider. */
    replaceText(document.body, 'Pago 100% seguro · Cifrado SSL · Redsys', 'Pago procesado mediante Redsys');

    /* Re-run safe UI/renderers after originals have initialized. */
    try { updateAuthUI(); } catch (_) {}
    try { renderReviews(); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTrustCorrections, { once: true });
  } else {
    applyTrustCorrections();
  }
})();
