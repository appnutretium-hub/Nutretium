/* NUTRETIUM — sesión de cliente en el navegador.
   La sesión de verdad es la cookie HttpOnly `nt_customer_session`, que el
   navegador NO puede leer: por eso `customer-session-hardening.js` borra el
   token de `localStorage` a propósito y en `localStorage` solo queda el perfil.

   Aquí vive la única respuesta a «¿hay sesión?» para todo el lado cliente: la
   da el perfil guardado, nunca un token. Preguntar por el token dejaba fuera a
   quien acababa de entrar —«Inicia sesión para acceder a tus servicios» con la
   sesión recién abierta— y mandaba `Authorization: Bearer ` vacío.

   Las peticiones salen con `credentials:'same-origin'` para que la cookie
   llegue, y la cabecera `Authorization` solo se pone si existe de verdad un
   token heredado de una sesión anterior al cambio a cookie. */
(function () {
  'use strict';
  const CLAVE = 'nutretium_user';
  // El puente de las páginas internas (`staff-session-bridge.js`) finge este
  // perfil en `localStorage`: es una marca de «la sesión va por cookie», no un
  // token que el servidor pueda verificar, así que no se manda nunca.
  const MARCA_COOKIE = 'http-only-cookie';

  function perfil() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      const dato = crudo ? JSON.parse(crudo) : null;
      return dato && typeof dato === 'object' ? dato : null;
    } catch { return null }
  }
  function activa() { return perfil() !== null }
  function tokenHeredado() {
    const t = perfil() && perfil().token;
    return typeof t === 'string' && t && t !== MARCA_COOKIE ? t : '';
  }
  function cabeceras(extra) {
    const salida = Object.assign({}, extra || {});
    const t = tokenHeredado();
    if (t) salida.Authorization = 'Bearer ' + t;
    return salida;
  }
  function opciones(init) {
    const base = init || {};
    return Object.assign({}, base, { credentials: 'same-origin', headers: cabeceras(base.headers) });
  }
  function pide(ruta, init) { return fetch(ruta, opciones(init)) }
  // Al caducar la sesión se tira el perfil: sin él `activa()` ya dice que no.
  function olvida() { try { localStorage.removeItem(CLAVE) } catch {} }

  window.NutretiumSesion = { CLAVE, perfil, activa, tokenHeredado, cabeceras, opciones, pide, olvida };
})();
