'use strict';

const assert = require('assert');
const inventory = require('../netlify/lib/inventory');
const { normalState, commitTransform } = inventory._test;

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log('✓', name);
}

function product(stock = 10) {
  return { id: 'SKU-TEST', name: 'Producto Test', stock };
}

function stateWithReservation({ order = 'ORDER1', qty = 2, expiresAt = Date.now() + 60_000, committed = 0 } = {}) {
  return {
    catalogStock: 10,
    committed,
    committedOrders: {},
    reservations: {
      [order]: { qty, expiresAt, updatedAt: new Date().toISOString() }
    }
  };
}

test('una reserva vigente y suficiente puede confirmarse', () => {
  const p = product();
  const state = normalState(p, stateWithReservation({ qty: 2 }));
  const result = commitTransform(p, 'ORDER1', 2, state);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.committed, 2);
  assert.strictEqual(state.committed, 2);
  assert.strictEqual(state.committedOrders.ORDER1, 2);
  assert.strictEqual(state.reservations.ORDER1, undefined);
});

test('sin reserva no se puede confirmar stock aunque exista stock físico', () => {
  const p = product(20);
  const state = normalState(p, { catalogStock: 20, committed: 0, committedOrders: {}, reservations: {} });
  const before = JSON.stringify(state);
  const result = commitTransform(p, 'ORDER1', 2, state);
  assert.strictEqual(result.error, 'reservation-missing');
  assert.strictEqual(state.committed, 0);
  assert.strictEqual(state.committedOrders.ORDER1, undefined);
  assert.strictEqual(JSON.stringify(state), before, 'un commit rechazado no debe mutar inventario');
});

test('una reserva insuficiente no se amplía implícitamente durante el callback de pago', () => {
  const p = product();
  const state = normalState(p, stateWithReservation({ qty: 1 }));
  const result = commitTransform(p, 'ORDER1', 2, state);
  assert.strictEqual(result.error, 'reservation-insufficient');
  assert.strictEqual(result.reserved, 1);
  assert.strictEqual(result.requested, 2);
  assert.strictEqual(state.committed, 0);
  assert.strictEqual(state.reservations.ORDER1.qty, 1);
});

test('una reserva caducada se elimina y después el commit queda bloqueado', () => {
  const p = product();
  const state = normalState(p, stateWithReservation({ qty: 2, expiresAt: Date.now() - 1 }));
  assert.strictEqual(state.reservations.ORDER1, undefined, 'normalState debe purgar la reserva expirada');
  const result = commitTransform(p, 'ORDER1', 2, state);
  assert.strictEqual(result.error, 'reservation-missing');
  assert.strictEqual(state.committed, 0);
});

test('un pedido ya confirmado es idempotente y no vuelve a descontar stock', () => {
  const p = product();
  const state = normalState(p, {
    catalogStock: 10,
    committed: 2,
    committedOrders: { ORDER1: 2 },
    reservations: { ORDER1: { qty: 2, expiresAt: Date.now() + 60_000 } }
  });
  const result = commitTransform(p, 'ORDER1', 2, state);
  assert.strictEqual(result.idempotent, true);
  assert.strictEqual(result.committed, 2);
  assert.strictEqual(state.committed, 2, 'el callback duplicado no puede volver a incrementar committed');
  assert.strictEqual(state.reservations.ORDER1, undefined);
});

test('una reserva válida no permite confirmar una cantidad mayor que la reservada', () => {
  const p = product();
  const state = normalState(p, stateWithReservation({ qty: 3 }));
  const result = commitTransform(p, 'ORDER1', 4, state);
  assert.strictEqual(result.error, 'reservation-insufficient');
  assert.strictEqual(state.committed, 0);
});

console.log(`\n${count} pruebas de reserva/commit de inventario superadas.`);
