'use strict';

const assert = require('assert');
const crypto = require('crypto');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';
process.env.SHIPPING_ENABLED = 'true';
process.env.SHIPPING_RATE_CENTS = '0';
process.env.SHIPPING_COUNTRY = 'España';
process.env.SHIPPING_LABEL = 'Envío de prueba';
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

const CLAVE_SANDBOX = process.env.REDSYS_TEST_SECRET || Buffer.alloc(24, 1).toString('base64');
const COMERCIO = process.env.REDSYS_TEST_MERCHANT || '999999999';
const TERMINAL = process.env.REDSYS_TEST_TERMINAL || '1';

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
      guest: config.withoutGuest ? undefined : {
        name: 'Ana',
        surname: 'García',
        email: 'cliente@ejemplo.com',
        phone: '600123456',
        direccion: {
          calle: 'Calle La Albericia 1',
          piso: '3B',
          cp: '39012',
          localidad: 'Santander',
          provincia: 'Cantabria',
          pais: 'España'
        }
      }
    })
  };
}
function bankNotification(order, amountCents, invalidSignature) {
  const params = {
    Ds_Amount: String(amountCents),
    Ds_Currency: '978',
    Ds_Order: order,
    Ds_MerchantCode: COMERCIO,
    Ds_Terminal: TERMINAL,
    Ds_Response: '0000',
    Ds_AuthorisationCode: '123456',
    Ds_TransactionType: '0'
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
    return item.active !== false && (item.stock === null || Number(item.stock) >= 3);
  });
  assert(product, 'El catálogo necesita un producto activo y vendible para probar Redsys.');
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

  const productionLocked = await checkout(paymentRequest(items, {
    host: 'nutretium.com',
    requestId: 'checkout-prodlock-01',
    ip: '127.0.0.13'
  }));
  assert.strictEqual(productionLocked.statusCode, 503);
  assert.match(bodyOf(productionLocked).error, /desactivado/i);

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

  const notify = require('../netlify/functions/redsys-notify.js').handler;
  const rejected = await notify(bankNotification(payment.order, expectedCents, true));
  assert.strictEqual(rejected.statusCode, 403);

  const accepted = await notify(bankNotification(payment.order, expectedCents, false));
  assert.strictEqual(accepted.statusCode, 200);
  assert.strictEqual(accepted.body, 'OK');

  const store = require('../netlify/lib/blob-store.js').getBlobStore('redsys-orders');
  const record = await store.get(payment.order, { type: 'json' });
  assert.strictEqual(record.status, 'PAID');
  assert.strictEqual(record.fulfilmentStatus, 'PENDING_FULFILMENT');
  assert.strictEqual(record.inventoryReservation.status, 'COMMITTED');

  console.log('OK — checkout actual, firma Redsys, precio servidor, idempotencia y notificación bancaria verificados.');
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
