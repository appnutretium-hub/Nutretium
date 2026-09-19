/* Nutretium enterprise storefront layer — loaded after app.js */
(function () {
  'use strict';
  let promoCode = '';
  let lastQuote = null;

  const euro = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
  const cartItems = () => Array.from(cart.values()).map((item) => ({ id:item.product.id, code:item.product.code, qty:item.quantity }));

  function injectCheckout() {
    const button = document.getElementById('redsysBtn');
    if (!button || document.getElementById('ntCheckoutBenefits')) return;
    const box = document.createElement('div');
    box.id = 'ntCheckoutBenefits';
    box.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #292929;border-radius:12px;background:#0e0e0e';
    box.innerHTML = '<label style="display:block;font-size:11px;color:#9b958b;margin-bottom:6px">Código promocional</label><div style="display:flex;gap:7px"><input id="ntPromoCode" maxlength="40" autocomplete="off" placeholder="Cupón" style="min-width:0;flex:1;background:#080808;color:white;border:1px solid #333;border-radius:8px;padding:9px"><button type="button" id="ntApplyPromo" style="border:1px solid #d4af37;background:#d4af37;color:#080808;border-radius:8px;padding:8px 11px;font-weight:800">Aplicar</button></div><div id="ntQuote" style="font-size:11px;color:#aaa;margin-top:8px">Descuentos y gastos se validan en servidor al pagar.</div>';
    button.parentElement.insertBefore(box, button);
    document.getElementById('ntApplyPromo').onclick = quote;
  }

  async function quote() {
    if (!currentUser?.token) { showToast('Inicia sesión para validar el cupón.'); return; }
    promoCode = (document.getElementById('ntPromoCode')?.value || '').trim();
    try {
      const response = await fetch('/.netlify/functions/checkout-enterprise', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'quote',items:cartItems(),token:currentUser.token,promotionCode:promoCode}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo calcular el pedido.');
      lastQuote = data.quote;
      document.getElementById('ntQuote').innerHTML = `Subtotal ${euro(data.quote.subtotal)} · Descuento ${euro(data.quote.discount)} · Envío ${euro(data.quote.shipping)} · <b style="color:#d4af37">Total ${euro(data.quote.total)}</b>`;
    } catch (error) {
      lastQuote = null;
      document.getElementById('ntQuote').textContent = error.message;
    }
  }

  async function pay() {
    const total = getCartTotal();
    if (total <= 0) return;
    const button = document.getElementById('redsysBtn');
    const label = document.getElementById('redsysBtnText');
    if (!currentUser) { showToast('Para pagar necesitas iniciar sesión.'); openModal('loginModal'); return; }
    if (!currentUser.direccionCompleta) { showToast('Completa tu dirección de envío antes de pagar.'); if (typeof openProfile === 'function') openProfile(); return; }
    button.disabled = true;
    if (label) label.innerHTML = '<span class="spinner"></span> Procesando...';
    try {
      const response = await fetch('/.netlify/functions/checkout-enterprise', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'pay',items:cartItems(),token:currentUser.token,promotionCode:promoCode}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar el pago.');
      if (!data.Ds_SignatureVersion || !data.Ds_MerchantParameters || !data.Ds_Signature || !data.redsysUrl) throw new Error('Respuesta inválida del servidor de pagos.');
      if (data.order) localStorage.setItem('nutretium_last_order', data.order);
      const form = document.getElementById('redsysForm');
      form.action = data.redsysUrl;
      document.getElementById('rf_signatureVersion').value = data.Ds_SignatureVersion;
      document.getElementById('rf_merchantParameters').value = data.Ds_MerchantParameters;
      document.getElementById('rf_signature').value = data.Ds_Signature;
      if (typeof vigilaEnvioAlTpv === 'function') vigilaEnvioAlTpv();
      form.submit();
    } catch (error) {
      console.error('[Enterprise checkout]', error);
      showToast('Error: ' + error.message);
      if (typeof restauraBotonPago === 'function') restauraBotonPago();
      else { button.disabled = false; if (label) label.textContent = 'Pagar con Redsys'; }
    }
  }

  function safeUrl(value) {
    try { const url = new URL(value, location.origin); return url.origin === location.origin || ['https:','http:'].includes(url.protocol) ? url.href : '#'; }
    catch { return '#'; }
  }

  function renderAnnouncement(block) {
    if (!block || document.getElementById('ntEnterpriseAnnouncement')) return;
    const bar = document.createElement(block.url ? 'a' : 'div');
    bar.id = 'ntEnterpriseAnnouncement';
    if (block.url) bar.href = safeUrl(block.url);
    bar.style.cssText = 'display:block;background:#d4af37;color:#080808;text-align:center;padding:8px 14px;font:800 12px/1.35 Inter,system-ui,sans-serif;text-decoration:none;position:relative;z-index:100';
    bar.textContent = block.title || block.body || '';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  async function loadPublicPlatform() {
    try {
      const [contentResponse, configResponse] = await Promise.all([
        fetch('/.netlify/functions/public-content'),
        fetch('/.netlify/functions/public-config?subject=' + encodeURIComponent(currentUser?.email || localStorage.getItem('nt_subject') || 'anonymous')),
      ]);
      const content = await contentResponse.json().catch(() => ({blocks:[]}));
      const config = await configResponse.json().catch(() => ({flags:{},experiments:{}}));
      const announcement = (content.blocks || []).find((block) => block.type === 'announcement' || block.position === 'top');
      if (announcement) renderAnnouncement(announcement);
      window.NTPlatformConfig = Object.freeze({ flags:config.flags || {}, experiments:config.experiments || {}, content:content.blocks || [] });
      window.dispatchEvent(new CustomEvent('nutretium:platform-ready', { detail:window.NTPlatformConfig }));
    } catch (error) { console.warn('[Enterprise storefront] Configuración pública no disponible:', error.message); }
  }

  window.NTCheckout = { quote, getPromotion:() => promoCode, getLastQuote:() => lastQuote };
  window.initiateRedsysPayment = pay;
  try { initiateRedsysPayment = pay; } catch (_) {}

  function init() { injectCheckout(); loadPublicPlatform(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
