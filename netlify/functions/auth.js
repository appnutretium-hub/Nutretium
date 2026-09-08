/**
 * netlify/functions/auth.js
 *
 * Handles user registration, login, and profile fetch.
 *
 * Uses Netlify Blobs as a lightweight key-value store (no external DB needed).
 * Each user record is stored as a JSON blob keyed by email.
 *
 * In production you can swap the storage layer for FaunaDB, PlanetScale,
 * Supabase, or any other DB — only the read/write helpers need to change.
 *
 * Environment variables:
 *   JWT_SECRET  — Secret for signing JWT tokens (set in Netlify dashboard)
 */

'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
// JWT compartido con el resto de funciones: una sola implementación y un solo
// secreto. La copia que había aquí no comprobaba la caducidad del token.
const { signJWT, verifyJWT, secretConfigured } = require('../lib/jwt');
// El rol NO se guarda con el usuario: sale de ADMIN_EMAILS. Si viviera en la
// ficha, cualquiera que pudiera escribir en el store de usuarios se ascendería
// a administrador y podría cambiar los precios de la tienda.
const { rolDe } = require('../lib/admin');

const CORS = cabecerasCORS('POST, GET, OPTIONS');

// ─── Password hashing (PBKDF2) ────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

// ─── Storage helpers (Netlify Blobs) ─────────────────────────────────────────
// Netlify Blobs is available in the runtime as require('@netlify/blobs').
// We wrap it so the function degrades gracefully if the package isn't present
// (e.g. local dev without netlify dev).

// La lectura y escritura viven en ../lib/usuarios.js porque redsys.js también
// necesita la ficha: antes de cobrar comprueba que hay cuenta y dirección.
const usuarios = require('../lib/usuarios');
const direccion = require('../lib/direccion');

// El freno a la fuerza bruta guarda sus propios contadores, en otro store.
const { getBlobStore } = require('../lib/blob-store');

const readUser = usuarios.lee;
const writeUser = usuarios.escribe;

// ─── Freno a los intentos de contraseña ──────────────────────────────────────
//
// Desde que existe el panel de catálogo en /admin.html, una cuenta de esta
// tienda no solo da acceso a los pedidos de quien la abre: la del administrador
// cambia los precios de lo que se cobra. Probar contraseñas a ciegas tiene que
// costar tiempo.
//
// Se cuenta por correo, tanto si existe como si no: si solo se frenaran los
// correos registrados, la diferencia de respuesta diría cuáles lo están.

// Lo que se acepta en los datos de la ficha. El nombre acaba en el correo del
// pedido y en el saludo de la cabecera, así que ni etiquetas ni longitudes
// absurdas: mismo criterio que el validador del catálogo.
const MAX_NOMBRE = 60;
const MAX_TELEFONO = 20;
const TELEFONO_VALIDO = /^[0-9 +().-]*$/;

function revisaFicha({ name, surname, phone }) {
  if (!name) return 'El nombre es obligatorio.';
  if (name.length > MAX_NOMBRE) return 'El nombre no puede pasar de ' + MAX_NOMBRE + ' caracteres.';
  if (surname.length > MAX_NOMBRE) return 'Los apellidos no pueden pasar de ' + MAX_NOMBRE + ' caracteres.';
  if (phone.length > MAX_TELEFONO) return 'El teléfono no puede pasar de ' + MAX_TELEFONO + ' caracteres.';
  if (phone && !TELEFONO_VALIDO.test(phone)) return 'El teléfono solo puede llevar números, espacios y los signos + ( ) . -';
  if ([name, surname, phone].some((campo) => /[<>]/.test(campo))) {
    return 'Ni el nombre ni los apellidos ni el teléfono pueden llevar «<» ni «>».';
  }
  return null;
}

/**
 * La ficha tal y como se le devuelve al navegador. En un solo sitio a
 * propósito: estaba copiada en register, login y profile, y una copia que se
 * quede corta es un campo que la tienda no ve —la dirección, sin ir más lejos—.
 *
 * `role` se calcula SIEMPRE aquí (rolDe) y nunca se lee de la petición: nadie
 * se asciende a administrador registrándose.
 */
function fichaPublica(user, extra) {
  return Object.assign({
    id: user.id,
    name: user.name,
    surname: user.surname,
    email: user.email,
    phone: user.phone,
    direccion: direccion.normaliza(user.direccion),
    // Las cuentas creadas antes de que la dirección fuese obligatoria no la
    // tienen. La tienda mira esto para pedirla antes de dejar pagar.
    direccionCompleta: direccion.completa(user.direccion),
    role: rolDe(user.email),
  }, extra || {});
}

const MAX_INTENTOS = 5;
const CASTIGO_MS = 15 * 60 * 1000;
const VENTANA_MS = 15 * 60 * 1000;

const INTENTOS_EN_MEMORIA = {};   // respaldo en local, sin Blobs

async function leeIntentos(email) {
  const store = getBlobStore('auth-intentos');
  if (store) return (await store.get(email, { type: 'json' }).catch(() => null)) || null;
  return INTENTOS_EN_MEMORIA[email] || null;
}

async function guardaIntentos(email, datos) {
  const store = getBlobStore('auth-intentos');
  if (store) await store.setJSON(email, datos);
  else INTENTOS_EN_MEMORIA[email] = datos;
}

async function olvidaIntentos(email) {
  const store = getBlobStore('auth-intentos');
  if (store) await store.delete(email).catch(() => {});
  else delete INTENTOS_EN_MEMORIA[email];
}

/** Segundos que faltan para poder volver a probar, o 0 si se puede ahora. */
async function esperaPendiente(email) {
  const datos = await leeIntentos(email);
  if (!datos || !datos.hasta) return 0;
  const restante = datos.hasta - Date.now();
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

async function apuntaFallo(email) {
  const ahora = Date.now();
  const previo = await leeIntentos(email);
  // Los fallos viejos no cuentan: quien se equivocó una vez el mes pasado no
  // debe quedarse a un intento del bloqueo.
  const dentroDeVentana = previo && previo.primero && (ahora - previo.primero) < VENTANA_MS;
  const fallos = (dentroDeVentana ? previo.fallos : 0) + 1;

  await guardaIntentos(email, {
    fallos,
    primero: dentroDeVentana ? previo.primero : ahora,
    hasta: fallos >= MAX_INTENTOS ? ahora + CASTIGO_MS : 0,
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  // Sin JWT_SECRET no se emiten sesiones: mejor que el login no funcione a que
  // funcione con un secreto que cualquiera puede adivinar.
  if (!secretConfigured()) {
    console.error('[auth] Falta JWT_SECRET (o es demasiado corto). Configúralo en Netlify.');
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'El registro y el inicio de sesión no están disponibles ahora mismo.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }


  // ── REGISTER ───────────────────────────────────────────────────────────────
  if (body.action === 'register') {
    const { name, surname = '', email, password, phone = '' } = body;

    if (!name || !email || !password)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Nombre, email y contraseña son obligatorios.' }) };

    if (password.length < 8)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'La contraseña debe tener al menos 8 caracteres.' }) };

    // El alta no comprobaba el nombre ni el teléfono: se podía registrar un
    // nombre de 500 caracteres o con etiquetas, y ese nombre se pinta en la
    // cabecera y viaja al correo del pedido. Ahora pasa por el mismo filtro que
    // la edición de la ficha.
    const ficha = { name: name.trim(), surname: surname.trim(), phone: phone.trim() };
    const problemaFicha = revisaFicha(ficha);
    if (problemaFicha)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: problemaFicha }) };

    // La dirección de envío es obligatoria desde el alta: sin ella el pedido no
    // se puede enviar, y pedirla al final —con el pago ya empezado— es peor.
    const dir = direccion.normaliza(body.direccion);
    const problemaDir = direccion.revisa(dir);
    if (problemaDir)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: problemaDir }) };

    const emailLower = email.toLowerCase().trim();
    const existing   = await readUser(emailLower);
    if (existing)
      return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'Ya existe una cuenta con ese email.' }) };

    const id   = crypto.randomUUID();
    const user = {
      id, name: ficha.name, surname: ficha.surname,
      email: emailLower, phone: ficha.phone,
      direccion: dir,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await writeUser(emailLower, user);

    const token = signJWT({ sub: id, email: emailLower, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });

    return { statusCode: 201, headers: CORS, body: JSON.stringify({ user: fichaPublica(user, { token }) }) };
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (body.action === 'login') {
    const { email, password } = body;
    if (!email || !password)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email y contraseña son obligatorios.' }) };

    const emailLower = email.toLowerCase().trim();

    const espera = await esperaPendiente(emailLower);
    if (espera > 0) {
      return {
        statusCode: 429,
        headers: { ...CORS, 'Retry-After': String(espera) },
        body: JSON.stringify({
          error: 'Demasiados intentos fallidos. Prueba otra vez dentro de ' +
            Math.ceil(espera / 60) + ' minutos.',
        }),
      };
    }

    const user = await readUser(emailLower);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      await apuntaFallo(emailLower);
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Email o contraseña incorrectos.' }) };
    }

    await olvidaIntentos(emailLower);

    const token = signJWT({ sub: user.id, email: emailLower, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: fichaPublica(user, { token }) }) };
  }

  // ── PROFILE (GET via POST with token) ─────────────────────────────────────
  if (body.action === 'profile') {
    const { token } = body;
    if (!token)
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token requerido.' }) };

    let claims;
    try { claims = verifyJWT(token); }
    catch { return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token inválido o expirado.' }) }; }

    const user = await readUser(claims.email);
    if (!user)
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Usuario no encontrado.' }) };

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: fichaPublica(user) }) };
  }

  // ── ACTUALIZAR FICHA ──────────────────────────────────────────────────────
  // El correo NO se puede cambiar: es la clave con la que se guarda el usuario
  // en Blobs, así que cambiarlo sería mover la ficha entera (y dejar los
  // pedidos antiguos apuntando a la vieja).
  if (body.action === 'update') {
    const { token } = body;
    if (!token)
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token requerido.' }) };

    let claims;
    try { claims = verifyJWT(token); }
    catch { return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token inválido o expirado.' }) }; }

    const user = await readUser(claims.email);
    if (!user)
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Usuario no encontrado.' }) };

    const ficha = {
      name: String(body.name || '').trim(),
      surname: String(body.surname || '').trim(),
      phone: String(body.phone || '').trim(),
    };

    const problema = revisaFicha(ficha);
    if (problema)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: problema }) };

    // La dirección se manda entera o no se toca. Mandar media dirección sería
    // dejar la ficha en un estado que el cobro rechaza sin que nadie lo pida.
    let dir = direccion.normaliza(user.direccion);
    if (body.direccion !== undefined) {
      dir = direccion.normaliza(body.direccion);
      const problemaDir = direccion.revisa(dir);
      if (problemaDir)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: problemaDir }) };
    }

    // Se escriben SOLO estos campos: el correo, el hash de la contraseña, el id
    // y la fecha de alta se conservan tal cual, vengan como vengan en la
    // petición. Es lo que impide que se ascienda o se suplante nadie por aquí.
    const actualizado = {
      ...user,
      name: ficha.name,
      surname: ficha.surname,
      phone: ficha.phone,
      direccion: dir,
      updatedAt: new Date().toISOString(),
    };
    await writeUser(claims.email, actualizado);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ user: fichaPublica(actualizado) }) };
  }

  return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida.' }) };
};
