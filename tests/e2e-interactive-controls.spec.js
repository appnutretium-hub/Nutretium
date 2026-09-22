const { test, expect } = require('@playwright/test');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

const pages = [
  '/', '/checkout.html', '/cuenta.html', '/admin-center.html', '/admin.html',
  '/enterprise.html', '/financial-dashboard.html', '/smart-shop.html'
];
const selector = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';
const BATCH_SIZE = 10;
const MAX_BATCHES = 80;

function safeText(el) {
  return `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
}
function isSafeControl(el) {
  return !!el && !el.disabled && !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(safeText(el));
}
async function freezeMotion(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' }).catch(() => {});
}
async function preparePage(page, path, runtimeErrors) {
  page.on('pageerror', err => {
    const message = String(err && err.message || err);
    if (!/failed to fetch|networkerror|load failed/i.test(message)) runtimeErrors.push(message);
  });
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  await page.route('**/.netlify/functions/**', route => route.abort('blockedbyclient'));
  const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 10000 });
  expect(response, `sin respuesta para ${path}`).not.toBeNull();
  expect(response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
  await freezeMotion(page);
}
async function waitForControlSurface(page) {
  let previous = -1, stable = 0;
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const count = await page.locator(selector).count();
    stable = count === previous ? stable + 1 : 0;
    if (stable >= 2) return count;
    previous = count;
    await page.waitForTimeout(75);
  }
  return page.locator(selector).count();
}
async function getControlMeta(page, index) {
  const locator = page.locator(selector).nth(index);
  if (!(await locator.count())) return null;
  return locator.evaluate((el, index) => ({
    index, id: el.id || '', name: el.getAttribute('name') || '', aria: el.getAttribute('aria-label') || '',
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180), tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') || '', value: el.getAttribute('value') || '',
    className: typeof el.className === 'string' ? el.className : '',
    safe: !el.disabled && !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/i.test(`${el.id || ''} ${el.getAttribute('name') || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`)
  }), index);
}
async function locateControl(page, target) {
  if (target.id) { const x = page.locator(`[id=${JSON.stringify(target.id)}]`).first(); if (await x.count()) return x; }
  if (target.name) { const x = page.locator(`${target.tag}[name=${JSON.stringify(target.name)}]`); if (await x.count() === 1) return x.first(); }
  if (target.aria) { const x = page.locator(`${target.tag}[aria-label=${JSON.stringify(target.aria)}]`); if (await x.count() === 1) return x.first(); }
  const candidates = page.locator(selector);
  const indexes = await candidates.evaluateAll((els, t) => els.map((el, index) => ({ index, score:
    (el.tagName.toLowerCase() === t.tag ? 2 : 0) +
    ((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) === t.text ? 4 : 0) +
    ((el.getAttribute('type') || '') === t.type ? 1 : 0) + ((el.getAttribute('value') || '') === t.value ? 1 : 0) +
    (typeof el.className === 'string' && el.className === t.className ? 2 : 0)
  })).filter(x => x.score >= 8).map(x => x.index), target);
  if (indexes.length === 1) return candidates.nth(indexes[0]);
  return target.index < await candidates.count() ? candidates.nth(target.index) : null;
}
async function dismissBlockingOverlays(page, target) {
  const patterns = [/aceptar todas|aceptar cookies|aceptar|consentir|entendido|de acuerdo|continuar/i, /rechazar todas|rechazar cookies|rechazar/i, /cerrar|close|ahora no|no gracias/i];
  if (await target.click({ trial: true, timeout: 250 }).then(() => true).catch(() => false)) return;
  for (const pattern of patterns) {
    const group = page.getByRole('button', { name: pattern });
    for (let i = 0, n = await group.count().catch(() => 0); i < n; i++) {
      const button = group.nth(i);
      if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
        if (await button.click({ timeout: 500 }).then(() => true).catch(() => false)) return;
      }
    }
  }
}
async function activateControl(page, control) {
  await freezeMotion(page);
  await control.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await dismissBlockingOverlays(page, control);
  if (await control.click({ timeout: 750, noWaitAfter: true }).then(() => true).catch(() => false)) return;
  await control.evaluate(el => el.click());
}

for (const path of pages) {
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const start = batch * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    test(`controles ${path} [${start}-${end - 1}]`, async ({ browser }) => {
      test.setTimeout(45000);
      const discoveryContext = await browser.newContext();
      const discoveryPage = await discoveryContext.newPage();
      const discoveryErrors = [];
      await preparePage(discoveryPage, path, discoveryErrors);
      const total = await waitForControlSurface(discoveryPage);
      if (start >= total) { await discoveryContext.close(); return; }
      const limit = Math.min(end, total);
      const targets = [];
      for (let index = start; index < limit; index++) targets.push(await getControlMeta(discoveryPage, index));
      expect(discoveryErrors, `errores JS descubriendo ${path}: ${discoveryErrors.join(' | ')}`).toEqual([]);
      await discoveryContext.close();

      for (const target of targets) {
        expect(target, `no se pudo capturar ${path}`).not.toBeNull();
        if (!target.safe) continue;
        const context = await browser.newContext();
        const page = await context.newPage();
        const runtimeErrors = [];
        try {
          await preparePage(page, path, runtimeErrors);
          await waitForControlSurface(page);
          const control = await locateControl(page, target);
          expect(control, `control desaparecido ${path} #${target.index} (${target.aria || target.id || target.text || target.tag})`).not.toBeNull();
          if (!(await control.isVisible().catch(() => false))) continue;
          if (!(await control.evaluate(isSafeControl).catch(() => false))) continue;
          await activateControl(page, control);
          await page.waitForTimeout(25);
          expect(runtimeErrors, `errores JS en ${path} #${target.index}: ${runtimeErrors.join(' | ')}`).toEqual([]);
        } finally {
          await context.close().catch(() => {});
        }
      }
    });
  }
}

for (const path of pages) {
  test(`formularios y enlaces sin pseudo-acciones javascript: ${path}`, async ({ page }) => {
    const response = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(response && response.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
    expect(await page.locator('a[href="javascript:void(0)"], a[href="javascript:;"], form[action="javascript:void(0)"], form[action="javascript:;"]').count(), `pseudo-acciones inválidas en ${path}`).toBe(0);
  });
}
