(function () {
  'use strict';

  const KEY = 'nutretium_user';
  const $ = (id) => document.getElementById(id);

  function user() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch { return null; }
  }

  function token() { return (user() || {}).token || ''; }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  async function api(body, path = 'customer-commerce') {
    const response = await fetch('/.netlify/functions/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token(),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  }

  function items(rows, empty = 'Sin registros') {
    return (rows || []).map((record) => (
      `<div class="item"><b>${esc(record.subject || record.orderId || record.name || record.cadence || record.type || record.id)}</b>` +
      `<div class="muted">${esc(record.status || '')}</div></div>`
    )).join('') || `<div class="muted">${esc(empty)}</div>`;
  }

  async function load() {
    if (!token()) {
      $('login').hidden = false;
      $('app').hidden = true;
      return;
    }
    try {
      const data = await api({ action: 'overview' });
      $('login').hidden = true;
      $('app').hidden = false;
      $('loyalty').innerHTML = data.loyalty
        ? `<strong style="font-size:1.7rem;color:#d4af37">${Number(data.loyalty.balance || 0)}</strong><div class="muted">puntos disponibles</div>`
        : '<div class="muted">Programa preparado; aún sin saldo.</div>';
      $('subscriptions').innerHTML = items(data.subscriptions);
      $('returns').innerHTML = items(data.returns);
      $('tickets').innerHTML = items(data.tickets);
      $('carts').innerHTML = items(data.savedCarts);
      $('privacy').innerHTML = items(data.privacyRequests);
    } catch (error) {
      if (/sesión|iniciar/i.test(error.message)) {
        localStorage.removeItem(KEY);
        location.reload();
      } else {
        alert(error.message);
      }
    }
  }

  $('supportForm').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api({ action: 'support-ticket', subject: $('subject').value, message: $('message').value });
      event.target.reset();
      await load();
    } catch (error) { alert(error.message); }
  };

  $('privacyForm').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api({ action: 'privacy-request', type: $('privacyType').value, details: $('privacyDetails').value });
      event.target.reset();
      await load();
    } catch (error) { alert(error.message); }
  };

  $('passwordForm').onsubmit = async (event) => {
    event.preventDefault();
    $('securityMsg').textContent = '';
    try {
      await api({
        action: 'change-password',
        oldPassword: $('oldPassword').value,
        newPassword: $('newPassword').value,
      }, 'account-security');
      $('securityMsg').textContent = 'Contraseña actualizada.';
      event.target.reset();
    } catch (error) {
      $('securityMsg').textContent = error.message;
    }
  };

  load();
})();
