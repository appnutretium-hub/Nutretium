const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

// Physical files are used because scripts/dev-server.js is intentionally a
// minimal static server and does not emulate Netlify _redirects. Redirect routes
// are verified separately by audit-interactive-controls.js.
const pages = [
  '/', '/checkout.html', '/cuenta.html', '/admin-center.html', '/admin.html',
  '/enterprise.html', '/financial-dashboard.html', '/smart-shop.html'
];

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
}

for (const path of pages) {
  test(`controles interactivos sin errores de runtime: ${path}`, async ({ page }) => {
    test.setTimeout(30000);
    const runtimeErrors = [];
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

    const controls = page.locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');
    const count = await controls.count();
    expect(count, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

    // Bound generic exploration so large pages cannot turn this smoke layer
    // into a timeout. Static audit covers every control; dedicated E2E suites
    // cover business-critical flows. This layer detects browser wiring/runtime
    // regressions on a representative set of visible, safe controls.
    const maxControls = Math.min(count, 12);
    for (let i = 0; i < maxControls; i++) {
      if (page.isClosed()) break;
      const control = controls.nth(i);
      if (!(await control.isVisible().catch(() => false))) continue;
      const safe = await control.evaluate(isSafeControl).catch(() => false);
      if (!safe) continue;
      const beforeUrl = page.url();
      await control.scrollIntoViewIfNeeded().catch(() => {});
      await control.click({ timeout: 500, noWaitAfter: true }).catch(() => {});
      if (page.isClosed() || page.url() !== beforeUrl) break;
    }

    expect(runtimeErrors, `errores JS al accionar controles de ${path}: ${runtimeErrors.join(' | ')}`).toEqual([]);
  });
}

test('formularios y enlaces no contienen pseudo-acciones javascript', async ({ page }) => {
  for (const path of pages) {
    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response && response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
    const invalid = await page.locator('a[href="javascript:void(0)"], a[href="javascript:;"], form[action="javascript:void(0)"], form[action="javascript:;"]').count();
    expect(invalid, `pseudo-acciones inválidas en ${path}`).toBe(0);
  }
});
