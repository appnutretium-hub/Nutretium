const {test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
async function collectErrors(page){const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));return errors}
for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]){
 test(`${device.name}: catálogo, SKU, carrito y layout`,async({page})=>{
  await page.setViewportSize({width:device.width,height:device.height});const errors=await collectErrors(page);
  await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForSelector('#productGrid .product-card',{timeout:15000});await page.waitForTimeout(900);
  const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,cards:document.querySelectorAll('#productGrid .product-card').length}));
  expect(metrics.cards).toBeGreaterThan(0);expect(metrics.scroll-metrics.client).toBeLessThanOrEqual(4);
  const first=page.locator('#productGrid .product-card').first();await expect(first).toBeVisible();
  const id=await first.getAttribute('data-product-id');expect(Number(id)).toBeGreaterThan(0);
  const detail=first.locator('.nt-product-detail-link');if(await detail.count())expect(await detail.getAttribute('href')).toMatch(/\/producto\/.+-\d+$/);
  const add=first.locator('.add-to-cart-btn:not([disabled])');if(await add.count()){await add.click();await page.waitForTimeout(250);const saved=await page.evaluate(()=>localStorage.getItem('nutretium_cart_v1'));expect(saved).toBeTruthy();}
  expect(errors).toEqual([]);
 });
}
test('navegación de cuenta y páginas críticas responde',async({page})=>{for(const p of ['/cuenta.html','/checkout.html','/backoffice.html','/ayuda.html','/aprende.html','/comparar.html']){const r=await page.goto(BASE+p,{waitUntil:'domcontentloaded'});expect(r.status()).toBe(200);expect(await page.title()).not.toBe('')}});