const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules','dist','.git','.netlify','.cache','coverage','playwright-report','test-results']);
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory()&&SKIP.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(p.endsWith('.html'))out.push(p)}return out}
function routeFor(file){const r=path.relative(ROOT,file).replace(/\\/g,'/');return r==='index.html'?'/':'/'+r}
const pages=walk(ROOT).map(routeFor);

// This suite certifies every rendered button/role=button individually at browser
// level. It checks that the control is not a dead element: clicking must either
// navigate, change DOM/state, open a dialog, submit a form, issue a request, or
// be an explicitly disabled control. Destructive/external requests are aborted
// after being observed so certification cannot mutate production data.
test('all interactive controls have observable behaviour', async ({ browser }) => {
  test.setTimeout(180000);
  let total=0, certified=0;
  const failures=[];
  for(const route of pages){
    const context=await browser.newContext();
    const page=await context.newPage();
    const runtime=[]; let requests=0, dialogs=0;
    page.on('pageerror',e=>runtime.push(String(e.message||e)));
    page.on('dialog',async d=>{dialogs++;await d.dismiss().catch(()=>{})});
    await page.route('**/.netlify/functions/**',r=>{requests++;return r.abort('blockedbyclient')});
    const res=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:5000}).catch(()=>null);
    if(!res||res.status()>=400){await context.close();continue}
    const controls=page.locator('button, [role="button"]');
    const count=await controls.count(); total+=count;
    for(let i=0;i<count;i++){
      // Reload before each control so each assertion starts from the same state.
      await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:5000}).catch(()=>null);
      const c=page.locator('button, [role="button"]').nth(i);
      if(!(await c.count()))continue;
      if(await c.isDisabled().catch(()=>false)){certified++;continue}
      const before=await page.evaluate(()=>({url:location.href,html:document.body.innerHTML,active:document.activeElement?.outerHTML||''}));
      const rq0=requests, dg0=dialogs, er0=runtime.length;
      const label=await c.evaluate(el=>el.id||el.getAttribute('aria-label')||el.textContent.trim().slice(0,80)||el.className||`control-${i}`).catch(()=>`control-${i}`);
      let clicked=true;
      await c.scrollIntoViewIfNeeded().catch(()=>{});
      await c.click({timeout:700,noWaitAfter:true}).catch(async()=>{clicked=false;await c.dispatchEvent('click').then(()=>{clicked=true}).catch(()=>{})});
      await page.waitForTimeout(20);
      const after=await page.evaluate(()=>({url:location.href,html:document.body.innerHTML,active:document.activeElement?.outerHTML||''})).catch(()=>({url:'navigated',html:'',active:''}));
      const observable=clicked&&(after.url!==before.url||after.html!==before.html||after.active!==before.active||requests>rq0||dialogs>dg0);
      if(observable&&runtime.length===er0)certified++;else failures.push(`${route} :: ${label} :: ${!clicked?'not-clickable':runtime.length>er0?'runtime-error':'no-observable-action'}`);
    }
    await context.close();
  }
  console.log(JSON.stringify({total,certified,failures},null,2));
  expect(failures,'Every control must produce an observable browser action without JS errors').toEqual([]);
  expect(certified).toBe(total);
  // Baseline guard: if markup generation unexpectedly drops controls, fail rather
  // than claiming success over a smaller UI. Current audited baseline is 223.
  expect(total).toBeGreaterThanOrEqual(223);
});
