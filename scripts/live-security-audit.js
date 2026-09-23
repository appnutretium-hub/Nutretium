'use strict';

const http = require('http');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs');

const TARGET = new URL(process.env.TARGET_URL || 'https://nutretium.com');
const ALLOWED_HOSTS = new Set(['nutretium.com', 'www.nutretium.com']);
if (!ALLOWED_HOSTS.has(TARGET.hostname)) {
  throw new Error(`TARGET_URL no autorizado para este auditor: ${TARGET.hostname}`);
}

const UA = `Nutretium-Authorized-Security-Audit/1.0 run=${process.env.GITHUB_RUN_ID || 'local'}`;
const results = [];
const severityWeight = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function add(name, ok, severity, detail) {
  results.push({ name, ok: Boolean(ok), severity, detail: String(detail || '') });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] [${severity.toUpperCase()}] ${name} :: ${detail}`);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function lowerHeaders(headers = {}) { return Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v || '')])); }
function bodyText(value) { return Buffer.isBuffer(value) ? value.toString('utf8') : String(value || ''); }

function oneRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(url, {
      method,
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...headers },
      timeout: timeoutMs,
      rejectUnauthorized: true,
    }, res => {
      const chunks = [];
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= 512 * 1024) chunks.push(chunk);
      });
      res.on('end', () => resolve({
        status: Number(res.statusCode || 0),
        headers: lowerHeaders(res.headers),
        body: Buffer.concat(chunks),
        url: url.toString(),
      }));
    });
    req.on('timeout', () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

async function requestFollow(url, options = {}, max = 4) {
  let current = new URL(url);
  for (let i = 0; i <= max; i++) {
    const res = await oneRequest(current, options);
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const loc = res.headers.location;
    if (!loc) return res;
    const next = new URL(loc, current);
    if (!ALLOWED_HOSTS.has(next.hostname) || next.protocol !== 'https:') return { ...res, redirectUnsafe: next.toString() };
    current = next;
  }
  throw new Error('Demasiadas redirecciones');
}

async function tlsProbe() {
  const host = TARGET.hostname;
  const data = await new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, minVersion: 'TLSv1.2', rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      resolve({ protocol: socket.getProtocol(), authorized: socket.authorized, cert });
      socket.end();
    });
    socket.setTimeout(10000, () => socket.destroy(new Error('TLS timeout')));
    socket.on('error', reject);
  });
  const protocol = String(data.protocol || '');
  add('TLS >= 1.2 negociado', data.authorized && /TLSv1\.[23]/.test(protocol), 'high', `protocol=${protocol} authorized=${data.authorized}`);
  const expiry = Date.parse(data.cert?.valid_to || '');
  if (Number.isFinite(expiry)) {
    const days = Math.floor((expiry - Date.now()) / 86400000);
    add('Certificado TLS con margen >14 días', days > 14, days <= 14 ? 'high' : 'medium', `caduca en ${days} días (${data.cert.valid_to})`);
  } else add('Fecha de certificado TLS legible', false, 'high', 'No se pudo leer valid_to');
}

async function httpRedirectProbe() {
  const url = new URL(`http://${TARGET.hostname}/`);
  const res = await oneRequest(url, { method: 'GET' });
  const loc = res.headers.location || '';
  add('HTTP redirige a HTTPS', [301,302,307,308].includes(res.status) && /^https:\/\//i.test(loc), 'high', `status=${res.status} location=${loc || '-'} `);
}

async function rootHeadersProbe() {
  const res = await requestFollow(TARGET, { method: 'GET' });
  if (res.redirectUnsafe) add('Redirecciones permanecen en origen confiable HTTPS', false, 'critical', res.redirectUnsafe);
  else add('Home accesible por HTTPS', res.status >= 200 && res.status < 400, 'high', `status=${res.status} final=${res.url}`);
  const h = res.headers;
  const csp = h['content-security-policy'] || '';
  add('HSTS activo', /max-age=\d+/i.test(h['strict-transport-security'] || ''), 'high', h['strict-transport-security'] || 'ausente');
  add('CSP activa', Boolean(csp), 'high', csp || 'ausente');
  add('Anti-clickjacking', /deny|sameorigin/i.test(h['x-frame-options'] || '') || /frame-ancestors\s+[^;]+/i.test(csp), 'high', h['x-frame-options'] || (csp.match(/frame-ancestors[^;]*/i)?.[0] || 'ausente'));
  add('MIME sniffing bloqueado', (h['x-content-type-options'] || '').toLowerCase() === 'nosniff', 'medium', h['x-content-type-options'] || 'ausente');
  add('Referrer Policy definida', Boolean(h['referrer-policy']), 'medium', h['referrer-policy'] || 'ausente');
  add('Permissions Policy definida', Boolean(h['permissions-policy']), 'medium', h['permissions-policy'] || 'ausente');
  add('COOP definida', Boolean(h['cross-origin-opener-policy']), 'medium', h['cross-origin-opener-policy'] || 'ausente');
  add('CORP definida', Boolean(h['cross-origin-resource-policy']), 'medium', h['cross-origin-resource-policy'] || 'ausente');
  add('Sin X-Powered-By', !h['x-powered-by'], 'low', h['x-powered-by'] || 'no expuesto');
}

async function sensitiveSurfaceProbe() {
  const paths = [
    '/.env','/.env.production','/.git/config','/.git/HEAD','/netlify.toml','/package.json','/package-lock.json',
    '/CLAUDE.md','/.github/workflows/quality.yml','/sources/_catalogo/CATALOGO.csv','/scripts/live-security-audit.js',
    '/scripts/test-defense-in-depth.js','/app.js.map','/styles.css.map','/backup.zip','/database.sql'
  ];
  for (const path of paths) {
    const res = await oneRequest(new URL(path, TARGET));
    const exposed = res.status >= 200 && res.status < 300 && bodyText(res.body).length > 0;
    add(`No exposición sensible ${path}`, !exposed, exposed ? 'critical' : 'info', `status=${res.status} bytes=${res.body.length}`);
    await sleep(80);
  }
}

async function methodAndCorsProbe() {
  const trace = await oneRequest(new URL('/', TARGET), { method: 'TRACE' }).catch(err => ({ status: 0, headers: {}, body: Buffer.from(String(err.message)) }));
  add('TRACE deshabilitado', !(trace.status >= 200 && trace.status < 300), 'high', `status=${trace.status}`);

  const endpoint = new URL('/.netlify/functions/staff-login', TARGET);
  const cors = await oneRequest(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const allow = cors.headers['access-control-allow-origin'] || '';
  add('CORS no autoriza origen hostil', allow !== '*' && allow !== 'https://evil.example', 'high', `status=${cors.status} allow-origin=${allow || '-'} `);
}

async function authBoundaryProbe() {
  const noAuthCases = [
    ['admin-governance', 'POST', { action: 'overview' }],
    ['admin-settings', 'GET', null],
    ['platform-restore', 'POST', { key: 'daily/2099-01-01' }],
    ['refund-redsys', 'POST', { orderId: 'SECURITYTEST', amountCents: 1 }],
  ];
  for (const [fn, method, payload] of noAuthCases) {
    const body = payload === null ? null : JSON.stringify(payload);
    const headers = { Origin: TARGET.origin, 'Sec-Fetch-Site': 'same-origin' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    const res = await oneRequest(new URL(`/.netlify/functions/${fn}`, TARGET), { method, headers, body });
    const protectedStatus = [400,401,403,405,428,429,503].includes(res.status);
    add(`Endpoint privilegiado ${fn} no permite acceso anónimo`, protectedStatus, 'critical', `status=${res.status}`);
    const text = bodyText(res.body);
    add(`Endpoint ${fn} no filtra stack trace`, !/\bat\s+[\w$.<>]+\s*\([^\n]+:\d+:\d+\)/.test(text), 'high', `bytes=${text.length}`);
    await sleep(120);
  }

  const hostile = await oneRequest(new URL('/.netlify/functions/staff-login', TARGET), {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'security-audit@example.invalid', password: 'not-a-real-password' }),
  });
  add('Login de personal bloquea petición cross-site', [400,401,403].includes(hostile.status) && hostile.status !== 200, 'high', `status=${hostile.status} body=${bodyText(hostile.body).slice(0,120)}`);

  const missingOrigin = await oneRequest(new URL('/.netlify/functions/staff-login', TARGET), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'security-audit@example.invalid', password: 'not-a-real-password' }),
  });
  add('Login de personal rechaza mutación sin Origin en producción', [400,403].includes(missingOrigin.status), 'high', `status=${missingOrigin.status}`);

  const invalidJson = await oneRequest(new URL('/.netlify/functions/staff-login', TARGET), {
    method: 'POST',
    headers: { Origin: TARGET.origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
    body: '{not-json',
  });
  add('JSON inválido falla cerrado sin 5xx', invalidJson.status >= 400 && invalidJson.status < 500, 'medium', `status=${invalidJson.status}`);
}

// El freno de staff-login permite PASSWORD_LIMIT intentos (10) en cada ventana
// de 5 minutos, así que con 7 peticiones no podía saltar nunca: la comprobación
// daba «freno inexistente» aunque funcionara. Se prueba con margen sobre ese
// tope y se corta en cuanto frena, para no insistir sobre el sitio publicado
// más de lo necesario.
const RATE_LIMIT_ATTEMPTS = 13;

async function rateLimitProbe() {
  const id = crypto.randomBytes(8).toString('hex');
  const email = `security-audit-${id}@example.invalid`;
  const statuses = [];
  for (let i = 0; i < RATE_LIMIT_ATTEMPTS; i++) {
    const res = await oneRequest(new URL('/.netlify/functions/staff-login', TARGET), {
      method: 'POST',
      headers: { Origin: TARGET.origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: `invalid-${id}-${i}` }),
    });
    statuses.push(res.status);
    if (res.status === 429 || res.status === 503) break;
    await sleep(250);
  }
  const throttled = statuses.some(status => status === 429 || status === 503);
  add('Rate limit real de staff-login entra en acción', throttled, 'high', `statuses=${statuses.join(',')}`);
}

async function cacheProbe() {
  const res = await oneRequest(new URL('/.netlify/functions/admin-governance', TARGET), {
    method: 'POST',
    headers: { Origin: TARGET.origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'overview' }),
  });
  const cc = (res.headers['cache-control'] || '').toLowerCase();
  add('Respuesta administrativa no cacheable', /no-store/.test(cc), 'medium', cc || 'ausente');
}

function writeSummary() {
  const failures = results.filter(r => !r.ok);
  const critical = failures.filter(r => r.severity === 'critical').length;
  const high = failures.filter(r => r.severity === 'high').length;
  const medium = failures.filter(r => r.severity === 'medium').length;
  const low = failures.filter(r => r.severity === 'low').length;
  const report = { target: TARGET.origin, at: new Date().toISOString(), totals: { checks: results.length, failures: failures.length, critical, high, medium, low }, results };
  fs.writeFileSync('live-security-report.json', JSON.stringify(report, null, 2));
  const summary = [
    '# Nutretium Live Security Audit',
    '',
    `Target: \`${TARGET.origin}\``,
    `Checks: **${results.length}** · Critical: **${critical}** · High: **${high}** · Medium: **${medium}** · Low: **${low}**`,
    '',
    '| Estado | Severidad | Control | Detalle |',
    '|---|---|---|---|',
    ...results.map(r => `| ${r.ok ? 'PASS' : 'FAIL'} | ${r.severity.toUpperCase()} | ${r.name.replace(/\|/g,'/')} | ${r.detail.replace(/\|/g,'/').replace(/\n/g,' ').slice(0,220)} |`),
    '',
    '> Auditoría autorizada y no destructiva: no explota vulnerabilidades, no extrae datos y limita deliberadamente el volumen de peticiones.',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  console.log(`\n[summary] ${JSON.stringify(report.totals)}`);
  return { critical, high, medium, low };
}

(async () => {
  console.log(`[live-security] Target autorizado: ${TARGET.origin}`);
  await tlsProbe();
  await httpRedirectProbe();
  await rootHeadersProbe();
  await sensitiveSurfaceProbe();
  await methodAndCorsProbe();
  await authBoundaryProbe();
  await cacheProbe();
  await rateLimitProbe();
  const totals = writeSummary();
  if (totals.critical > 0 || totals.high > 0) process.exit(2);
})().catch(err => {
  console.error('[live-security] FATAL', err && err.stack ? err.stack : err);
  process.exit(3);
});
