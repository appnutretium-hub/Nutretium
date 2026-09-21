'use strict';

const assert = require('assert');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';
process.env.URL = 'https://nutretium.com';
process.env.REQUIRE_PRODUCT_COMPLIANCE = 'true';
globalThis.__NUTRETIUM_TEST_BLOBS__ = new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__ = new Map();

const compliance = require('../netlify/lib/compliance-gate');

(async () => {
  assert.strictEqual(compliance.strictRequired(), true, 'Producción debe exigir cumplimiento documental');
  const missing = await compliance.checkItems([{ code: 'SKU-SIN-EXPEDIENTE', qty: 1 }]);
  assert.strictEqual(missing.ok, false, 'Un producto sin expediente no puede cobrarse en producción');
  assert.strictEqual(missing.blocked[0]?.status, 'missing');
  assert.strictEqual(missing.blocked[0]?.reason, 'approval-and-evidence-required');

  process.env.COMPLIANCE_EXEMPT_SKUS = 'SKU-EXENTO-DOCUMENTADO';
  const exempt = await compliance.checkItems([{ code: 'SKU-EXENTO-DOCUMENTADO', qty: 1 }]);
  assert.strictEqual(exempt.ok, true, 'Una excepción explícita y documentada debe poder desplegarse');

  console.log('[test-release-guards] consentimiento contractual y cumplimiento fail-closed: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
