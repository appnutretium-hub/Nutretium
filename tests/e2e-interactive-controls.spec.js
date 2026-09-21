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

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
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
      test.setTimeout(60000);
      const runtimeErrors = [];
      await preparePage(page, path, runtimeErrors);

      const selector = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';
      const count = await page.locator(selector).count();
      expect(count, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

      // Every rendered control belongs deterministically to exactly one shard.
      // Reload before each action so one control cannot contaminate the state of
      // the next one. Destructive/payment/session-ending actions are excluded
      // here and remain covered by their dedicated flow/security suites.
      for (let i = shard; i < count; i += CONTROL_SHARDS) {
        if (page.isClosed()) throw new Error(`la página se cerró antes de verificar ${path} control #${i}`);

        if (page.url() !== BASE + path) {
          await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
        } else if (i !== shard) {
          await page.reload({ waitUntil: 'domcontentloaded' });
        }

        const controls = page.locator(selector);
        const currentCount = await controls.count();
        expect(currentCount, `cambió el número de controles en ${path}`).toBe(count);

        const control = controls.nth(i);
        if (!(await control.isVisible().catch(() => false))) continue;
        const safe = await control.evaluate(isSafeControl).catch(() => false);
        if (!safe) continue;

        const beforeErrors = runtimeErrors.length;
        await control.scrollIntoViewIfNeeded();
        await control.click({ timeout: 1500, noWaitAfter: true });
        await page.waitForTimeout(75);

        expect(
          runtimeErrors.slice(beforeErrors),
          `errores JS en ${path} control #${i}: ${runtimeErrors.slice(beforeErrors).join(' | ')}`
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
