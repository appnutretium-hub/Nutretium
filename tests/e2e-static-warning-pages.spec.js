const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const PAGES = ['/backoffice.html', '/customer-center.html', '/ops.html', '/recomendador.html'];
const CONTROL_SELECTOR = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])';

function signature(item) {
  for (const [key, value] of [
    ['testid', item.testid],
    ['id', item.id],
    ['action', item.action],
    ['name', item.name],
    ['aria', item.aria]
  ]) {
    if (value) return `${item.tag}|${item.type}|${key}=${value}`;
  }
  return `${item.tag}|${item.type}|role=${item.role}|text=${item.text}`;
}

function isSafeControl(el) {
  if (!el || el.disabled) return false;
  const text = `${el.id || ''} ${el.name || ''} ${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`.toLowerCase();
  return !/(delete|eliminar|borrar|remove|refund|reembolso|logout|cerrar sesi|restaurar|restore|pagar|comprar|confirmar pedido|salir)/.test(text);
}

async function snapshot(page) {
  const raw = await page.locator(CONTROL_SELECTOR).evaluateAll(elements => elements.map(el => ({
    tag: String(el.tagName || '').toLowerCase(),
    id: String(el.id || '').trim(),
    testid: String(el.getAttribute('data-testid') || '').trim(),
    action: String(el.getAttribute('data-action') || '').trim(),
    name: String(el.getAttribute('name') || '').trim(),
    aria: String(el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
    role: String(el.getAttribute('role') || '').trim(),
    type: String(el.getAttribute('type') || '').trim(),
    text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240)
  })));

  const occurrences = new Map();
  return raw.map(item => {
    const sig = signature(item);
    const occurrence = occurrences.get(sig) || 0;
    occurrences.set(sig, occurrence + 1);
    return { ...item, sig, occurrence };
  });
}

async function locateIndex(page, target) {
  const current = await snapshot(page);
  let seen = 0;
  for (let index = 0; index < current.length; index++) {
    if (current[index].sig !== target.sig) continue;
    if (seen === target.occurrence) return index;
    seen += 1;
  }
  return -1;
}

for (const path of PAGES) {
  test(`runtime controls flagged by static audit: ${path}`, async ({ page }) => {
    test.setTimeout(120000);
    const runtimeErrors = [];

    page.on('pageerror', error => {
      const message = String(error && error.message || error);
      if (/failed to fetch|networkerror|load failed/i.test(message)) return;
      runtimeErrors.push(message);
    });
    page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
    await page.addInitScript(() => {
      try { localStorage.clear(); } catch (_) {}
      try { sessionStorage.clear(); } catch (_) {}
    });
    await page.route('**/.netlify/functions/**', route => {
      if (path === '/ops.html') {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Acceso no autorizado.' })
        });
      }
      return route.abort('blockedbyclient');
    });

    const initial = await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    expect(initial, `sin respuesta para ${path}`).not.toBeNull();
    expect(initial.status(), `HTTP inválido en ${path}`).toBeLessThan(400);
    await page.waitForTimeout(100);

    if (path === '/ops.html') {
      await expect(page.locator('#login'), 'ops debe mostrar login ante 401').toBeVisible();
      await expect(page.locator('#app'), 'ops no debe exponer panel sin autenticar').toBeHidden();
    }

    const baseline = await snapshot(page);
    expect(baseline.length, `${path} debe exponer controles interactivos`).toBeGreaterThan(0);

    let exercised = 0;
    for (const target of baseline) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(100);
      const index = await locateIndex(page, target);
      expect(index, `control desaparecido en ${path}: ${target.sig}`).toBeGreaterThanOrEqual(0);

      const control = page.locator(CONTROL_SELECTOR).nth(index);
      if (!(await control.isVisible().catch(() => false))) continue;
      if (!(await control.evaluate(isSafeControl).catch(() => false))) continue;

      const before = runtimeErrors.length;
      if (path === '/ops.html' && target.text.toLowerCase().includes('entrar')) {
        await page.locator('#email').fill('qa@example.invalid');
        await page.locator('#password').fill('invalid-password-for-e2e');
        await control.click();
        await expect(page.locator('#loginError')).toContainText('Acceso no autorizado.');
        await expect(page.locator('#app')).toBeHidden();
      } else {
        await control.dispatchEvent('click');
      }
      await page.waitForTimeout(75);
      expect(
        runtimeErrors.slice(before),
        `errores JS en ${path} al accionar ${target.sig}: ${runtimeErrors.slice(before).join(' | ')}`
      ).toEqual([]);
      exercised += 1;
    }

    expect(exercised, `${path} no ejercitó ningún control seguro`).toBeGreaterThan(0);
    expect(runtimeErrors, `errores JS acumulados en ${path}: ${runtimeErrors.join(' | ')}`).toEqual([]);
  });
}
