'use strict';
const {test,expect}=require('@playwright/test');

test('Guardian detecta un botón sin resultado observable',async({page})=>{
 const incidents=[];
 await page.route('**/.netlify/functions/client-error',async route=>{
  try{incidents.push(JSON.parse(route.request().postData()||'{}'))}catch{}
  await route.fulfill({status:204,body:''});
 });
 await page.goto('http://127.0.0.1:4173/');
 await page.waitForFunction(()=>Boolean([...document.scripts].find(s=>String(s.src).includes('guardian-runtime.js'))));
 await page.evaluate(()=>{
  const b=document.createElement('button');
  b.type='button';
  b.id='guardian-dead-button-test';
  b.textContent='Botón sin acción';
  b.dataset.guardianAction='guardian-dead-button-test';
  b.dataset.guardianTimeout='100';
  // Keep the synthetic probe physically actionable even when production UI
  // overlays (for example the cookie banner) are visible. The test must verify
  // a real browser pointer click reaching Guardian, not bypass actionability.
  Object.assign(b.style,{
   position:'fixed',
   top:'16px',
   left:'16px',
   zIndex:'2147483647',
   width:'180px',
   height:'44px',
   opacity:'1',
   pointerEvents:'auto'
  });
  document.body.appendChild(b);
 });
 const probe=page.locator('#guardian-dead-button-test');
 await expect(probe).toBeVisible();
 await probe.click({timeout:3000});
 await expect.poll(()=>incidents.some(x=>x.kind==='functional_failure'&&x.actionId==='guardian-dead-button-test'),{timeout:3000}).toBe(true);
});

test('Guardian reintenta una vez un GET local con 5xx',async({page})=>{
 let hits=0;
 await page.route('**/.netlify/functions/client-error',route=>route.fulfill({status:204,body:''}));
 await page.route('**/guardian-retry-probe',async route=>{
  hits++;
  if(hits===1)return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
  return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
 });
 await page.goto('http://127.0.0.1:4173/');
 const result=await page.evaluate(async()=>{const r=await fetch('/guardian-retry-probe');return{status:r.status,body:await r.json()}});
 expect(result.status).toBe(200);
 expect(result.body.ok).toBe(true);
 expect(hits).toBe(2);
});
