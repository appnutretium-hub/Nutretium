'use strict';

const { getBlobStore } = require('./blob-store');
const { PRODUCTOS } = require('./catalogo');

const STORE_NAME = 'inventory-state';
const DEFAULT_TTL_MS = 45 * 60 * 1000;
const MAX_RETRIES = 12;

function finiteStock(product) {
  return product && Number.isInteger(product.stock) && product.stock >= 0;
}

function nowMs() { return Date.now(); }

function normalState(product, raw, referenceNow = nowMs()) {
  const catalogStock = Number(product.stock);
  let state = raw && typeof raw === 'object' ? { ...raw } : {};
  state.reservations = state.reservations && typeof state.reservations === 'object' ? { ...state.reservations } : {};
  state.committedOrders = state.committedOrders && typeof state.committedOrders === 'object' ? { ...state.committedOrders } : {};
  state.committed = Math.max(0, Number(state.committed) || 0);

  // El stock del catálogo es una cifra absoluta editada por operaciones/TPV.
  // Si cambia manualmente, se convierte en la nueva base y no se vuelve a
  // descontar lo ya confirmado contra la cifra anterior.
  if (Number(state.catalogStock) !== catalogStock) {
    state.catalogStock = catalogStock;
    state.committed = 0;
    state.committedOrders = {};
  }

  const now = Number.isFinite(Number(referenceNow)) ? Number(referenceNow) : nowMs();
  for (const [order, reservation] of Object.entries(state.reservations)) {
    if (!reservation || Number(reservation.expiresAt) <= now || Number(reservation.qty) <= 0) {
      delete state.reservations[order];
    }
  }
  return state;
}

function reservedQty(state, exceptOrder = '') {
  return Object.entries(state.reservations || {}).reduce((sum, [order, r]) => {
    if (order === exceptOrder) return sum;
    return sum + Math.max(0, Number(r?.qty) || 0);
  }, 0);
}

function availableQty(product, state, exceptOrder = '') {
  return Math.max(0, Number(product.stock) - Math.max(0, Number(state.committed) || 0) - reservedQty(state, exceptOrder));
}

async function mutate(product, transform, { referenceNow } = {}) {
  const store = getBlobStore(STORE_NAME);
  if (!store || typeof store.getWithMetadata !== 'function') {
    throw Object.assign(new Error('Inventario transaccional no disponible.'), { code: 'inventory-unavailable' });
  }
  const key = String(product.id);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const current = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }).catch(() => null);
    const state = normalState(product, current?.data || null, referenceNow);
    const result = transform(state);
    if (result?.error) return result;

    state.updatedAt = new Date().toISOString();
    const options = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const write = await store.setJSON(key, state, options);
    if (write && write.modified === true) return { ok: true, state, ...(result || {}) };
  }

  throw Object.assign(new Error('El inventario está recibiendo demasiadas actualizaciones simultáneas. Reintenta.'), { code: 'inventory-contention' });
}

async function reserveLine(product, order, qty, expiresAt) {
  return mutate(product, (state) => {
    if (state.committedOrders?.[order]) {
      return { ok: true, alreadyCommitted: true, available: availableQty(product, state, order) };
    }
    const current = state.reservations[order];
    const requested = Math.max(1, Number(qty) || 0);
    const available = availableQty(product, state, order);
    if (available < requested) {
      return {
        error: 'stock',
        productId: product.id,
        productName: product.name,
        available,
        requested,
      };
    }
    state.reservations[order] = { qty: requested, expiresAt, updatedAt: new Date().toISOString() };
    return { reserved: requested, availableAfter: Math.max(0, available - requested), refreshed: Boolean(current) };
  });
}

async function releaseLine(product, order) {
  return mutate(product, (state) => {
    if (state.reservations[order]) delete state.reservations[order];
    return { released: true };
  });
}

function validateCommitReservation(product, order, qty, state) {
  const requested = Math.max(1, Number(qty) || 0);
  if (state.committedOrders?.[order]) {
    return { ok: true, idempotent: true, committed: Number(state.committedOrders[order]), requested };
  }

  const reservation = state.reservations?.[order];
  const reserved = Math.max(0, Number(reservation?.qty) || 0);
  if (!reservation || reserved <= 0) {
    return {
      ok: false,
      error: 'reservation-missing',
      productId: product.id,
      productName: product.name,
      requested,
      reserved: 0,
    };
  }
  if (reserved < requested) {
    return {
      ok: false,
      error: 'reservation-insufficient',
      productId: product.id,
      productName: product.name,
      requested,
      reserved,
    };
  }
  return { ok: true, requested, reserved };
}

function commitTransform(product, order, qty, state) {
  const validation = validateCommitReservation(product, order, qty, state);
  if (!validation.ok) return validation;
  if (validation.idempotent) {
    if (state.reservations[order]) delete state.reservations[order];
    return { committed: validation.committed, idempotent: true };
  }

  delete state.reservations[order];
  state.committed = Math.max(0, Number(state.committed) || 0) + validation.requested;
  state.committedOrders[order] = validation.requested;
  return { committed: validation.requested };
}

async function commitLine(product, order, qty, referenceNow) {
  return mutate(product, (state) => commitTransform(product, order, qty, state), { referenceNow });
}

function reservableLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const product = PRODUCTOS.get(String(line.id));
    return { line, product };
  }).filter(({ product }) => finiteStock(product));
}

async function preflightCommit(order, lines, referenceNow = nowMs()) {
  const store = getBlobStore(STORE_NAME);
  if (!store || typeof store.getWithMetadata !== 'function') {
    return { ok: false, reason: 'inventory-unavailable', error: 'El inventario no está disponible para confirmar el pedido.' };
  }

  const checked = [];
  try {
    for (const { line, product } of reservableLines(lines)) {
      const current = await store.getWithMetadata(String(product.id), { type: 'json', consistency: 'strong' }).catch(() => null);
      const state = normalState(product, current?.data || null, referenceNow);
      const validation = validateCommitReservation(product, order, line.qty, state);
      if (!validation.ok) {
        return {
          ok: false,
          reason: validation.error,
          productId: validation.productId,
          checkedProductIds: checked.map(item => item.product.id),
          error: validation.error === 'reservation-insufficient'
            ? 'La reserva de inventario ya no cubre todas las unidades pagadas. El pedido requiere revisión manual.'
            : 'La reserva de inventario ha expirado o ya no existe. El pedido requiere revisión manual.',
        };
      }
      checked.push({ product, line, idempotent: validation.idempotent === true });
    }
    return { ok: true, checked, referenceNow };
  } catch (err) {
    console.error('[inventory] preflight commit', order, err);
    return { ok: false, reason: err.code || 'inventory-error', checkedProductIds: checked.map(item => item.product.id), error: 'No se pudo verificar el inventario antes de confirmar el pago.' };
  }
}

async function reserve(order, lines, ttlMs = DEFAULT_TTL_MS) {
  const store = getBlobStore(STORE_NAME);
  if (!store || typeof store.getWithMetadata !== 'function') {
    return { ok: false, reason: 'inventory-unavailable', error: 'El inventario no está disponible. No se iniciará ningún cobro.' };
  }
  const expiresAt = nowMs() + Math.max(5 * 60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS);
  const completed = [];
  try {
    for (const { line, product } of reservableLines(lines)) {
      const result = await reserveLine(product, order, line.qty, expiresAt);
      if (result?.error) {
        await Promise.allSettled(completed.map((p) => releaseLine(p, order)));
        return {
          ok: false,
          reason: 'insufficient-stock',
          error: `No quedan suficientes unidades de ${result.productName}. Disponibles ahora: ${result.available}.`,
          productId: result.productId,
          available: result.available,
        };
      }
      completed.push(product);
    }
    return { ok: true, expiresAt: new Date(expiresAt).toISOString(), reservedProductIds: completed.map((p) => p.id) };
  } catch (err) {
    await Promise.allSettled(completed.map((p) => releaseLine(p, order)));
    console.error('[inventory] reserva', order, err);
    return { ok: false, reason: err.code || 'inventory-error', error: 'No se pudo reservar el inventario de forma segura. No se iniciará ningún cobro.' };
  }
}

async function release(order, lines) {
  try {
    await Promise.all(reservableLines(lines).map(({ product }) => releaseLine(product, order)));
    return { ok: true };
  } catch (err) {
    console.error('[inventory] liberación', order, err);
    return { ok: false, error: err.message };
  }
}

async function commit(order, lines) {
  const referenceNow = nowMs();
  const preflight = await preflightCommit(order, lines, referenceNow);
  if (!preflight.ok) return preflight;

  const committedProductIds = [];
  try {
    // El preflight evita modificar ninguna línea cuando una reserva ya era
    // inválida al comenzar el callback. Las escrituras siguen protegidas por
    // ETag/CAS; cualquier carrera posterior queda fail-closed y REVIEW_REQUIRED.
    for (const { line, product } of preflight.checked) {
      const result = await commitLine(product, order, line.qty, referenceNow);
      if (result?.error) {
        return {
          ok: false,
          reason: result.error,
          productId: result.productId,
          committedProductIds,
          error: result.error === 'reservation-insufficient'
            ? 'La reserva de inventario cambió y ya no cubre las unidades pagadas. El pedido requiere revisión manual.'
            : 'La reserva de inventario cambió o dejó de existir durante la confirmación. El pedido requiere revisión manual.',
        };
      }
      committedProductIds.push(product.id);
    }
    return { ok: true, committedProductIds };
  } catch (err) {
    console.error('[inventory] confirmación', order, err);
    return { ok: false, reason: err.code || 'inventory-error', committedProductIds, error: err.message };
  }
}

module.exports = {
  reserve,
  release,
  commit,
  availableQty,
  DEFAULT_TTL_MS,
  _test: { normalState, validateCommitReservation, commitTransform }
};
