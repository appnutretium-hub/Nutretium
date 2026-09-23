'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
const LIB_DIR = path.join(ROOT, 'netlify', 'lib');
const STORAGE_FACADE = path.join(LIB_DIR, 'storage.js');
const LEGACY_STORAGE_FACADE = path.join(LIB_DIR, 'blob-store.js');
const RUNTIME_ADAPTER = path.join(LIB_DIR, 'netlify-blobs-runtime.js');
const problems = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walkJs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJs(file, out);
    else if (entry.isFile() && file.endsWith('.js')) out.push(file);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function resolveLocal(from, request) {
  if (!request.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), request);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const jsFiles = [...walkJs(LIB_DIR), ...walkJs(FUNCTIONS_DIR)];
const sources = new Map(jsFiles.map(file => [file, read(file)]));
const deps = new Map();
for (const [file, source] of sources) {
  const list = [];
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(source))) {
    const resolved = resolveLocal(file, match[1]);
    if (resolved && sources.has(resolved)) list.push(resolved);
  }
  deps.set(file, list);
}

function importsNetlifyBlobs(source) {
  return /require\(\s*['"]@netlify\/blobs['"]\s*\)/.test(source) ||
    /from\s+['"]@netlify\/blobs['"]/.test(source);
}

const allowedBlobConsumers = new Set([STORAGE_FACADE, RUNTIME_ADAPTER]);
let storageImplicitRuntimeContext = false;
let storageExplicitApiContext = false;

if (!sources.has(STORAGE_FACADE)) {
  problems.push('netlify/lib/storage.js: falta la fachada canónica de almacenamiento');
} else {
  const storageSource = sources.get(STORAGE_FACADE) || '';
  if (!importsNetlifyBlobs(storageSource) || !/\bgetStore\b/.test(storageSource)) {
    problems.push('netlify/lib/storage.js: la fachada no conecta con @netlify/blobs mediante getStore');
  }
  storageImplicitRuntimeContext = /\bgetStore\s*\(\s*name\s*\)/.test(storageSource);
  storageExplicitApiContext = /\bgetStore\s*\(\s*\{[^}]*\bname\b[^}]*\bsiteID\b[^}]*\btoken\b[^}]*\}\s*\)/s.test(storageSource);
  if (!storageImplicitRuntimeContext && !storageExplicitApiContext) {
    problems.push('netlify/lib/storage.js: getStore no dispone de contexto runtime implícito ni configuración API explícita');
  }
}

if (!sources.has(RUNTIME_ADAPTER)) {
  problems.push('netlify/lib/netlify-blobs-runtime.js: falta el adaptador de compatibilidad Lambda');
} else {
  const runtimeSource = sources.get(RUNTIME_ADAPTER) || '';
  if (!importsNetlifyBlobs(runtimeSource) || !/\bconnectLambda\b/.test(runtimeSource) || !/\bconnectBlobs\b/.test(runtimeSource)) {
    problems.push('netlify/lib/netlify-blobs-runtime.js: adaptador Lambda incompleto; debe encapsular connectLambda mediante connectBlobs');
  }
}

if (sources.has(LEGACY_STORAGE_FACADE)) {
  const legacyDeps = deps.get(LEGACY_STORAGE_FACADE) || [];
  if (!legacyDeps.includes(STORAGE_FACADE)) {
    problems.push('netlify/lib/blob-store.js: la fachada legacy debe delegar en netlify/lib/storage.js');
  }
}

const directBlobConsumers = jsFiles.filter(file => importsNetlifyBlobs(sources.get(file) || ''));
for (const file of directBlobConsumers) {
  if (!allowedBlobConsumers.has(file)) {
    problems.push(`${rel(file)}: bypass de almacenamiento; importa @netlify/blobs fuera de los adaptadores autorizados`);
  }
}

const persistenceMemo = new Map();
function dependsOnPersistence(file, stack = new Set()) {
  if (persistenceMemo.has(file)) return persistenceMemo.get(file);
  if (file === STORAGE_FACADE) {
    persistenceMemo.set(file, true);
    return true;
  }
  if (stack.has(file)) return false;
  const next = new Set(stack);
  next.add(file);
  const result = (deps.get(file) || []).some(dep => dependsOnPersistence(dep, next));
  persistenceMemo.set(file, result);
  return result;
}

const functionFiles = walkJs(FUNCTIONS_DIR);
const persistentFunctions = functionFiles.filter(file => dependsOnPersistence(file));
const lambdaPersistentFunctions = persistentFunctions.filter(file => /\bexports\.handler\s*=/.test(sources.get(file) || ''));
const lambdaWithRuntimeConnector = lambdaPersistentFunctions.filter(file => {
  const source = sources.get(file) || '';
  return (deps.get(file) || []).includes(RUNTIME_ADAPTER) && /\bconnectBlobs\s*\(\s*event\s*\)/.test(source);
});
const lambdaUsingStorageFacade = lambdaPersistentFunctions.filter(file => dependsOnPersistence(file));

function parseTomlRedirects(text) {
  const rows = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '[[redirects]]') {
      if (current?.from) rows.push(current);
      current = {};
      continue;
    }
    if (line.startsWith('[') && line !== '[[redirects]]') {
      if (current?.from) rows.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    let m = line.match(/^from\s*=\s*"([^"]+)"/);
    if (m) current.from = m[1];
    m = line.match(/^to\s*=\s*"([^"]+)"/);
    if (m) current.to = m[1];
    m = line.match(/^status\s*=\s*(\d+)/);
    if (m) current.status = Number(m[1]);
  }
  if (current?.from) rows.push(current);
  return rows;
}

function parseRedirectFile(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const status = /^\d+$/.test(parts[2] || '') ? Number(parts[2]) : 301;
    rows.push({ from: parts[0], to: parts[1], status });
  }
  return rows;
}

const netlifyToml = read(path.join(ROOT, 'netlify.toml'));
const redirectFilePath = path.join(ROOT, '_redirects');
const tomlRoutes = parseTomlRedirects(netlifyToml).map(row => ({ ...row, source: 'netlify.toml' }));
const fileRoutes = fs.existsSync(redirectFilePath)
  ? parseRedirectFile(read(redirectFilePath)).map(row => ({ ...row, source: '_redirects' }))
  : [];
const routes = [...tomlRoutes, ...fileRoutes];

const byFrom = new Map();
for (const route of routes) {
  if (!route.from || !route.to) {
    problems.push(`${route.source}: regla de ruta incompleta`);
    continue;
  }
  const list = byFrom.get(route.from) || [];
  list.push(route);
  byFrom.set(route.from, list);
}
for (const [from, list] of byFrom) {
  const signatures = new Set(list.map(row => `${row.to}|${row.status || 301}`));
  if (signatures.size > 1) {
    problems.push(`ruta ${from}: conflicto entre ${list.map(row => `${row.source} -> ${row.to} (${row.status || 301})`).join(' / ')}`);
  }
}

function staticTargetExists(target) {
  const clean = String(target || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) return true;
  if (clean.includes('*') || clean.includes(':')) return true;
  if (clean.startsWith('/.netlify/functions/')) {
    const fn = clean.slice('/.netlify/functions/'.length).split('/')[0];
    return Boolean(fn) && fs.existsSync(path.join(FUNCTIONS_DIR, `${fn}.js`));
  }
  const candidate = path.join(ROOT, clean.slice(1));
  if (fs.existsSync(candidate)) return true;
  if (!path.extname(candidate) && fs.existsSync(`${candidate}.html`)) return true;
  return false;
}
for (const route of routes) {
  if (!staticTargetExists(route.to)) problems.push(`${route.source}: ${route.from} apunta a destino inexistente ${route.to}`);
}

const scheduled = [];
let fnBlock = null;
for (const raw of netlifyToml.split(/\r?\n/)) {
  const line = raw.trim();
  const header = line.match(/^\[functions\."([^"]+)"\]$/);
  if (header) {
    fnBlock = header[1];
    continue;
  }
  if (line.startsWith('[')) {
    fnBlock = null;
    continue;
  }
  if (fnBlock && /^schedule\s*=/.test(line)) scheduled.push(fnBlock);
}
for (const name of scheduled) {
  const file = path.join(FUNCTIONS_DIR, `${name}.js`);
  if (!fs.existsSync(file)) problems.push(`netlify.toml: función programada inexistente: ${name}`);
}

const report = {
  ok: problems.length === 0,
  routes: {
    totalRules: routes.length,
    uniqueSources: byFrom.size,
    toml: tomlRoutes.length,
    redirectsFile: fileRoutes.length,
  },
  storageContext: {
    implicitNetlifyRuntime: storageImplicitRuntimeContext,
    explicitApiCredentials: storageExplicitApiContext,
  },
  functions: {
    total: functionFiles.length,
    persistenceDependent: persistentFunctions.length,
    lambdaPersistenceDependent: lambdaPersistentFunctions.length,
    lambdaUsingStorageFacade: lambdaUsingStorageFacade.length,
    lambdaWithRuntimeConnector: lambdaWithRuntimeConnector.length,
    directBlobConsumers: directBlobConsumers.map(rel),
    scheduled: scheduled.length,
  },
  warnings,
  problems,
};

console.log(JSON.stringify(report, null, 2));
if (problems.length) process.exitCode = 1;
