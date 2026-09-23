const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

// Physical files are used because scripts/dev-server.js is intentionally a
// minimal static server and does not emulate Netlify _redirects. Redirect routes
// are verified separately by audit-interactive-controls.js.
const pages = [
  '/', '/checkout.html', '/cuenta.html', '/admin-center.html', '/admin.html',
  '/enterprise.html', '/financial-dashboard.html', '/smart-shop.html'
];

const CONTROL_SHARDS = 4;
const CONTROL_SELECTOR = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';
const UI_SETTLE_MS = 100;
const TARGET_LOAD_ATTEMPTS = 3;
const TARGET_NAVIGATION_TIMEOUT_MS = 15000;
const FUNCTION_STUB_BODY = JSON.stringify({ ok: false, error: 'E2E_FUNCTION_UNAVAILABLE' });

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
}

function semanticLabel(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const separator = text.indexOf(' · ');
  return separator > 0 ? text.slice(0, separator) : text;
}

function machineIdentity(item) {
  return [
    ['testid', item.testid],
    ['id', item.id],
    ['action', item.action],
    ['name', item.name]
  ].find(([, value]) => value) || null;
}

function descriptorSignature(item) {
  const stable = machineIdentity(item);
  if (stable) return `${item.tag}|${item.type}|${stable[0]}=${stable[1]}`;
  if (item.aria) return `${item.tag}|${item.type}|aria=${semanticLabel(item.aria)}`;
  return `${item.tag}|${item.type}|role=${item.role}|text=${semanticLabel(item.text)}`;
}

async function settle(page) {
  await page.waitForTimeout(UI_SETTLE_MS);
}

async function stopResidualNavigation(page) {
  if (page.isClosed()) return;
  await page.evaluate(() => window.stop()).catch(() => {});
  await page.waitForTimeout(25);
}

async function readRawControls(page) {
  return page.evaluate(selector => Array.from(document.querySelectorAll(selector)).map(el => {
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    return {
      tag: clean(el.tagName).toLowerCase(),
      id: clean(el.id),
      testid: clean(el.getAttribute('data-testid')),
      action: clean(el.getAttribute('data-action')),
      name: clean(el.getAttribute('name')),
      aria: clean(el.getAttribute('aria-label')),
      role: clean(el.getAttribute('role')),
      type: clean(el.getAttribute('type')),
      text: clean(el.textContent).slice(0, 240)
    };
  }), CONTROL_SELECTOR);
}

async function snapshotControls(page) {
  const raw = await readRawControls(page);
  const occurrences = new Map();
  const semanticFamilies = new Set();
  const snapshot = [];

  for (const item of raw) {
    const signature = descriptorSignature(item);
    const exact = Boolean(machineIdentity(item));
    if (!exact) {
      if (semanticFamilies.has(signature)) continue;
      semanticFamilies.add(signature);
      snapshot.push({ ...item, signature, occurrence: 0, exact: false });
      continue;
    }
    const occurrence = occurrences.get(signature) || 0;
    occurrences.set(signature, occurrence + 1);
    snapshot.push({ ...item, signature, occurrence, exact: true });
  }
  return snapshot;
}

async function concreteDomIndex(page, target) {
  const raw = await readRawControls(page);
  let exactOccurrence = 0;
  for (let rawIndex = 0; rawIndex < raw.length; rawIndex++) {
    const candidate = raw[rawIndex];
    if (descriptorSignature(candidate) !== target.signature) continue;
    if (!target.exact || exactOccurrence === target.occurrence) return rawIndex;
    exactOccurrence += 1;
  }
  return -1;
}

async function reloadTarget(page, path, target) {
  for (let attempt = 1; attempt <= TARGET_LOAD_ATTEMPTS; attempt++) {
    await stopResidualNavigation(page);
    await page.goto(BASE + path, {
      waitUntil: 'domcontentloaded',
      timeout: TARGET_NAVIGATION_TIMEOUT_MS
    });
    await settle(page);
    const domIndex = await concreteDomIndex(page, target);
    if (domIndex >= 0) return { domIndex, attempts: attempt };
  }
  return { domIndex: -1, attempts: TARGET_LOAD_ATTEMPTS };
}

async function installDeterministicClientState(page) {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (_) {}
    try { window.sessionStorage.clear(); } catch (_) {}
  });
  await page.context().clearCookies();
}

async function preparePage(page, path, runtimeErrors) {
  page.on('pageerror', err => {
    const message = String(err && err.message || err);
    if (/failed to fetch|networkerror|load failed/i.test(message)) return;
    runtimeErrors.push(message);
  });
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  await installDeterministicClientState(page);
  await page.route('**/.netlify/functions/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json; charset=utf-8',
    body: FUNCTION_STUB_BODY
  }));

  const response = await page.goto(BASE + path, {
    waitUntil: 'domcontentloaded',
    timeout: TARGET_NAVIGATION_TIMEOUT_MS
  });
  expect(response, `sin respuesta para ${path}`).not.toBeNull();
  expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
  await settle(page);
}

for (const path of pages) {
  for (let shard = 0; shard < CONTROL_SHARDS; shard++) {
    test(`controles interactivos sin errores de runtime: ${path} [${shard + 1}/${CONTROL_SHARDS}]`, async ({ page }) => {
      test.setTimeout(120000);
      const runtimeErrors = [];
      const conditionalAbsences = [];
      await preparePage(page, path, runtimeErrors);

      const baseline = await snapshotControls(page);
      expect(baseline.length, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

      for (let i = shard; i < baseline.length; i += CONTROL_SHARDS) {
        if (page.isClosed()) throw new Error(`la página se cerró antes de verificar ${path} control #${i}`);
        const target = baseline[i];
        const located = await reloadTarget(page, path, target);

        if (located.domIndex < 0) {
          conditionalAbsences.push(target.signature);
          continue;
        }

        const control = page.locator(CONTROL_SELECTOR).nth(located.domIndex);
        if (!(await control.isVisible().catch(() => false))) continue;
        const safe = await control.evaluate(isSafeControl).catch(() => false);
        if (!safe) continue;

        const beforeErrors = runtimeErrors.length;
        await control.dispatchEvent('click');
        await page.waitForTimeout(75);
        await stopResidualNavigation(page);

        expect(
          runtimeErrors.slice(beforeErrors),
          `errores JS en ${path} control ${target.signature}: ${runtimeErrors.slice(beforeErrors).join(' | ')}`
        ).toEqual([]);
      }

      if (conditionalAbsences.length) {
        console.log(`[interactive-controls] ${path} shard ${shard + 1}: controles condicionales observados en baseline pero no remontados tras ${TARGET_LOAD_ATTEMPTS} cargas: ${conditionalAbsences.join(' | ')}`);
      }
      expect(runtimeErrors, `errores JS al accionar controles de ${path}: ${runtimeErrors.join(' | ')}`).toEqual([]);
    });
  }
}

for (const path of pages) {
  test(`formularios y enlaces sin pseudo-acciones javascript: ${path}`, async ({ page }) => {
    const response = await page.goto(BASE + path, {
      waitUntil: 'domcontentloaded',
      timeout: TARGET_NAVIGATION_TIMEOUT_MS
    });
    expect(response && response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
    await settle(page);
    const invalid = await page.locator('a[href="javascript:void(0)"], a[href="javascript:;"], form[action="javascript:void(0)"], form[action="javascript:;"]').count();
    expect(invalid, `pseudo-acciones inválidas en ${path}`).toBe(0);
  });
}
