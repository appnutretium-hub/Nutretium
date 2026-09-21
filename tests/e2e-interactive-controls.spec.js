const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

// Physical files are used here because scripts/dev-server.js is intentionally a
// minimal static server and does not emulate Netlify _redirects. Redirect routes
// are already verified separately by audit-interactive-controls.js.
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
    test.setTimeout(45000);
    const runtimeErrors = [];
    page.on('pageerror', err => runtimeErrors.push(String(err && err.message || err)));
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

    // The generic control test must not invent API schemas. Serverless calls are
    // aborted; endpoint-specific behavior is covered by the dedicated E2E suites.
    await page.route('**/.netlify/functions/**', route => route.abort('blockedbyclient'));

    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response, `sin respuesta para ${path}`).not.toBeNull();
    expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);

    const controls = page.locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');
    const count = await controls.count();
    expect(count, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

    // Exercise only controls that are visible in the initial stable surface.
    // A click that navigates/reloads ends this page iteration cleanly; dedicated
    // flow tests validate the destination and state transitions.
    for (let i = 0; i < count; i++) {
      if (page.isClosed()) break;
      const control = controls.nth(i);
      if (!(await control.isVisible().catch(() => false))) continue;
      const safe = await control.evaluate(isSafeControl).catch(() => false);
      if (!safe) continue;
      const beforeUrl = page.url();
      await control.scrollIntoViewIfNeeded().catch(() => {});
      await control.click({ timeout: 800, noWaitAfter: true }).catch(() => {});
      if (page.isClosed() || page.url() !== beforeUrl) break;
      await page.waitForTimeout(5);
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
