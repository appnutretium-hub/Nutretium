const{test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';

test('admin center: restauración exige confirmación exacta antes de ejecutar',async({page})=>{
 const csrf='e2e-admin-csrf';
 let restoreCalls=0;
 let executionCalls=0;
 await page.route('**/.netlify/functions/admin-session',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,email:'owner@nutretium.test',role:'owner',csrf,expiresAt:Math.floor(Date.now()/1000)+1800})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
 });
 await page.route('**/.netlify/functions/admin-governance',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  expect(route.request().headers()['x-nutretium-csrf']).toBe(csrf);
  if(body.action==='overview')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({actor:{email:'owner@nutretium.test',role:'owner'},security:{mfaExempt:false,audit:{valid:true,checked:4}},backups:[{key:'daily/2026-09-22'}],tpvsol:{status:'NO VALIDADO',message:'Sin sincronización validada'}})});
  if(body.action==='backup-list')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({backups:[{key:'daily/2026-09-22'}]})});
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.route('**/.netlify/functions/platform-restore',async route=>{
  restoreCalls++;
  expect(route.request().headers()['x-nutretium-csrf']).toBe(csrf);
  const body=JSON.parse(route.request().postData()||'{}');
  if(!body.confirm)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({dryRun:true,plan:{records:12,domains:{orders:8,inventory:4}},requiredConfirmation:'RESTORE:daily/2026-09-22'})});
  executionCalls++;
  expect(body.confirm).toBe('RESTORE:daily/2026-09-22');
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,restored:12,key:body.key,safetyBackup:'pre-restore/e2e'})});
 });
 await page.goto(BASE+'/admin-center.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#app')).toBeVisible();
 await page.locator('button[data-tab="backups"]').click();
 await expect(page.locator('#backupRows')).toContainText('2026-09-22');
 await page.locator('[data-restore="daily/2026-09-22"]').click();
 await expect(page.locator('#restoreBox')).not.toHaveClass(/hidden/);
 expect(restoreCalls).toBe(1);
 await page.locator('#restoreConfirm').fill('RESTORE:daily/2026-09-21');
 await page.locator('#executeRestore').click();
 await expect(page.locator('#restoreStatus')).toContainText('no coincide exactamente');
 expect(executionCalls).toBe(0);
 expect(restoreCalls).toBe(1);
 await page.locator('#restoreConfirm').fill('RESTORE:daily/2026-09-22');
 await page.locator('#executeRestore').click();
 await expect(page.locator('#restoreStatus')).toContainText('Restauración completada: 12 registros');
 expect(executionCalls).toBe(1);
 expect(restoreCalls).toBe(2);
});
