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
const selector = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
}

async function preparePage(page, path, runtimeErrors) {
  page.on('pageerror', err => {
    const message = String(err && err.message || err);
    if (/failed to fetch|networkerror|load failed/i.test(message)) return;
    runtimeErrors.push(message);
  });
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  await page.route('**/.netlify/functions/**', route => route.abort('blockedbyclient'));
  const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  expect(response, `sin respuesta para ${path}`).not.toBeNull();
  expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
}

async function waitForControlSurface(page) {
  // The storefront hydrates product/action controls asynchronously. Certification
  // must start from a settled surface instead of assuming the DOM count at
  // domcontentloaded is immutable.
  let previous = -1;
  let stableRounds = 0;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const count = await page.locator(selector).count();
    if (count === previous) stableRounds += 1;
    else stableRounds = 0;
    if (stableRounds >= 2) return count;
    previous = count;
    await page.waitForTimeout(150);
  }
  return page.locator(selector).count();
}

async function snapshotControls(page) {
  return page.locator(selector).evaluateAll(elements => elements.map((el, index) => ({
    index,
    id: el.id || '',
    name: el.getAttribute('name') || '',
    aria: el.getAttribute('aria-label') || '',
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '',
    value: el.getAttribute('value') || '',
    className: typeof el.className === 'string' ? el.className : '',
    safe: !el.disabled && !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/i.test(`${el.id || ''} ${el.getAttribute('name') || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`)
  })));
}

async function locateSnapshot(page, target) {
  // Prefer explicit stable identities. Fall back to a semantic signature and
  // finally the original position only when the same settled surface still
  // contains that position. This avoids treating legitimate async hydration as
  // a functional regression while still failing when a captured control vanishes.
  if (target.id) {
    const byId = page.locator(`[id=${JSON.stringify(target.id)}]`).first();
    if (await byId.count()) return byId;
  }
  if (target.name) {
    const byName = page.locator(`${target.tag}[name=${JSON.stringify(target.name)}]`);
    if (await byName.count() === 1) return byName.first();
  }
  if (target.aria) {
    const byAria = page.locator(`${target.tag}[aria-label=${JSON.stringify(target.aria)}]`);
    if (await byAria.count() === 1) return byAria.first();
  }

  const candidates = page.locator(selector);
  const matched = await candidates.evaluateAll((elements, t) => elements.map((el, index) => ({
    index,
    score:
      ((el.tagName.toLowerCase() === t.tag) ? 2 : 0) +
      (((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) === t.text) ? 4 : 0) +
      (((el.getAttribute('type') || '') === t.type) ? 1 : 0) +
      (((el.getAttribute('value') || '') === t.value) ? 1 : 0) +
      ((typeof el.className === 'string' && el.className === t.className) ? 2 : 0)
  })).filter(x => x.score >= 8).map(x => x.index), target);

  if (matched.length === 1) return candidates.nth(matched[0]);
  const currentCount = await candidates.count();
  if (target.index < currentCount) return candidates.nth(target.index);
  return null;
}

for (const path of pages) {
  for (let shard = 0; shard < CONTROL_SHARDS; shard++) {
    test(`controles interactivos sin errores de runtime: ${path} [${shard + 1}/${CONTROL_SHARDS}]`, async ({ page }) => {
      test.setTimeout(90000);
      const runtimeErrors = [];
      await preparePage(page, path, runtimeErrors);
      const settledCount = await waitForControlSurface(page);
      expect(settledCount, `la superficie ${path} debe renderizar controles`).toBeGreaterThan(0);
      const captured = await snapshotControls(page);
      const targets = captured.filter((item, index) => index % CONTROL_SHARDS === shard && item.safe);

      for (const target of targets) {
        if (page.isClosed()) throw new Error(`la página se cerró antes de verificar ${path} control #${target.index}`);
        if (page.url() !== BASE + path) await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
        else if (target !== targets[0]) await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForControlSurface(page);

        const control = await locateSnapshot(page, target);
        expect(control, `control capturado desapareció en ${path} #${target.index} (${target.aria || target.id || target.text || target.tag})`).not.toBeNull();
        if (!(await control.isVisible().catch(() => false))) continue;
        const safe = await control.evaluate(isSafeControl).catch(() => false);
        if (!safe) continue;

        const beforeErrors = runtimeErrors.length;
        await control.scrollIntoViewIfNeeded();
        await control.click({ timeout: 2000, noWaitAfter: true });
        await page.waitForTimeout(100);
        expect(runtimeErrors.slice(beforeErrors), `errores JS en ${path} control #${target.index}: ${runtimeErrors.slice(beforeErrors).join(' | ')}`).toEqual([]);
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
