'use strict';

const assert = require('assert');
const provider = require('../netlify/lib/provider-client');
const pdf = require('../netlify/lib/simple-pdf');
const invoice = require('../netlify/functions/invoice-download')._test;
const shipping = require('../netlify/functions/shipping-operations')._test;
const returns = require('../netlify/functions/returns-operations')._test;
const subscriptions = require('../netlify/functions/subscription-worker')._test;

let count = 0;
function test(name, fn) { fn(); count++; console.log('✓', name); }

test('firma de proveedor estable y sensible al cuerpo', () => {
  assert.strictEqual(provider.signature('secret', '1', '{}'), provider.signature('secret', '1', '{}'));
  assert.notStrictEqual(provider.signature('secret', '1', '{}'), provider.signature('secret', '1', '{"x":1}'));
});
test('comparación segura rechaza valores distintos', () => assert.strictEqual(provider.safeEqual('abc', 'abd'), false));
test('PDF mínimo válido', () => { const result = pdf.createPdf({ title: 'Factura', lines: ['Pedido 1'] }); assert(result.subarray(0, 8).toString().startsWith('%PDF-1.4')); assert(result.toString().includes('%%EOF')); });
test('token de factura se compara constant-time', () => { const value = invoice.hash('token'); assert.strictEqual(invoice.safeEqual(value, invoice.hash('token')), true); assert.strictEqual(invoice.safeEqual(value, invoice.hash('otro')), false); });
test('shipping solo acepta enlaces HTTPS', () => { assert.strictEqual(shipping.safeUrl('http://example.com'), null); assert.strictEqual(shipping.safeUrl('https://example.com/a'), 'https://example.com/a'); });
test('devolución no supera lo comprado', () => { const order = { items: [{ code: 'SKU1', qty: 1 }] }; assert.throws(() => returns.normalizeInspection([{ sku: 'SKU1', qty: 2, disposition: 'restock', warehouseId: 'SAN' }], order)); });
test('devolución separa reposición y cuarentena', () => { const order = { items: [{ code: 'SKU1', qty: 2 }] }; const lines = returns.normalizeInspection([{ sku: 'SKU1', qty: 1, disposition: 'restock', warehouseId: 'SAN' }, { sku: 'SKU1', qty: 1, disposition: 'quarantine' }], order); assert.strictEqual(lines.length, 2); });
test('renovación semanal suma siete días', () => assert.strictEqual(subscriptions.nextDate('2026-09-01T00:00:00.000Z', 'weekly'), '2026-09-08T00:00:00.000Z'));
test('orden recurrente es determinista y válida', () => { const a = subscriptions.orderNumber('abc'); assert.strictEqual(a, subscriptions.orderNumber('abc')); assert.strictEqual(a.length, 12); });
test('solo renueva suscripción activa vencida', () => { assert.strictEqual(subscriptions.due({ status: 'active', nextAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-02-01T00:00:00Z')), true); assert.strictEqual(subscriptions.due({ status: 'paused', nextAt: '2026-01-01T00:00:00Z' }, Date.parse('2026-02-01T00:00:00Z')), false); });

console.log(`\n${count} pruebas de cierre superadas.`);

// Regresión obligatoria del camino pago → reserva → commit. Este require ejecuta
// la suite dedicada dentro de test:enterprise, evitando que quede como test huérfano.
require('./test-inventory-reservation');
