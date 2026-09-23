'use strict';

const assert = require('assert');
const crypto = require('crypto');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';
process.env.SHIPPING_ENABLED = 'true';
process.env.SHIPPING_RATE_CENTS = '0';
process.env.SHIPPING_COUNTRY = 'España';
process.env.SHIPPING_LABEL = 'Envío de prueba';
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

// Credenciales sintéticas: válidas solo como fixture criptográfico local.
const CLAVE_SANDBOX = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw';
const COMERCIO = '999008881';
const TERMINAL = '1';

function signingKey(secretBase64, order) {
  const key = Buffer.from(secretBase64, 'base64');
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv);
  cipher.setAutoPadding(false);
  const block = Buffer.alloc(Math.ceil(order.length / 8) * 8, 0);
  block.write(order, 'utf8');
  return Buffer.concat([cipher.update(block), cipher.final()]);
}
function signature(parametersBase64, order) {
  return crypto.createHmac('sha256', signingKey(CLAVE_SANDBOX, order))
    .update(parametersBase64)
    .digest('base64');
}
function base64Url(value) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bodyOf(response) {
  return JSON.parse(response.body || '{}');
}
function paymentRequest(items, options) {
  const config = options || {};
  return {
    httpMethod: 'POST',
    headers: {
      host: config.host || 'deploy-preview.local',
      'content-type': 'application/json',
      'x-forwarded-for': config.ip || '127.0.0.10',
      'x-nutretium-request': config.requestId || 'checkout-test-0001'
    },
    body: JSON.stringify({
      items: items,
      amount: config.amount,
      termsAccepted: true,
      termsVersion: '2026-09-20',
      guest: config.withoutGuest ? undefined : {
        name: 'Test',
        surname: 'User',
        email: 'checkout@example.invalid',
        phone: '000000000',
        direccion: {
          calle: 'Calle Ficticia 1',
          piso: '0',
          cp: '00000',
          localidad: 'Ciudad de Prueba',
          provincia: 'Provincia de Prueba',
          pais: 'España'
        }
      }
    })
  };
}
function bankNotification(order, amountCents, invalidSignature, options) {
  const config = options || {};
  const params = {
    Ds_Amount: String(amountCents),
    Ds_Currency: config.currency ?? '978',
    Ds_Order: order,
    Ds_MerchantCode: config.merchantCode ?? COMERCIO,
    Ds_Terminal: config.terminal ?? TERMINAL,
    Ds_Response: config.responseCode || '0000',
    Ds_AuthorisationCode: config.authorisationCode || '123456',
    Ds_TransactionType: config.transactionType || '0'
  };
  const encoded = Buffer.from(JSON.stringify(params)).toString('base64');
  const signed = invalidSignature ? signature(encoded, '9999INVALID') : signature(encoded, order);
  return {
    httpMethod: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      Ds_SignatureVersion: 'HMAC_SHA256_V1',
      Ds_MerchantParameters: encoded,
      Ds_Signature: base64Url(signed)
    }).toString()
  };
}

async function main() {
  globalThis.__NUTRETIUM_TEST_BLOBS__ = new Map();
  globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__ = new Map();

  const products = require('../products-data.js').NUTRETIUM_PRODUCTS;
  const product = products.find(function (item) {
    return item.active !== false && Number.isInteger(item.stock) && item.stock >= 3;
  });
  assert(product, 'El catálogo necesita un producto activo con stock finito >= 3 para probar reserva/commit Redsys.');
  const items = [{ id: product.id, code: product.code, qty: 1 }];
  const expectedCents = Math.round(Number(product.price) * 100);

  const checkout = require('../netlify/functions/checkout.js').handler;

  delete process.env.REDSYS_SECRET_KEY;
  delete process.env.REDSYS_MERCHANT_CODE;
  delete process.env.COMMERCE_LIVE;
  process.env.REDSYS_ENV = 'test';

  const noGuest = await checkout(paymentRequest(items, {
    withoutGuest: true,
    requestId: 'checkout-noguest-01',
    ip: '127.0.0.11'
  }));
  assert.strictEqual(noGuest.statusCode, 401);
  assert.strictEqual(bodyOf(noGuest).motivo, 'guest-required');
  assert.strictEqual(bodyOf(noGuest).Ds_Signature, undefined);

  const noCredentials = await checkout(paymentRequest(items, {
    requestId: 'checkout-nokeys-001',
    ip: '127.0.0.12'
  }));
  assert.strictEqual(noCredentials.statusCode, 503);
  assert.strictEqual(bodyOf(noCredentials).Ds_Signature, undefined);

  process.env.REDSYS_SECRET_KEY = CLAVE_SANDBOX;
  process.env.REDSYS_MERCHANT_CODE = COMERCIO;
  process.env.REDSYS_TERMINAL = TERMINAL;

  process.env.REDSYS_ENV = 'production';
  process.env.COMMERCE_LIVE = 'false';
  const productionLocked = await checkout(paymentRequest(items, {
    host: 'nutretium.com',
    requestId: 'checkout-prodlock-01',
    ip: '127.0.0.13'
  }));
  assert.strictEqual(productionLocked.statusCode, 503);
  assert.match(bodyOf(productionLocked).error, /bloqueados|desactivado/i);
  process.env.REDSYS_ENV = 'test';

  const requestId = 'checkout-redsys-001';
  const paid = await checkout(paymentRequest(items, {
    requestId: requestId,
    ip: '127.0.0.14'
  }));
  assert.strictEqual(paid.statusCode, 200);
  const payment = bodyOf(paid);
  assert(payment.Ds_MerchantParameters);
  assert(payment.Ds_Signature);
  assert.strictEqual(payment.Ds_SignatureVersion, 'HMAC_SHA256_V1');
  assert.strictEqual(payment.redsysUrl, 'https://sis-t.redsys.es:25443/sis/realizarPago');

  const merchant = JSON.parse(Buffer.from(payment.Ds_MerchantParameters, 'base64').toString('utf8'));
  assert.strictEqual(merchant.Ds_Merchant_Amount, String(expectedCents));
  assert.strictEqual(merchant.Ds_Merchant_MerchantCode, COMERCIO);
  assert.strictEqual(merchant.Ds_Merchant_Terminal, TERMINAL);
  assert.strictEqual(merchant.Ds_Merchant_TransactionType, '0');
  assert.match(merchant.Ds_Merchant_Order, /^\d{4}[0-9A-Z]{8}$/);
  assert.strictEqual(payment.Ds_Signature, signature(payment.Ds_MerchantParameters, merchant.Ds_Merchant_Order));

  const manipulated = await checkout(paymentRequest(items, {
    amount: 0.01,
    requestId: requestId,
    ip: '127.0.0.15'
  }));
  assert.strictEqual(manipulated.statusCode, 200);
  const manipulatedBody = bodyOf(manipulated);
  const manipulatedMerchant = JSON.parse(Buffer.from(manipulatedBody.Ds_MerchantParameters, 'base64').toString('utf8'));
  assert.strictEqual(manipulatedMerchant.Ds_Merchant_Amount, String(expectedCents));
  assert.strictEqual(manipulatedBody.order, payment.order);
  assert.strictEqual(manipulatedBody.idempotent, true);

  const notifyModule = require('../netlify/functions/redsys-notify.js');
  const notify = notifyModule.handler;
  const integrityFixture = { Ds_Currency:'978', Ds_MerchantCode:COMERCIO, Ds_Terminal:TERMINAL };
  const integrityRecord = { currency:'978' };
  const integrityPayment = { merchantCode:COMERCIO, terminal:TERMINAL };
  assert.strictEqual(notifyModule._test.callbackIntegrity(integrityFixture, integrityRecord, integrityPayment).ok, true);
  assert.deepStrictEqual(notifyModule._test.callbackIntegrity({ ...integrityFixture, Ds_Currency:'840' }, integrityRecord, integrityPayment).issues.map(i=>i.code), ['CURRENCY_MISMATCH']);
  assert.deepStrictEqual(notifyModule._test.callbackIntegrity({ ...integrityFixture, Ds_MerchantCode:'000000000' }, integrityRecord, integrityPayment).issues.map(i=>i.code), ['MERCHANT_MISMATCH']);
  assert.deepStrictEqual(notifyModule._test.callbackIntegrity({ ...integrityFixture, Ds_Terminal:'9' }, integrityRecord, integrityPayment).issues.map(i=>i.code), ['TERMINAL_MISMATCH']);

  const rejected = await notify(bankNotification(payment.order, expectedCents, true));
  assert.strictEqual(rejected.statusCode, 403);

  const accepted = await notify(bankNotification(payment.order, expectedCents, false));
  assert.strictEqual(accepted.statusCode, 200);
  assert.strictEqual(accepted.body, 'OK');

  const blobStore = require('../netlify/lib/blob-store.js').getBlobStore;
  const store = blobStore('redsys-orders');
  let record = await store.get(payment.order, { type: 'json' });
  assert.strictEqual(record.status, 'PAID');
  assert.strictEqual(record.fulfilmentStatus, 'PENDING_FULFILMENT');
  assert.strictEqual(record.inventoryReservation.status, 'COMMITTED');

  const inventoryStore = blobStore('inventory-state');
  const inventoryAfterFirst = await inventoryStore.get(String(product.id), { type: 'json' });
  const committedAfterFirst = Number(inventoryAfterFirst?.committed || 0);
  const orderCommittedAfterFirst = Number(inventoryAfterFirst?.committedOrders?.[payment.order] || 0);
  assert(orderCommittedAfterFirst > 0, 'La primera notificación válida debe comprometer inventario.');

  const duplicate = await notify(bankNotification(payment.order, expectedCents, false));
  assert.strictEqual(duplicate.statusCode, 200);
  assert.strictEqual(duplicate.body, 'OK');
  record = await store.get(payment.order, { type: 'json' });
  assert.strictEqual(record.status, 'PAID');
  assert.strictEqual(record.inventoryReservation.status, 'COMMITTED');
  const inventoryAfterDuplicate = await inventoryStore.get(String(product.id), { type: 'json' });
  assert.strictEqual(Number(inventoryAfterDuplicate?.committed || 0), committedAfterFirst);
  assert.strictEqual(Number(inventoryAfterDuplicate?.committedOrders?.[payment.order] || 0), orderCommittedAfterFirst);

  const foreignTransaction = await notify(bankNotification(payment.order, expectedCents, false, {
    responseCode: '0900',
    transactionType: '3'
  }));
  assert.strictEqual(foreignTransaction.statusCode, 200);
  record = await store.get(payment.order, { type: 'json' });
  assert.strictEqual(record.status, 'PAID');
  assert.strictEqual(record.inventoryReservation.status, 'COMMITTED');

  const lateFailure = await notify(bankNotification(payment.order, expectedCents, false, {
    responseCode: '0190',
    transactionType: '0'
  }));
  assert.strictEqual(lateFailure.statusCode, 200);
  assert.strictEqual(lateFailure.body, 'OK');
  record = await store.get(payment.order, { type: 'json' });
  assert.strictEqual(record.status, 'PAID');
  assert.strictEqual(record.fulfilmentStatus, 'PENDING_FULFILMENT');
  assert.strictEqual(record.inventoryReservation.status, 'COMMITTED');
  const inventoryAfterLateFailure = await inventoryStore.get(String(product.id), { type: 'json' });
  assert.strictEqual(Number(inventoryAfterLateFailure?.committed || 0), committedAfterFirst);
  assert.strictEqual(Number(inventoryAfterLateFailure?.committedOrders?.[payment.order] || 0), orderCommittedAfterFirst);

  // Un callback correctamente firmado pero con moneda distinta se registra como
  // pago, pero nunca puede consumir la reserva ni iniciar fulfillment.
  const currencyCheckout = await checkout(paymentRequest(items, {
    requestId: 'checkout-currency-001',
    ip: '127.0.0.16'
  }));
  assert.strictEqual(currencyCheckout.statusCode, 200);
  const currencyPayment = bodyOf(currencyCheckout);
  const currencyMismatch = await notify(bankNotification(currencyPayment.order, expectedCents, false, { currency:'840' }));
  assert.strictEqual(currencyMismatch.statusCode, 200);
  const currencyRecord = await store.get(currencyPayment.order, { type:'json' });
  assert.strictEqual(currencyRecord.status, 'PAID');
  assert.strictEqual(currencyRecord.fulfilmentStatus, 'REVIEW_REQUIRED');
  assert.strictEqual(currencyRecord.inventoryReservation.status, 'HELD_REVIEW');
  assert.strictEqual(currencyRecord.paymentReview.reason, 'CURRENCY_MISMATCH');
  assert.strictEqual(currencyRecord.paymentIntegrityMismatch.issues[0].code, 'CURRENCY_MISMATCH');
  const inventoryAfterCurrencyMismatch = await inventoryStore.get(String(product.id), { type:'json' });
  assert.strictEqual(Number(inventoryAfterCurrencyMismatch?.committed || 0), committedAfterFirst, 'la moneda discrepante no puede comprometer inventario');
  assert.strictEqual(inventoryAfterCurrencyMismatch?.committedOrders?.[currencyPayment.order], undefined);

  // Si Redsys autoriza después de caducar la reserva, el pago queda registrado
  // pero el inventario falla cerrado y requiere revisión manual.
  const expiredCheckout = await checkout(paymentRequest(items, {
    requestId: 'checkout-expired-001',
    ip: '127.0.0.17'
  }));
  assert.strictEqual(expiredCheckout.statusCode, 200);
  const expiredPayment = bodyOf(expiredCheckout);
  const beforeExpiry = await inventoryStore.get(String(product.id), { type:'json' });
  assert(beforeExpiry?.reservations?.[expiredPayment.order], 'el checkout debe haber creado la reserva a expirar');
  beforeExpiry.reservations[expiredPayment.order].expiresAt = Date.now() - 1000;
  await inventoryStore.setJSON(String(product.id), beforeExpiry);
  const expiredNotify = await notify(bankNotification(expiredPayment.order, expectedCents, false));
  assert.strictEqual(expiredNotify.statusCode, 503);
  const expiredRecord = await store.get(expiredPayment.order, { type:'json' });
  assert.strictEqual(expiredRecord.status, 'PAID');
  assert.strictEqual(expiredRecord.fulfilmentStatus, 'REVIEW_REQUIRED');
  assert.strictEqual(expiredRecord.inventoryReservation.status, 'COMMIT_FAILED');
  assert.strictEqual(expiredRecord.inventoryReservation.reason, 'reservation-missing');
  const inventoryAfterExpiredPayment = await inventoryStore.get(String(product.id), { type:'json' });
  assert.strictEqual(Number(inventoryAfterExpiredPayment?.committed || 0), committedAfterFirst, 'una reserva caducada no puede incrementar stock comprometido');
  assert.strictEqual(inventoryAfterExpiredPayment?.committedOrders?.[expiredPayment.order], undefined);

  console.log('OK — checkout, firma Redsys, integridad moneda/comercio/terminal, reservas caducadas, duplicados y estado terminal PAID verificados.');
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
