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

test('admin center: login interno no persiste JWT en localStorage',async({page})=>{
 let exchanged=false;
 await page.route('**/.netlify/functions/staff-login',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'1',name:'Admin',email:'admin@nutretium.com',role:'admin',token:'secret-jwt',mfa:true}})}));
 await page.route('**/.netlify/functions/admin-session',route=>{exchanged=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})})});
 await page.route('**/.netlify/functions/admin-governance',route=>exchanged?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({actor:{email:'admin@nutretium.com',role:'admin'},security:{staffMfaRequired:true,mfaConfigured:true,audit:{valid:true,checked:1}},backups:[],tpvsol:{status:'NO VALIDADO',message:'Sin sincronización validada'}})}):route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'La sesión ha caducado. Vuelve a entrar.'})}));
 await page.goto(BASE+'/admin-center.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#login')).toBeVisible();
 await page.locator('#email').fill('admin@nutretium.com');
 await page.locator('#password').fill('Password123!');
 await page.locator('#mfaCode').fill('123456');
 await page.locator('#loginForm button').click();
 await expect(page.locator('#app')).toBeVisible();
 const stored=await page.evaluate(()=>({keys:Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))}));
 expect(stored.keys).not.toContain('nutretium_user');
});

test('home: controles con role=button responden a teclado',async({page})=>{
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 const trigger=page.locator('[role="button"][tabindex="0"]').first();
 if(await trigger.count()){
  await trigger.evaluate(el=>{window.__ntKeyboardClicks=0;el.addEventListener('click',()=>window.__ntKeyboardClicks++,{once:true})});
  await trigger.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(()=>window.__ntKeyboardClicks)).toBe(1);
 }
});
