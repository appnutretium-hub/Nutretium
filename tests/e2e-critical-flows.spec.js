const{test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';

test('checkout: sesión cliente caducada cambia a invitado sin perder carrito',async({page})=>{
 await page.route('**/.netlify/functions/checkout',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Completa tus datos para comprar como invitado.',motivo:'guest-required'})}));
 await page.goto(BASE+'/checkout.html',{waitUntil:'domcontentloaded'});
 const productId=await page.evaluate(()=>{const p=(window.NUTRETIUM_PRODUCTS||[]).find(x=>x&&x.active!==false&&x.stock!==0);return p&&p.id});
 expect(Number(productId)).toBeGreaterThan(0);
 await page.evaluate(id=>{localStorage.setItem('nutretium_cart_v1',JSON.stringify([{id,quantity:1}]));localStorage.setItem('nutretium_user',JSON.stringify({token:'expired-token'}))},productId);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#guestFields')).toHaveClass(/hidden/);
 await page.locator('#pay').click();
 await expect(page.locator('#guestFields')).not.toHaveClass(/hidden/);
 await expect(page.locator('#modeText')).toContainText('sesión ha caducado');
 expect(await page.evaluate(()=>localStorage.getItem('nutretium_user'))).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutretium_cart_v1')||'[]').length)).toBeGreaterThan(0);
});

test('mi cuenta: historial de consentimientos se renderiza y controles quedan funcionales',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('nutretium_user',JSON.stringify({token:'client-token'})));
 await page.route('**/.netlify/functions/customer-commerce',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='overview')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({orders:[],returns:[],tickets:[],subscriptions:[],savedCarts:[],privacyRequests:[],loyalty:null,reviews:[],referrals:[],consents:[{purpose:'analytics',status:'granted',changedAt:'2026-09-20T00:00:00.000Z'}]})});
  if(body.action==='consent-set')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({record:{purpose:body.purpose,status:body.granted?'granted':'withdrawn'}})});
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.goto(BASE+'/cuenta.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#app')).toBeVisible();
 await expect(page.locator('#consents')).toContainText('analytics');
 await expect(page.locator('#consents')).toContainText('granted');
 await expect(page.locator('#consentAnalytics')).toBeChecked();
});

test('admin center: admin exento de MFA usa sesión HttpOnly + CSRF y no persiste sesión en localStorage',async({page})=>{
 let exchanged=false;
 let csrfObserved=false;
 const csrf='e2e-zero-trust-csrf';
 await page.route('**/.netlify/functions/staff-login',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'1',name:'Admin',email:'admin@nutretium.com',role:'admin',token:'secret-jwt',mfa:false,mfaRequired:false,mfaExempt:true}})}));
 await page.route('**/.netlify/functions/admin-session',async route=>{
  const body=JSON.parse(route.request().postData()||'{}');
  if(body.action==='exchange'){
   exchanged=true;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,email:'admin@nutretium.com',role:'admin',csrf,expiresIn:1800})});
  }
  if(body.action==='status'){
   return route.fulfill({status:exchanged?200:401,contentType:'application/json',body:JSON.stringify(exchanged?{ok:true,email:'admin@nutretium.com',role:'admin',csrf,expiresAt:Math.floor(Date.now()/1000)+1800}:{error:'Sesión interna no válida o caducada.'})});
  }
  if(body.action==='logout'){
   exchanged=false;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});
  }
  return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Acción no reconocida.'})});
 });
 await page.route('**/.netlify/functions/admin-governance',route=>{
  if(!exchanged)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'La sesión ha caducado. Vuelve a entrar.'})});
  csrfObserved=route.request().headers()['x-nutretium-csrf']===csrf;
  if(!csrfObserved)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'CSRF inválido'})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({actor:{email:'admin@nutretium.com',role:'admin'},security:{mfaExempt:true,staffMfaMode:'per-user',audit:{valid:true,checked:1}},backups:[],tpvsol:{status:'NO VALIDADO',message:'Sin sincronización validada'}})});
 });
 await page.goto(BASE+'/admin-center.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#login')).toBeVisible();
 await expect(page.locator('#mfaWrap')).toHaveClass(/hidden/);
 await page.locator('#email').fill('admin@nutretium.com');
 await page.locator('#password').fill('Password123!');
 await page.locator('#loginForm button').click();
 await expect(page.locator('#app')).toBeVisible();
 expect(csrfObserved).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('nutretium_user'))).toBeNull();
});

test('home: controles con role=button responden a teclado',async({page})=>{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 const trigger=page.locator('[role="button"][tabindex="0"]:visible').first();
 if(await trigger.count()){
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.evaluate(el=>{window.__ntKeyboardClicks=0;el.addEventListener('click',()=>window.__ntKeyboardClicks++,{once:true})});
  await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>window.__ntKeyboardClicks)).toBe(1);
 }
});
