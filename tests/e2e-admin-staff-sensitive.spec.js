const{test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';

async function bootAdmin(page){
 const csrf='e2e-staff-csrf';let exchanged=false;const mutations=[];
 await page.addInitScript(()=>localStorage.setItem('nutretium_user',JSON.stringify({token:'http-only-cookie'})));
 await page.route('**/.netlify/functions/admin-session',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,email:'owner@nutretium.test',role:'owner',csrf,expiresAt:Math.floor(Date.now()/1000)+1800})});
  if(body.action==='exchange'){exchanged=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,email:'owner@nutretium.test',role:'owner',csrf,expiresIn:1800})});}
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.route('**/.netlify/functions/admin-governance',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='overview')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({actor:{email:'owner@nutretium.test',role:'owner'},security:{mfaExempt:false,mfaConfigured:true,staffMfaMode:'required-privileged',audit:{valid:true,checked:1}},backups:[],tpvsol:{status:'NOT_VALIDATED',message:'test'}})});
  if(body.action==='staff-list')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{name:'Owner Test',email:'owner@nutretium.test',role:'owner',active:true,permissions:[],accountExists:true,mfaEnabled:true,mfaConfigured:true},{name:'Manager Test',email:'manager@nutretium.test',role:'manager',active:true,permissions:[],accountExists:true,mfaEnabled:true,mfaConfigured:true}],permissionCatalog:{manager:[]},mfaMode:'required-privileged',privilegedRolesExempt:false})});
  mutations.push({body,csrf:route.request().headers()['x-nutretium-csrf']||''});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body.action==='staff-mfa-regenerate'||body.action==='staff-mfa-enable'?{ok:true,email:body.email,mfa:{enabled:true,setupSecret:'ABCDEF234567',provisioningUri:'otpauth://totp/Nutretium:test?secret=ABCDEF234567'}}:{ok:true,email:body.email})});
 });
 await page.goto(BASE+'/admin-center.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#app')).toBeVisible();
 await page.locator('.tabs button[data-tab="team"]').click();
 await expect(page.locator('#staffRows')).toContainText('manager@nutretium.test');
 return{csrf,mutations,exchanged:()=>exchanged};
}

test('admin staff: acciones bloqueadas por backend no se ofrecen en la UI',async({page})=>{
 await bootAdmin(page);
 await expect(page.locator('[data-remove="owner@nutretium.test"]')).toHaveCount(0);
 await expect(page.locator('[data-revoke-sessions="owner@nutretium.test"]')).toHaveCount(0);
 await expect(page.locator('[data-mfa-off="owner@nutretium.test"]')).toHaveCount(0);
 await expect(page.locator('[data-mfa-off="manager@nutretium.test"]')).toHaveCount(1);
});

test('admin staff: cancelar quitar acceso evita toda mutación',async({page})=>{
 const state=await bootAdmin(page);
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('[data-remove="manager@nutretium.test"]').click();
 await page.waitForTimeout(100);
 expect(state.mutations.length).toBe(0);
});

test('admin staff: confirmar quitar acceso envía una sola mutación con CSRF',async({page})=>{
 const state=await bootAdmin(page);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-remove="manager@nutretium.test"]').click();
 await expect.poll(()=>state.mutations.length).toBe(1);
 expect(state.mutations[0].body.action).toBe('staff-remove');
 expect(state.mutations[0].body.email).toBe('manager@nutretium.test');
 expect(state.mutations[0].csrf).toBe(state.csrf);
});

test('admin sesiones: solo permite cerrar sesiones ajenas y cancelar no muta',async({page})=>{
 const state=await bootAdmin(page);
 await expect(page.locator('[data-revoke-sessions="owner@nutretium.test"]')).toHaveCount(0);
 await expect(page.locator('[data-revoke-sessions="manager@nutretium.test"]')).toHaveCount(1);
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('[data-revoke-sessions="manager@nutretium.test"]').click();
 await page.waitForTimeout(100);
 expect(state.mutations.length).toBe(0);
});

test('admin sesiones: confirmar revocación envía una sola mutación con CSRF',async({page})=>{
 const state=await bootAdmin(page);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-revoke-sessions="manager@nutretium.test"]').click();
 await expect.poll(()=>state.mutations.length).toBe(1);
 expect(state.mutations[0].body.action).toBe('staff-revoke-sessions');
 expect(state.mutations[0].body.email).toBe('manager@nutretium.test');
 expect(state.mutations[0].csrf).toBe(state.csrf);
});

test('admin MFA: cancelar regeneración evita mutación; confirmar usa CSRF',async({page})=>{
 const state=await bootAdmin(page);
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('[data-mfa-regen="manager@nutretium.test"]').click();
 await page.waitForTimeout(100);
 expect(state.mutations.length).toBe(0);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-mfa-regen="manager@nutretium.test"]').click();
 await expect.poll(()=>state.mutations.length).toBe(1);
 expect(state.mutations[0].body.action).toBe('staff-mfa-regenerate');
 expect(state.mutations[0].body.email).toBe('manager@nutretium.test');
 expect(state.mutations[0].csrf).toBe(state.csrf);
 await expect(page.locator('#mfaProvisionCard')).not.toHaveClass(/hidden/);
});

test('admin MFA: cancelar desactivación evita mutación; confirmar usa CSRF',async({page})=>{
 const state=await bootAdmin(page);
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('[data-mfa-off="manager@nutretium.test"]').click();
 await page.waitForTimeout(100);
 expect(state.mutations.length).toBe(0);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-mfa-off="manager@nutretium.test"]').click();
 await expect.poll(()=>state.mutations.length).toBe(1);
 expect(state.mutations[0].body.action).toBe('staff-mfa-disable');
 expect(state.mutations[0].body.email).toBe('manager@nutretium.test');
 expect(state.mutations[0].csrf).toBe(state.csrf);
});
