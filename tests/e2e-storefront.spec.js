const {test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
async function collectErrors(page){const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));return errors}
for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]){
 test(`${device.name}: catálogo, SKU, carrito y layout`,async({page})=>{
  await page.setViewportSize({width:device.width,height:device.height});await page.emulateMedia({reducedMotion:'reduce'});const errors=await collectErrors(page);
  await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForSelector('#productGrid .product-card',{timeout:15000});await page.waitForTimeout(900);
  const metrics=await page.evaluate(()=>{
    const viewport=window.innerWidth;
    const isIntentionalScroller=el=>{let n=el;while(n&&n!==document.body){const s=getComputedStyle(n);if((s.overflowX==='auto'||s.overflowX==='scroll')&&n.scrollWidth>n.clientWidth+4)return true;n=n.parentElement}return false};
    const offenders=[...document.querySelectorAll('body *')].filter(el=>!isIntentionalScroller(el)).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id||'',cls:String(el.className||'').slice(0,120),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}}).filter(x=>x.right>viewport+4||x.left<-4).slice(0,12);
    const before=window.scrollX;window.scrollTo({left:10000,top:window.scrollY,behavior:'instant'});const pageScrollX=window.scrollX;window.scrollTo({left:before,top:window.scrollY,behavior:'instant'});
    return{scrollWidth:document.documentElement.scrollWidth,viewport,pageScrollX,cards:document.querySelectorAll('#productGrid .product-card').length,offenders};
  });
  expect(metrics.cards).toBeGreaterThan(0);
  expect(metrics.pageScrollX,`La página permite scroll horizontal: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(4);
  const first=page.locator('#productGrid .product-card').first();await expect(first).toBeVisible();
  const id=await first.getAttribute('data-product-id');expect(Number(id)).toBeGreaterThan(0);
  const detail=first.locator('.nt-product-detail-link');if(await detail.count())expect(await detail.getAttribute('href')).toMatch(/\/producto\/.+-\d+$/);
  const directAdd=page.locator('#productGrid .product-card .add-to-cart-btn[onclick*="addToCart"]:not([disabled])').first();
  if(await directAdd.count()){
    await directAdd.evaluate(el=>el.scrollIntoView({block:'center',inline:'center',behavior:'instant'}));await page.waitForTimeout(150);
    const point=await directAdd.evaluate(el=>{
      const r=el.getBoundingClientRect();
      const xs=[.12,.35,.5,.65,.88],ys=[.25,.5,.75];
      for(const fy of ys)for(const fx of xs){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(x<1||y<1||x>=innerWidth-1||y>=innerHeight-1)continue;const hit=document.elementFromPoint(x,y);if(hit&&(hit===el||el.contains(hit)))return{x,y}}
      return null;
    });
    expect(point,'El CTA de añadir está totalmente cubierto por elementos fijos').toBeTruthy();
    await page.mouse.click(point.x,point.y);await page.waitForTimeout(300);
    const count=await page.evaluate(()=>{try{const raw=localStorage.getItem('nutretium_cart_v1');if(raw)return JSON.parse(raw).length;return typeof cart!=='undefined'&&cart?.size?cart.size:0}catch{return 0}});expect(count).toBeGreaterThan(0)
  }
  expect(errors).toEqual([]);
 });
}
test('navegación de páginas críticas responde',async({page})=>{for(const p of ['/cuenta.html','/checkout.html','/backoffice.html','/settings.html','/pedido.html','/ayuda.html','/aprende.html','/comparar.html']){const r=await page.goto(BASE+p,{waitUntil:'domcontentloaded'});expect(r.status()).toBe(200);expect(await page.title()).not.toBe('')}});