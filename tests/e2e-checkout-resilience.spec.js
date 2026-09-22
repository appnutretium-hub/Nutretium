const{test,expect}=require('@playwright/test');
const BASE=process.env.E2E_BASE_URL||'http://127.0.0.1:4173';

async function prepareGuestCheckout(page){
 await page.goto(BASE+'/checkout.html',{waitUntil:'domcontentloaded'});
 const productId=await page.evaluate(()=>{const p=(window.NUTRETIUM_PRODUCTS||[]).find(x=>x&&x.active!==false&&x.stock!==0);return p&&p.id});
 expect(Number(productId)).toBeGreaterThan(0);
 await page.evaluate(id=>localStorage.setItem('nutretium_cart_v1',JSON.stringify([{id,quantity:1}])),productId);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#name').fill('Cliente');
 await page.locator('#email').fill('cliente@example.com');
 await page.locator('#calle').fill('Calle Prueba 1');
 await page.locator('#cp').fill('39001');
 await page.locator('#localidad').fill('Santander');
 await page.locator('#provincia').fill('Cantabria');
}

test('checkout: no llama al servidor si no se aceptan las condiciones',async({page})=>{
 let calls=0;
 await page.route('**/.netlify/functions/checkout',route=>{calls++;return route.fulfill({status:500,contentType:'application/json',body:'{}'})});
 await prepareGuestCheckout(page);
 await page.locator('#pay').click();
 await expect(page.locator('#error')).toContainText('Debes aceptar las condiciones');
 expect(calls).toBe(0);
});

test('checkout: doble clic genera una sola petición y un fallo 503 no pierde el carrito',async({page})=>{
 let calls=0;
 await page.route('**/.netlify/functions/checkout',async route=>{
  calls++;
  await new Promise(resolve=>setTimeout(resolve,250));
  return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Servicio de pago temporalmente no disponible.'})});
 });
 await prepareGuestCheckout(page);
 await page.locator('#checkoutTerms').check();
 await page.evaluate(()=>{document.querySelector('#pay').click();document.querySelector('#pay').click()});
 await expect(page.locator('#pay')).toBeDisabled();
 await expect(page.locator('#error')).toContainText('temporalmente no disponible');
 await expect(page.locator('#pay')).toBeEnabled();
 expect(calls).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutretium_cart_v1')||'[]').length)).toBe(1);
});

test('checkout: cupón rechazado no altera el total ni queda aplicado',async({page})=>{
 await page.route('**/.netlify/functions/commerce',route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({reason:'minimum'})}));
 await prepareGuestCheckout(page);
 const before=await page.locator('#total').textContent();
 await page.locator('#coupon').fill('NO-VALIDO');
 await page.locator('#applyCoupon').click();
 await expect(page.locator('#couponMsg')).toContainText('No alcanzas el mínimo');
 await expect(page.locator('#discountRow')).toHaveClass(/hidden/);
 await expect(page.locator('#total')).toHaveText(before);
});
