'use strict';
require('./test-env');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NUTRETIUM_TEST_MEMORY_BLOBS = 'true';
process.env.URL = 'https://nutretium.com';
process.env.REQUIRE_PRODUCT_COMPLIANCE = 'true';
globalThis.__NUTRETIUM_TEST_BLOBS__ = new Map();
globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__ = new Map();

const compliance = require('../netlify/lib/compliance-gate');
const root = path.join(__dirname, '..');
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8');

(async () => {
  assert.strictEqual(compliance.strictRequired(), true, 'Producción debe exigir cumplimiento documental');
  const missing = await compliance.checkItems([{ code: 'SKU-SIN-EXPEDIENTE', qty: 1 }]);
  assert.strictEqual(missing.ok, false, 'Un producto sin expediente no puede cobrarse en producción');
  assert.strictEqual(missing.blocked[0]?.status, 'missing');
  assert.strictEqual(missing.blocked[0]?.reason, 'approval-and-evidence-required');

  process.env.COMPLIANCE_EXEMPT_SKUS = 'SKU-EXENTO-DOCUMENTADO';
  const exempt = await compliance.checkItems([{ code: 'SKU-EXENTO-DOCUMENTADO', qty: 1 }]);
  assert.strictEqual(exempt.ok, true, 'Una excepción explícita y documentada debe poder desplegarse');

  const legacyBypass = path.join(root, 'netlify/lib/temporary-access.js');
  assert.strictEqual(fs.existsSync(legacyBypass), false, 'No puede existir un módulo de bypass MFA privilegiado');

  for (const relative of ['netlify/functions/staff-login.js', 'netlify/functions/admin-session.js']) {
    const code = source(relative);
    assert(!code.includes('temporary-access'), `${relative} no puede depender de excepciones temporales MFA`);
    assert(!code.includes('mfaBypass'), `${relative} no puede emitir ni aceptar claims de bypass MFA`);
    assert(!code.includes('mfaRecovery'), `${relative} no puede degradar MFA mediante estados de recuperación`);
  }

  const loginUi = source('staff-login-ui.js');
  assert(!/localStorage\.setItem\(\s*KEY\b/.test(loginUi), 'La UI de staff no puede persistir la sesión en localStorage');

  console.log('[test-release-guards] cumplimiento fail-closed + MFA privilegiado sin bypass + sesión interna no persistente: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
