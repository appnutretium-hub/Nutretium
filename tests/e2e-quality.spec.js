const{test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';
test('home: accesibilidad esencial y búsqueda usable',async({page})=>{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.waitForSelector('#productGrid .product-card',{timeout:15000});
 const a11y=await page.evaluate(()=>({
  lang:document.documentElement.lang,
  missingAlt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,
  duplicateIds:(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return[...new Set(ids.filter((v,i)=>ids.indexOf(v)!==i))]})(),
  unnamedButtons:[...document.querySelectorAll('button')].filter(b=>!String(b.textContent||'').trim()&&!b.getAttribute('aria-label')&&!b.getAttribute('title')).length,
  main:document.querySelectorAll('main').length
 }));
 expect(a11y.lang).toMatch(/^es/i);expect(a11y.missingAlt).toBe(0);expect(a11y.duplicateIds).toEqual([]);expect(a11y.unnamedButtons).toBe(0);expect(a11y.main).toBeGreaterThan(0);
 const search=page.locator('#searchInput');if(await search.count()){await search.fill('creatina');await page.waitForTimeout(250);const visible=await page.locator('#productGrid .product-card:visible').count();expect(visible).toBeGreaterThan(0)}
});
test('home: presupuesto runtime de recursos',async({page})=>{
 await page.goto(BASE,{waitUntil:'networkidle'});const metrics=await page.evaluate(()=>{const entries=performance.getEntriesByType('resource');const js=entries.filter(e=>/\.js(?:\?|$)/.test(e.name)).reduce((s,e)=>s+(e.transferSize||e.encodedBodySize||0),0),css=entries.filter(e=>/\.css(?:\?|$)/.test(e.name)).reduce((s,e)=>s+(e.transferSize||e.encodedBodySize||0),0);return{js,css,resources:entries.length}});expect(metrics.js).toBeLessThan(2*1024*1024);expect(metrics.css).toBeLessThan(2*1024*1024);expect(metrics.resources).toBeLessThan(250)
});
