/**
 * netlify/lib/admin.js — NUTRETIUM
 *
 * Quién es administrador y quién no.
 *
 * LA AUTORIDAD ES LA VARIABLE DE ENTORNO `ADMIN_EMAILS`, no un campo en la
 * ficha del usuario. La diferencia importa: los usuarios viven en Netlify
 * Blobs, y si el rol se guardara ahí, cualquiera que consiguiera escribir en
 * ese store se ascendería a administrador y podría cambiar los precios de la
 * tienda. Con la lista en variables de entorno, ser administrador exige acceso
 * al panel de Netlify.
 *
 * El registro NUNCA acepta un rol del cliente: se calcula aquí, siempre.
 *
 * Es la misma regla que JWT_SECRET y REDSYS_SECRET_KEY (ver CLAUDE.md): sin
 * configurar, se falla cerrado. Sin ADMIN_EMAILS no hay administradores, y el
 * panel online no deja entrar a nadie.
 */

'use strict';

const { verifyJWT, tokenFromHeader, secretConfigured } = require('./jwt');

/** Correos con permiso, en minúsculas. Separados por comas, espacios o ';'. */
function listaAdmins() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((correo) => correo.trim().toLowerCase())
    .filter(Boolean);
}

/** ¿Hay algún administrador configurado? Sirve para dar un 503 con sentido. */
const adminConfigurado = () => listaAdmins().length > 0;

function esAdmin(email) {
  const correo = String(email || '').trim().toLowerCase();
  return correo !== '' && listaAdmins().includes(correo);
}

/** El rol que se le enseña al navegador. Nunca viene del cliente. */
const rolDe = (email) => (esAdmin(email) ? 'admin' : 'cliente');

/**
 * Comprueba la sesión de una petición y que sea de un administrador.
 *
 * @returns {{ok:true, email:string}|{ok:false, statusCode:number, error:string}}
 */
function exigeAdmin(event) {
  if (!secretConfigured()) {
    return { ok: false, statusCode: 503, error: 'Las sesiones no están disponibles ahora mismo.' };
  }
  if (!adminConfigurado()) {
    console.error('[admin] Falta ADMIN_EMAILS. El panel de catálogo está cerrado para todos.');
    return { ok: false, statusCode: 503, error: 'El panel de administración no está configurado.' };
  }

  const token = tokenFromHeader(event.headers || {});
  if (!token) return { ok: false, statusCode: 401, error: 'Hay que iniciar sesión.' };

  let claims;
  try { claims = verifyJWT(token); }
  catch { return { ok: false, statusCode: 401, error: 'La sesión ha caducado. Vuelve a entrar.' }; }

  // Mismo mensaje que para un token inválido: quien pruebe con una cuenta
  // cualquiera no averigua si ese correo es o no el del administrador.
  if (!esAdmin(claims.email)) {
    console.warn(`[admin] Intento de acceso al panel con la cuenta ${claims.email}.`);
    return { ok: false, statusCode: 403, error: 'Esta cuenta no tiene acceso al panel.' };
  }

  return { ok: true, email: String(claims.email).toLowerCase() };
}

module.exports = { listaAdmins, adminConfigurado, esAdmin, rolDe, exigeAdmin };
