'use strict';
const $=id=>document.getElementById(id);
const ENDPOINT='/.netlify/functions/admin-factusol';
const LOGIN_ENDPOINT='/.netlify/functions/staff-login';

async function api(method,body){
  const headers={'Content-Type':'application/json'};
  const r=await fetch(ENDPOINT,{method,credentials:'same-origin',headers,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||'No se pudo completar la operación.'),{status:r.status,data:d});
  return d;
}

function statusText(d){
  const v=d.vault||{},r=d.readiness||{};
  return[
    `Bóveda cifrada: ${v.vaultConfigured?'OK':'PENDIENTE'}`,
    `Credenciales: ${v.manufacturerConfigured&&v.clientConfigured&&v.databaseConfigured&&v.passwordConfigured?'OK':'PENDIENTE'}`,
    `Almacén: ${r.warehouseCodesConfigured?(r.warehouseCodes||[]).join(', '):'PENDIENTE'}`,
    `Tarifa: ${r.tariffConfigured?(r.tariffCode||'OK'):'PENDIENTE'}`,
    `Validación checkout: ${r.liveEnabled?'ACTIVA':'DESACTIVADA'}`,
    `Escritura pedidos: ${r.writeEnabled?'ACTIVA':'DESACTIVADA'}`,
    `Estado catálogo live: ${r.liveCatalogReady?'LISTO':'NO LISTO'}`
  ].join('\n');
}

function render(d){
  $('state').textContent=statusText(d);
  $('state').className='status '+(d.readiness?.liveCatalogReady?'ok':'muted');
  $('liveEnabled').checked=Boolean(d.readiness?.liveEnabled);
  $('writeEnabled').checked=Boolean(d.readiness?.writeEnabled);
  if(Array.isArray(d.readiness?.warehouseCodes)&&d.readiness.warehouseCodes.length)$('warehouseCodes').value=d.readiness.warehouseCodes.join(',');
  if(d.readiness?.tariffCode)$('tariffCode').value=d.readiness.tariffCode;
}

function removeLogin(){document.getElementById('factusolAuth')?.remove()}
function showLogin(message='La sesión ha caducado. Vuelve a entrar.'){
  let overlay=document.getElementById('factusolAuth');
  if(overlay){const msg=overlay.querySelector('[data-auth-message]');if(msg)msg.textContent=message;return}
  overlay=document.createElement('div');
  overlay.id='factusolAuth';
  overlay.style.cssText='position:fixed;inset:0;z-index:1000;background:#090909f2;display:grid;place-items:center;padding:20px';
  overlay.innerHTML=`<section style="width:min(410px,100%);background:#111;border:1px solid #3b3217;border-radius:18px;padding:26px;box-shadow:0 24px 80px #000">
    <div class="brand">NUTRETIUM · ACCESO SEGURO</div>
    <h2 style="margin:8px 0">FACTUSOL / TPVSOL</h2>
    <p class="muted">Inicia sesión con tu cuenta interna. No se almacenan credenciales en el navegador.</p>
    <form data-auth-form>
      <label>Correo</label><input data-auth-email type="email" autocomplete="username" required>
      <label>Contraseña</label><input data-auth-password type="password" autocomplete="current-password" required>
      <div data-auth-mfa hidden><label>Código MFA</label><input data-auth-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6 dígitos"></div>
      <div data-auth-message class="bad" style="min-height:22px;margin-top:10px"></div>
      <button type="submit" style="width:100%;margin-top:8px">Entrar</button>
    </form>
  </section>`;
  document.body.appendChild(overlay);
  const form=overlay.querySelector('[data-auth-form]'),email=overlay.querySelector('[data-auth-email]'),password=overlay.querySelector('[data-auth-password]'),mfaWrap=overlay.querySelector('[data-auth-mfa]'),mfa=overlay.querySelector('[data-auth-code]'),msg=overlay.querySelector('[data-auth-message]');
  msg.textContent=message;
  email.value='appnutretium@gmail.com';
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]');button.disabled=true;msg.textContent='Validando acceso…';
    const payload={email:email.value.trim().toLowerCase(),password:password.value};
    if(!mfaWrap.hidden)payload.mfaCode=mfa.value.trim();
    try{
      const response=await fetch(LOGIN_ENDPOINT,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(data.mfaRequired===true){mfaWrap.hidden=false;mfa.required=true;mfa.focus()}
        throw new Error(data.error||'No se pudo iniciar sesión.');
      }
      removeLogin();
      $('state').textContent='Sesión segura iniciada. Cargando FACTUSOL…';$('state').className='status muted';
      await load();
    }catch(error){msg.textContent=error.message||'No se pudo iniciar sesión.'}
    finally{button.disabled=false}
  });
}

async function load(){
  try{removeLogin();render(await api('GET'))}
  catch(e){
    $('state').textContent=e.message;$('state').className='status bad';
    if([401,403].includes(e.status))showLogin(e.message);
  }
}

$('test').onclick=async()=>{try{const d=await api('POST',{action:'test'});render(d);$('message').textContent=`Conexión OK · latencia ${d.health?.latencyMs??'?'} ms`;$('message').className='status ok'}catch(e){$('message').textContent=e.message+(e.data?.detail?`\n${e.data.detail}`:'');$('message').className='status bad';if([401,403].includes(e.status))showLogin(e.message)}};
$('discover').onclick=async()=>{try{const d=await api('POST',{action:'discover'});render(d);const w=(d.warehouses||[]).map(x=>`${x.code} — ${x.name||''}`).join('\n')||'Sin almacenes';const t=(d.tariffs||[]).map(x=>`${x.code} — ${x.name||''}`).join('\n')||'Sin tarifas';$('discovery').textContent=`ALMACENES\n${w}\n\nTARIFAS\n${t}`;$('discovery').className='status'}catch(e){$('discovery').textContent=e.message+(e.data?.detail?`\n${e.data.detail}`:'');$('discovery').className='status bad';if([401,403].includes(e.status))showLogin(e.message)}};
$('save').onclick=async()=>{if(!$('manufacturerCode').value.trim()&&!confirm('El código fabricante está vacío. ¿Continuar usando el valor ya guardado?'))return;const body={action:'save',manufacturerCode:$('manufacturerCode').value.trim()||undefined,clientCode:$('clientCode').value.trim()||undefined,database:$('database').value.trim()||undefined,password:$('password').value||undefined,warehouseCodes:$('warehouseCodes').value.trim(),tariffCode:$('tariffCode').value.trim(),orderSeries:$('orderSeries').value.trim(),orderWarehouse:$('orderWarehouse').value.trim(),webCustomerCode:$('webCustomerCode').value.trim(),paymentCode:$('paymentCode').value.trim(),liveEnabled:$('liveEnabled').checked,writeEnabled:$('writeEnabled').checked};try{const d=await api('POST',body);$('password').value='';render(d);$('message').textContent='Configuración FACTUSOL guardada cifrada y verificada.';$('message').className='status ok'}catch(e){$('message').textContent=e.message;$('message').className='status bad';if([401,403].includes(e.status))showLogin(e.message)}};
$('clear').onclick=async()=>{if(!confirm('¿Borrar toda la configuración FACTUSOL cifrada?'))return;try{const d=await api('POST',{action:'clear'});['manufacturerCode','clientCode','database','password','warehouseCodes','tariffCode','orderSeries','orderWarehouse','webCustomerCode','paymentCode'].forEach(id=>$(id).value='');render(d);$('message').textContent='Configuración eliminada.';$('message').className='status ok'}catch(e){$('message').textContent=e.message;$('message').className='status bad';if([401,403].includes(e.status))showLogin(e.message)}};
load();
