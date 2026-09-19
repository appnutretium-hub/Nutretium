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
  const directAdd=page.locator('#productGrid .product-card .add-to-cart-btn[onclick*="addToCart"]:not([disabled])').first();
  if(await directAdd.count()){await directAdd.click();await page.waitForTimeout(300);const count=await page.evaluate(()=>{try{const raw=localStorage.getItem('nutretium_cart_v1');if(raw)return JSON.parse(raw).length;return typeof cart!=='undefined'&&cart?.size?cart.size:0}catch{return 0}});expect(count).toBeGreaterThan(0)}
  expect(errors).toEqual([]);
 });
}
test('navegación de páginas críticas responde',async({page})=>{for(const p of ['/cuenta.html','/checkout.html','/backoffice.html','/settings.html','/pedido.html','/ayuda.html','/aprende.html','/comparar.html']){const r=await page.goto(BASE+p,{waitUntil:'domcontentloaded'});expect(r.status()).toBe(200);expect(await page.title()).not.toBe('')}});