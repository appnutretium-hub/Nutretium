const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

// Runtime coverage for the UI surfaces that the static auditor cannot prove.
// The test intentionally does not require real third-party credentials: network
// mutations are intercepted, while browser wiring, handlers, forms, navigation
// and JS runtime integrity are exercised in Chromium.
const pages = [
  '/', '/checkout.html', '/cuenta.html', '/admin-center.html', '/admin.html',
  '/catalogo.html', '/enterprise.html', '/finanzas-admin.html', '/mi-nutretium.html',
  '/smart-shop.html'
];

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido)/.test(text);
}

for (const path of pages) {
  test(`controles interactivos sin errores de runtime: ${path}`, async ({ page }) => {
    const runtimeErrors = [];
    page.on('pageerror', err => runtimeErrors.push(String(err && err.message || err)));
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));

    // No E2E may mutate production/external systems. We return deterministic
    // responses for serverless writes while allowing static assets to load.
    await page.route('**/.netlify/functions/**', async route => {
      const req = route.request();
      if (req.method() === 'GET') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, e2e: true }) });
    });

    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response, `sin respuesta para ${path}`).not.toBeNull();
    expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);

    const controls = page.locator('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');
    const count = await controls.count();
    expect(count, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      if (!(await control.isVisible().catch(() => false))) continue;
      const safe = await control.evaluate(isSafeControl).catch(() => false);
      if (!safe) continue;

      // Record whether the control can receive an actual browser click. A
      // detached/re-rendered control is retried through the fresh locator.
      await control.scrollIntoViewIfNeeded().catch(() => {});
      await control.click({ timeout: 1500 }).catch(async () => {
        const fresh = controls.nth(i);
        if (await fresh.isVisible().catch(() => false)) await fresh.dispatchEvent('click').catch(() => {});
      });
      await page.waitForTimeout(15);
    }

    expect(runtimeErrors, `errores JS al accionar controles de ${path}: ${runtimeErrors.join(' | ')}`).toEqual([]);
  });
}

test('formularios y enlaces locales no contienen acciones vacías o javascript pseudo-links', async ({ page }) => {
  for (const path of pages) {
    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBeLessThan(400);
    const invalid = await page.locator('a[href="javascript:void(0)"], a[href="javascript:;"], form[action="javascript:void(0)"], form[action="javascript:;"]').count();
    expect(invalid, `pseudo-acciones inválidas en ${path}`).toBe(0);
  }
});
