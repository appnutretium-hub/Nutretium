const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

// Physical files are used because scripts/dev-server.js is intentionally a
// minimal static server and does not emulate Netlify _redirects. Redirect routes
// are verified separately by audit-interactive-controls.js.
const pages = [
  '/', '/checkout.html', '/cuenta.html', '/admin-center.html', '/admin.html',
  '/enterprise.html', '/financial-dashboard.html', '/smart-shop.html'
];

// Split every page into independent shards. This keeps exhaustive browser
// coverage without a single monolithic test owning the full execution budget.
const CONTROL_SHARDS = 4;
const CONTROL_SELECTOR = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
}

function descriptorSignature(item) {
  // Prefer explicit stable identity. Text is only the final fallback for legacy
  // controls that do not yet expose an id/test id/action/name/aria label.
  const stable = [
    ['testid', item.testid],
    ['id', item.id],
    ['action', item.action],
    ['name', item.name],
    ['aria', item.aria]
  ].find(([, value]) => value);
  if (stable) return `${item.tag}|${item.type}|${stable[0]}=${stable[1]}`;
  return `${item.tag}|${item.type}|role=${item.role}|text=${item.text}`;
}

async function snapshotControls(page) {
  const raw = await page.locator(CONTROL_SELECTOR).evaluateAll(elements => elements.map(el => {
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
  }));

  const occurrences = new Map();
  return raw.map(item => {
    const signature = descriptorSignature(item);
    const occurrence = occurrences.get(signature) || 0;
    occurrences.set(signature, occurrence + 1);
    return { ...item, signature, occurrence };
  });
}

async function installDeterministicClientState(page) {
  // Generic control certification must not allow a previous click to alter the
  // next control's initial state. Clear browser-only state before every document
  // is evaluated. Backend mutations are blocked separately below.
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch (_) {}
    try { window.sessionStorage.clear(); } catch (_) {}
  });
  await page.context().clearCookies();
}

async function preparePage(page, path, runtimeErrors) {
  page.on('pageerror', err => {
    const message = String(err && err.message || err);
    // Generic UI coverage runs against a static CI server. Network failures
    // caused only by unavailable serverless endpoints are expected here and
    // are validated in their endpoint-specific suites instead.
    if (/failed to fetch|networkerror|load failed/i.test(message)) return;
    runtimeErrors.push(message);
  });
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

  await installDeterministicClientState(page);

  // Do not fake backend contracts in a generic UI test. Abort Functions and
  // validate their real contracts in the dedicated API/flow suites.
  await page.route('**/.netlify/functions/**', route => route.abort('blockedbyclient'));

  const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  expect(response, `sin respuesta para ${path}`).not.toBeNull();
  expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
}

for (const path of pages) {
  for (let shard = 0; shard < CONTROL_SHARDS; shard++) {
    test(`controles interactivos sin errores de runtime: ${path} [${shard + 1}/${CONTROL_SHARDS}]`, async ({ page }) => {
      test.setTimeout(120000);
      const runtimeErrors = [];
      await preparePage(page, path, runtimeErrors);

      const baseline = await snapshotControls(page);
      expect(baseline.length, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

      // Snapshot stable control identities once. Subsequent reloads are allowed
      // to add/remove legitimate conditional controls, but every control from
      // the certified baseline must still be individually locatable. This avoids
      // the former brittle global-count assertion while preserving exhaustive
      // coverage of the original rendered surface.
      for (let i = shard; i < baseline.length; i += CONTROL_SHARDS) {
        if (page.isClosed()) throw new Error(`la página se cerró antes de verificar ${path} control #${i}`);

        await page.context().clearCookies();
        if (page.url() !== BASE + path) {
          await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
        } else if (i !== shard) {
          await page.reload({ waitUntil: 'domcontentloaded' });
        }

        const current = await snapshotControls(page);
        const target = baseline[i];
        const currentIndex = current.findIndex(item =>
          item.signature === target.signature && item.occurrence === target.occurrence
        );
        expect(
          currentIndex,
          `desapareció el control certificado en ${path}: ${target.signature} [${target.occurrence}]`
        ).toBeGreaterThanOrEqual(0);

        const control = page.locator(CONTROL_SELECTOR).nth(currentIndex);
        if (!(await control.isVisible().catch(() => false))) continue;
        const safe = await control.evaluate(isSafeControl).catch(() => false);
        if (!safe) continue;

        const beforeErrors = runtimeErrors.length;
        // This suite certifies wiring/runtime behavior, not z-index geometry.
        // Dispatch the DOM click directly so transient consent banners and fixed
        // launchers cannot create false negatives. Real pointer actionability,
        // layout and accessibility are covered by the dedicated E2E/quality
        // suites that run in the same Full Quality Gate.
        await control.dispatchEvent('click');
        await page.waitForTimeout(75);

        expect(
          runtimeErrors.slice(beforeErrors),
          `errores JS en ${path} control ${target.signature}: ${runtimeErrors.slice(beforeErrors).join(' | ')}`
        ).toEqual([]);
      }

      expect(runtimeErrors, `errores JS al accionar controles de ${path}: ${runtimeErrors.join(' | ')}`).toEqual([]);
    });
  }
}

for (const path of pages) {
  test(`formularios y enlaces sin pseudo-acciones javascript: ${path}`, async ({ page }) => {
    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response && response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
    const invalid = await page.locator('a[href="javascript:void(0)"], a[href="javascript:;"], form[action="javascript:void(0)"], form[action="javascript:;"]').count();
    expect(invalid, `pseudo-acciones inválidas en ${path}`).toBe(0);
  });
}
