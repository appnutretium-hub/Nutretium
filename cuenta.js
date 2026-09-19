'use strict';

const SESSION='nutretium_user', CART='nutretium_cart_v1', WISH='nutretium_wishlist_v1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}};
const token=()=>session()?.token||'';
const clearSession=()=>{try{localStorage.removeItem(SESSION)}catch{}};
const products=()=>(window.NUTRETIUM_PRODUCTS||[]).filter(p=>p.active!==false);
const productByName=name=>products().find(p=>p.name===name)||null;
const productByKey=key=>products().find(p=>String(p.code||p.id)===String(key))||null;

function cartWrite(items){localStorage.setItem(CART,JSON.stringify(items))}
function wishlistRead(){try{const x=JSON.parse(localStorage.getItem(WISH)||'[]');return Array.isArray(x)?x.map(Number).filter(Number.isFinite):[]}catch{return[]}}
function wishlistWrite(ids){try{localStorage.setItem(WISH,JSON.stringify([...new Set(ids.map(Number).filter(Number.isFinite))].slice(0,200)))}catch{}}
function addLines(lines){
  const current=(()=>{try{return JSON.parse(localStorage.getItem(CART)||'[]')}catch{return[]}})();
  const map=new Map(current.map(x=>[String(x.id),x]));
  for(const line of lines){const p=productByName(line.name)||productByKey(line.code||line.id);if(!p)continue;const k=String(p.id);const prev=map.get(k)||{key:k,id:p.id,quantity:0,customization:null};prev.quantity=Math.min(99,Math.max(1,Number(prev.quantity||0)+Number(line.qty||1)));map.set(k,prev)}
  cartWrite([...map.values()]);location.href='/?cart=1';
}

async function api(url,opts={}){
  opts.headers={...(opts.headers||{}),Authorization:'Bearer '+token()};
  const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));
  if(!r.ok){if(r.status===401)clearSession();throw Object.assign(new Error(d.error||'No se pudo cargar'),{status:r.status})}return d;
}
async function jsonPost(url,body){return api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
async function auth(body){const r=await fetch('/.netlify/functions/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo completar la operación');return d}
async function security(body){const r=await fetch('/.netlify/functions/account-security',{method:'POST',headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo completar la operación');return d}
function status(el,msg,ok=false){if(!el)return;el.textContent=msg;el.className='status '+(ok?'ok':'error')}

function renderWishlist(){
  const set=new Set(wishlistRead());const list=products().filter(p=>set.has(Number(p.id)));
  $('wishlistCount').textContent=list.length;
  $('wishlist').innerHTML=list.length?list.map(p=>`<div class="row"><div><strong>${esc(p.name)}</strong><div class="muted">${Number(p.price).toFixed(2)} €</div></div><a class="btn" href="/producto/${encodeURIComponent((p.name||'producto').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-'))}-${p.id}">Ver</a></div>`).join(''):'<div class="empty">No tienes favoritos guardados.</div>';
}
function statusLabel(o){const f=o.fulfilmentStatus||'';if(f==='SHIPPED')return 'Enviado';if(f==='DELIVERED')return 'Entregado';if(f==='PREPARING')return 'Preparando';if(f==='READY_TO_SHIP')return 'Listo para enviar';if(f==='REVIEW_REQUIRED')return 'En revisión';return o.status==='PAID'?'Pagado':'En proceso'}
function fillProfile(u){const d=u.direccion||{};$('profileName').value=u.name||'';$('profileSurname').value=u.surname||'';$('profilePhone').value=u.phone||'';$('profileEmail').value=u.email||'';$('profileStreet').value=d.calle||'';$('profileFloor').value=d.piso||'';$('profilePostal').value=d.cp||'';$('profileCity').value=d.localidad||'';$('profileProvince').value=d.provincia||'';$('profileCountry').value=d.pais||'España'}
function currentAddress(){return{calle:$('profileStreet').value,piso:$('profileFloor').value,cp:$('profilePostal').value,localidad:$('profileCity').value,provincia:$('profileProvince').value,pais:$('profileCountry').value}}

function renderAddresses(data){
  const rows=Array.isArray(data?.addresses)?data.addresses:[];
  $('addresses').innerHTML=rows.length?rows.map(a=>`<div class="row"><div><strong>${esc(a.label||'Dirección')}</strong>${a.isDefault?'<span class="tag">Predeterminada</span>':''}<div class="muted">${esc([a.direccion?.calle,a.direccion?.piso,a.direccion?.cp,a.direccion?.localidad,a.direccion?.provincia,a.direccion?.pais].filter(Boolean).join(' · '))}</div></div><div class="actions">${a.isDefault?'':`<button class="btn secondary" data-address-default="${esc(a.id)}" type="button">Predeterminada</button>`}<button class="btn danger" data-address-delete="${esc(a.id)}" type="button">Eliminar</button></div></div>`).join(''):'<div class="empty">No tienes direcciones adicionales guardadas.</div>';
}
function renderPostSale(requests){
  const rows=Array.isArray(requests)?requests:[];
  $('postSaleRequests').innerHTML=rows.length?rows.map(r=>`<div class="row"><div><strong>${r.type==='INVOICE'?'Factura':'Devolución'} · pedido ${esc(r.order)}</strong><div class="muted">Estado: ${esc(r.status||'REQUESTED')} · ${esc(r.createdAt?new Date(r.createdAt).toLocaleString('es-ES'):'')}</div>${r.type==='INVOICE'?`<span class="tag">Documento: ${esc(r.documentStatus||'NOT_ISSUED')}</span>`:`<span class="tag">Reembolso: ${esc(r.refundStatus||'NOT_STARTED')}</span>`}</div></div>`).join(''):'<div class="empty">No hay solicitudes de postventa.</div>';
}

async function syncCustomerData(){
  const data=await api('/.netlify/functions/customer-data');
  const merged=[...new Set([...(data.wishlist||[]),...wishlistRead()])];wishlistWrite(merged);renderWishlist();
  if(JSON.stringify([...(data.wishlist||[])].sort())!==JSON.stringify([...merged].sort()))await jsonPost('/.netlify/functions/customer-data',{action:'save-wishlist',ids:merged}).catch(()=>{});
  renderAddresses(data);return data;
}
async function loadPostSale(){const d=await api('/.netlify/functions/post-sale');renderPostSale(d.requests||[]);return d}
async function verificationStatus(){try{const d=await security({action:'verification-status'});$('verifyStatus').textContent=d.verified?'Email verificado':'Email pendiente de verificar';$('verifyEmailBtn').hidden=Boolean(d.verified)}catch{$('verifyStatus').textContent='Estado no disponible'}}
async function loadProfile(){const s=session();if(!s?.token)return;try{const d=await auth({action:'profile',token:s.token});fillProfile(d.user||s);localStorage.setItem(SESSION,JSON.stringify({...s,...d.user,token:s.token}))}catch(e){if(/sesión|token|credencial/i.test(e.message))clearSession();status($('profileStatus'),e.message)}}
async function processVerification(){const verify=new URLSearchParams(location.search).get('verify');if(!verify)return;try{const d=await security({action:'verify-email',verifyToken:verify});history.replaceState({},'',location.pathname);if($('verifyStatus'))$('verifyStatus').textContent=d.message||'Email verificado.'}catch(e){if($('verifyStatus'))$('verifyStatus').textContent=e.message}}

async function requestReturn(order){
  const reason=window.prompt(`Motivo de devolución del pedido ${order}:`);if(reason===null)return;
  try{const d=await jsonPost('/.netlify/functions/post-sale',{action:'request-return',order,reason});status($('postSaleStatus'),d.idempotent?'Ya existe una solicitud abierta para este pedido.':'Solicitud de devolución registrada.',true);await loadPostSale()}catch(e){status($('postSaleStatus'),e.message)}
}
async function requestInvoice(order){
  const s=session()||{};const legalName=window.prompt('Nombre o razón social para la factura:',[s.name,s.surname].filter(Boolean).join(' '));if(legalName===null)return;
  const taxId=window.prompt('NIF/CIF:','');if(taxId===null)return;
  const d=currentAddress();const suggested=[d.calle,d.piso,d.cp,d.localidad,d.provincia,d.pais].filter(Boolean).join(', ');
  const billingAddress=window.prompt('Dirección fiscal:',suggested);if(billingAddress===null)return;
  try{const out=await jsonPost('/.netlify/functions/post-sale',{action:'request-invoice',order,legalName,taxId,billingAddress});status($('postSaleStatus'),out.note||'Solicitud de factura registrada.',true);await loadPostSale()}catch(e){status($('postSaleStatus'),e.message)}
}

async function load(){
  const s=session(),reset=new URLSearchParams(location.search).get('reset');
  if(!s?.token){$('loginBox').hidden=false;$('resetBox').hidden=!reset;return}
  $('account').hidden=false;$('logoutBtn').hidden=false;$('hello').textContent=s.name?`Hola, ${s.name}.`:'Tu cuenta Nutretium';renderWishlist();loadProfile();verificationStatus();processVerification();
  try{
    const [commerce,orders,saved]=await Promise.all([api('/.netlify/functions/commerce'),api('/.netlify/functions/orders'),api('/.netlify/functions/saved-cart'),syncCustomerData().catch(()=>null),loadPostSale().catch(()=>null)]);
    const sum=commerce.summary||{},pointsCard=$('points')?.closest('.card');
    if(sum.pointsEnabled){$('points').textContent=Number(sum.points||0).toLocaleString('es-ES');pointsCard?.querySelector('.muted')?.replaceChildren('Nutretium Points')}else{$('points').textContent='—';pointsCard?.querySelector('.muted')?.replaceChildren('Programa de puntos no activo')}
    $('ordersCount').textContent=sum.orders||0;$('spent').textContent=Number(sum.spent||0).toFixed(2)+' €';
    const freq=sum.frequentProducts||[];$('reorder').innerHTML=freq.length?freq.map(x=>`<div class="row"><div><strong>${esc(x.name)}</strong><div class="muted">Comprado ${x.qty} veces/unidades</div></div><button class="btn" data-reorder="${esc(x.key)}">Añadir</button></div>`).join(''):'<div class="empty">Cuando tengas compras confirmadas aparecerán aquí tus productos habituales.</div>';
    $('orders').innerHTML=(orders.orders||[]).length?(orders.orders||[]).map(o=>`<div class="row"><div><strong>Pedido ${esc(o.order)}</strong><div class="muted">${statusLabel(o)} · ${Number(o.amount||0).toFixed(2)} €${o.tracking?.code?` · Tracking ${esc(o.tracking.code)}`:''}</div></div><div class="actions"><button class="btn" data-order="${esc(o.order)}">Repetir</button>${o.status==='PAID'?`<button class="btn secondary" data-invoice="${esc(o.order)}">Solicitar factura</button><button class="btn secondary" data-return="${esc(o.order)}">Devolución</button>`:''}</div></div>`).join(''):'<div class="empty">Aún no hay pedidos.</div>';
    const c=saved.cart;$('savedCart').innerHTML=c&&Array.isArray(c.items)&&c.items.length?`<div class="row"><div><strong>${c.items.length} líneas guardadas</strong><div class="muted">Valor actual ${Number(c.total||0).toFixed(2)} €</div></div><button id="restoreCart" class="btn">Recuperar carrito</button></div>`:'<div class="empty">No hay carrito guardado en tu cuenta.</div>';
    $('restoreCart')?.addEventListener('click',()=>addLines(c.items));
    document.querySelectorAll('[data-reorder]').forEach(b=>b.onclick=()=>{const p=productByKey(b.dataset.reorder);if(p)addLines([{name:p.name,qty:1}])});
    document.querySelectorAll('[data-order]').forEach(b=>{const o=(orders.orders||[]).find(x=>x.order===b.dataset.order);if(o)addLines(o.items||[])});
    document.querySelectorAll('[data-return]').forEach(b=>b.onclick=()=>requestReturn(b.dataset.return));
    document.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=()=>requestInvoice(b.dataset.invoice));
  }catch(e){if(e.status===401){clearSession();location.href='/mi-nutretium';return}$('reorder').innerHTML=`<div class="empty">${esc(e.message)}</div>`}
}

$('loginBtn').onclick=async()=>{try{const d=await auth({action:'login',email:$('email').value.trim(),password:$('password').value});localStorage.setItem(SESSION,JSON.stringify(d.user));location.href='/mi-nutretium'}catch(e){status($('loginError'),e.message)}};
$('forgotBtn').onclick=async()=>{const email=$('email').value.trim();if(!email){status($('loginError'),'Introduce tu email.');return}try{const d=await security({action:'request-reset',email});status($('loginError'),d.message||'Revisa tu email.',true)}catch(e){status($('loginError'),e.message)}};
$('resetBtn').onclick=async()=>{const resetToken=new URLSearchParams(location.search).get('reset');try{const d=await security({action:'reset-password',resetToken,newPassword:$('resetPassword').value});clearSession();status($('resetStatus'),d.message||'Contraseña actualizada. Inicia sesión de nuevo.',true);setTimeout(()=>location.href='/mi-nutretium',700)}catch(e){status($('resetStatus'),e.message)}};
$('logoutBtn').onclick=()=>{clearSession();location.href='/mi-nutretium'};
$('saveProfile').onclick=async()=>{const s=session();if(!s?.token)return;try{const d=await auth({action:'update',token:s.token,name:$('profileName').value,surname:$('profileSurname').value,phone:$('profilePhone').value,direccion:currentAddress()});localStorage.setItem(SESSION,JSON.stringify({...s,...d.user,token:s.token}));fillProfile(d.user);status($('profileStatus'),'Perfil guardado.',true)}catch(e){status($('profileStatus'),e.message)}};
$('saveCurrentAddress').onclick=async()=>{try{const d=await jsonPost('/.netlify/functions/customer-data',{action:'add-address',label:$('addressLabel').value,direccion:currentAddress(),isDefault:$('addressDefault').checked});renderAddresses(d);$('addressLabel').value='';$('addressDefault').checked=false;status($('addressStatus'),'Dirección guardada.',true)}catch(e){status($('addressStatus'),e.message)}};
$('addresses').addEventListener('click',async e=>{const del=e.target.closest('[data-address-delete]'),def=e.target.closest('[data-address-default]');try{if(del){const d=await jsonPost('/.netlify/functions/customer-data',{action:'delete-address',id:del.dataset.addressDelete});renderAddresses(d);status($('addressStatus'),'Dirección eliminada.',true)}else if(def){const d=await jsonPost('/.netlify/functions/customer-data',{action:'set-default-address',id:def.dataset.addressDefault});renderAddresses(d);status($('addressStatus'),'Dirección predeterminada actualizada.',true)}}catch(err){status($('addressStatus'),err.message)}});
$('changePassword').onclick=async()=>{try{const d=await security({action:'change-password',currentPassword:$('currentPassword').value,newPassword:$('newPassword').value});$('currentPassword').value='';$('newPassword').value='';clearSession();status($('securityStatus'),d.message||'Contraseña actualizada. Inicia sesión de nuevo.',true);setTimeout(()=>location.href='/mi-nutretium',700)}catch(e){status($('securityStatus'),e.message)}};
$('verifyEmailBtn').onclick=async()=>{try{const d=await security({action:'request-verification'});$('verifyStatus').textContent=d.message||'Revisa tu email.'}catch(e){$('verifyStatus').textContent=e.message}};
load();
