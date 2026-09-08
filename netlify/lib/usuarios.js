/**
 * netlify/lib/usuarios.js — NUTRETIUM
 *
 * Leer y escribir la ficha del cliente. Estaba dentro de auth.js, y se saca
 * aquí porque el cobro también necesita leerla: `redsys.js` comprueba, antes de
 * firmar nada, que quien paga tiene cuenta y dirección de envío. Sin esto
 * habría dos formas de leer al usuario y acabarían discrepando.
 *
 * El correo es la clave. Por eso no se puede cambiar (ver auth.js): cambiarlo
 * sería mover la ficha entera y dejar los pedidos apuntando a la vieja.
 *
 * Sin Blobs —en local, sin `netlify dev`— cae a memoria, que dura lo que dure
 * el proceso. Es solo para desarrollo, y por eso no se avisa por pantalla en
 * cada llamada: el que la ficha no persista se nota enseguida.
 */

'use strict';

const { getBlobStore } = require('./blob-store');

const EN_MEMORIA = {};

const almacen = () => getBlobStore('users');

/** La clave con la que se guarda cada usuario. */
const claveDe = (email) => String(email || '').toLowerCase().trim();

async function lee(email) {
  const clave = claveDe(email);
  if (!clave) return null;
  const store = almacen();
  if (store) return store.get(clave, { type: 'json' }).catch(() => null);
  return EN_MEMORIA[clave] || null;
}

async function escribe(email, datos) {
  const clave = claveDe(email);
  const store = almacen();
  if (store) await store.setJSON(clave, datos);
  else EN_MEMORIA[clave] = datos;
}

module.exports = { lee, escribe, claveDe };
