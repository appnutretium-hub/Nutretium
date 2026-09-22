'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'config', 'reliability-control-plane.json');

function fail(message) {
  throw new Error(`[reliability-control-plane] ${message}`);
}

function read(relativePath) {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) fail(`Falta archivo obligatorio: ${relativePath}`);
  return fs.readFileSync(file, 'utf8');
}

function requireText(relativePath, needles) {
  const text = read(relativePath);
  for (const needle of needles) {
    if (!text.includes(needle)) {
      fail(`${relativePath}: falta contrato obligatorio: ${needle}`);
    }
  }
}

function forbidText(relativePath, needles) {
  const text = read(relativePath);
  for (const needle of needles) {
    if (text.includes(needle)) {
      fail(`${relativePath}: contiene patrón prohibido: ${needle}`);
    }
  }
}

const config = JSON.parse(read('config/reliability-control-plane.json'));
if (config.version !== 1) fail('Versión de configuración no soportada.');
if (config.mode !== 'zero-cost') fail('El modo debe permanecer en zero-cost.');
if (config.principles?.automaticSourceCodeMutation !== false) fail('La mutación automática de código debe permanecer desactivada.');
if (config.principles?.paidExternalServicesRequired !== false) fail('No se permiten dependencias obligatorias de pago.');

for (const [name, layer] of Object.entries(config.layers || {})) {
  if (layer.required !== true) fail(`La capa crítica ${name} no está marcada como obligatoria.`);
  const target = layer.workflow || layer.function || layer.script || layer.library || layer.test;
  if (!target) fail(`La capa ${name} no define archivo objetivo.`);
  read(target);
}

requireText('.github/workflows/quality-gate.yml', [
  'pull_request:',
  'branches: [main]',
  'npm run test:security',
  'npm run test:enterprise',
  'Repository-wide programming integrity',
  'Browser E2E · Chromium'
]);

requireText('.github/workflows/guardian.yml', [
  'Guardian syntax and policy tests',
  'Security gates',
  'Guardian browser E2E'
]);

requireText('.github/workflows/preproduction-gate.yml', [
  'Supply-chain and contracts',
  'Static quality budgets',
  'Syntax and enterprise tests'
]);

requireText('.github/workflows/production-smoke.yml', [
  'schedule:',
  '0 */6 * * *',
  'Verify public storefront',
  'Verify Guardian runtime is live',
  'Guarded automatic rollback',
  "AUTO_ROLLBACK_ENABLED == 'true'"
]);

requireText('netlify.toml', [
  '[functions."production-sentinel"]',
  'schedule = "*/30 * * * *"',
  '[functions."platform-backup"]',
  'schedule = "@daily"'
]);

requireText('netlify/functions/production-sentinel.js', [
  'production-readiness-transition',
  'healthSnapshot',
  'saveIncident',
  'notifyTransition'
]);

requireText('guardian-runtime.js', [
  'NUTRETIUM Guardian Runtime',
  '/.netlify/functions/client-error'
]);

requireText('.github/workflows/main-integrity.yml', [
  'Verify main commit origin',
  'fromMergedPr',
  'allowedCatalogCommit'
]);

requireText('scripts/test-zero-cost-policy.js', [
  'externalSpendLimitEur,0',
  'paidAiProvidersAllowed,false',
  'automaticTopupsAllowed,false'
]);

forbidText('config/reliability-control-plane.json', [
  'direct_source_code_edit_in_production\": true',
  'automatic_paid_service_enablement\": true'
]);

const remediation = new Set(config.authorizedAutomaticRemediation || []);
for (const expected of [
  'retry_transient_http_checks',
  'cancel_superseded_ci_runs',
  'netlify_rollback_when_explicitly_enabled'
]) {
  if (!remediation.has(expected)) fail(`Falta remediación segura autorizada: ${expected}`);
}

console.log(JSON.stringify({
  ok: true,
  controlPlane: config.name,
  mode: config.mode,
  layers: Object.keys(config.layers || {}),
  automaticSourceCodeMutation: false,
  paidExternalServicesRequired: false
}, null, 2));
