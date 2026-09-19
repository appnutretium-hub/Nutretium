/** Almacén de clientes con escrituras condicionales para evitar pérdidas por concurrencia. */
'use strict';

const { getBlobStore } = require('./blob-store');
const EN_MEMORIA = {};
const almacen = () => getBlobStore('users');
const claveDe = (email) => String(email || '').toLowerCase().trim();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

async function lee(email) {
  const clave = claveDe(email); if (!clave) return null;
  const store = almacen();
  if (store) return store.get(clave, { type:'json', consistency:'strong' }).catch(() => null);
  return clone(EN_MEMORIA[clave] || null);
}

async function escribe(email, datos) {
  const clave = claveDe(email); if (!clave) throw new Error('Usuario sin clave');
  const store = almacen();
  if (store) { await store.setJSON(clave, datos); return clone(datos); }
  EN_MEMORIA[clave] = clone(datos); return clone(datos);
}

async function crea(email, datos) {
  const clave = claveDe(email); if (!clave) throw new Error('Usuario sin clave');
  const store = almacen();
  if (store) {
    const write = await store.setJSON(clave, datos, { onlyIfNew:true }).catch(() => null);
    if (!write) throw new Error('Almacenamiento de usuarios no disponible');
    return write.modified === true;
  }
  if (EN_MEMORIA[clave]) return false;
  EN_MEMORIA[clave] = clone(datos); return true;
}

async function muta(email, updater, { attempts=12 }={}) {
  const clave = claveDe(email); if (!clave) throw new Error('Usuario sin clave');
  const store = almacen();
  if (!store || typeof store.getWithMetadata !== 'function') {
    const current = clone(EN_MEMORIA[clave] || null); if (!current) return null;
    const next = await updater(current); if (next == null) return current;
    EN_MEMORIA[clave] = clone(next); return clone(next);
  }
  for (let i=0; i<attempts; i++) {
    const entry = await store.getWithMetadata(clave, { type:'json', consistency:'strong' }).catch(() => null);
    if (!entry?.data) return null;
    const current = clone(entry.data);
    const next = await updater(current);
    if (next == null) return current;
    const opts = entry.etag ? { onlyIfMatch:entry.etag } : { onlyIfNew:true };
    const write = await store.setJSON(clave, next, opts).catch(() => null);
    if (write?.modified === true) return clone(next);
  }
  throw new Error('Conflicto concurrente al actualizar usuario');
}

module.exports = { lee, escribe, crea, muta, claveDe };
