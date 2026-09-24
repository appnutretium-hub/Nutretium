/* Nutretium product community, stock alerts and FACTUSOL live availability */
(function(){
'use strict';
const KEY='nutretium_user';
function session(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
function token(){return session()?.token||''}
function idFromPath(){const last=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||''),m=last.match(/-(\d+)$/);return m?Number(m[1]):Number(new URLSearchParams(location.search).get('id'))}
const productId=idFromPath();
const products=Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS:[];
const product=products.find(p=>Number(p.id)===productId);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function customer(body){if(!token())throw new Error('Inicia sesión para usar esta función.');const r=await fetch('/.netlify/functions/customer-commerce',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify(body)}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo completar la operación.');return d}
async function loadCommunity(){const host=document.querySelector('.related')||document.querySelector('.details');if(!host||!product)return;let d={reviews:[],questions:[],rating:{value:0,count:0}};try{const r=await fetch('/.netlify/functions/product-community?productId='+encodeURIComponent(product.id));d=await r.json()}catch{}const section=document.createElement('section');section.className='details';section.id='ntCommunity';section.innerHTML=`<div class="section-head"><div><h2>Opiniones y preguntas</h2><p>Reseñas publicadas de compras verificadas y respuestas del equipo Nutretium.</p></div></div><div class="detail-grid"><div class="detail"><strong>Valoración publicada</strong><span>${d.rating?.count?`${esc(d.rating.value)}/5 · ${esc(d.rating.count)} opiniones`:'Todavía no hay opiniones publicadas.'}</span></div><div class="detail" style="grid-column:span 2"><strong>Preguntas frecuentes de clientes</strong><span>${(d.questions||[]).slice(0,5).map(q=>`• ${esc(q.question)}${q.answer?`\n  ${esc(q.answer)}`:''}`).join('\n')||'Todavía no hay preguntas publicadas.'}</span></div></div>${(d.reviews||[]).length?`<div class="related-grid" style="margin-top:14px">${d.reviews.slice(0,4).map(r=>`<div class="detail"><strong>${'★'.repeat(Math.max(1,Math.min(5,Number(r.rating)||0)))} ${esc(r.title||'Opinión verificada')}</strong><span>${esc(r.body||'')}${r.verifiedPurchase?'\nCompra verificada':''}</span></div>`).join('')}</div>`:''}<div class="buy-panel" style="margin-top:16px"><strong style="font-size:.82rem">¿Tienes una duda sobre este producto?</strong><div style="display:flex;gap:8px;margin-top:8px"><input id="ntQuestion" maxlength="1500" placeholder="Escribe tu pregunta" style="flex:1;min-width:0;background:#080808;color:#fff;border:1px solid #333;border-radius:9px;padding:10px"><button id="ntAsk" class="secondary" type="button" style="padding:10px 14px;border-radius:9px">Enviar</button></div><div id="ntQuestionMsg" class="buy-note"></div></div>`;host.insertAdjacentElement('beforebegin',section);document.getElementById('ntAsk').onclick=async()=>{const q=document.getElementById('ntQuestion').value.trim(),msg=document.getElementById('ntQuestionMsg');try{await customer({action:'product-question',productId:product.id,question:q});msg.textContent='Pregunta enviada a moderación.';document.getElementById('ntQuestion').value=''}catch(e){msg.textContent=e.message}}}
function addStockAlert(){if(!product||!(typeof product.stock==='number'&&product.stock<=0))return;const stock=document.querySelector('.stock.out');if(!stock||document.getElementById('ntStockAlert'))return;const button=document.createElement('button');button.id='ntStockAlert';button.type='button';button.className='secondary';button.style.cssText='margin-top:10px;padding:10px 12px;border-radius:9px;cursor:pointer';button.textContent='Avísame cuando vuelva';button.onclick=async()=>{try{await customer({action:'stock-alert',sku:product.code,enabled:true});button.textContent='✓ Aviso activado';button.disabled=true}catch(e){alert(e.message)}};stock.insertAdjacentElement('afterend',button)}
function syncWishlist(){const btn=document.getElementById('wishlistButton');if(!btn||!token())return;btn.addEventListener('click',()=>setTimeout(async()=>{try{const ids=JSON.parse(localStorage.getItem('nt_wishlist_v1')||'[]');await customer({action:'wishlist-sync',productIds:ids})}catch{}},50))}
function trackView(){if(window.NUTRETIUM_CONSENT?.analitica?.()!==true||!product)return;fetch('/.netlify/functions/analytics-ingest',{method:'POST',headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:JSON.stringify({name:'nt_product_view',payload:{product_id:product.id,price:product.price},consent:true,subject:localStorage.getItem('nt_subject')||'anonymous'}),keepalive:true}).catch(()=>{})}
function setLiveStock(item,checkedAt){
  if(!product||!item)return;
  const available=item.blocked===true?0:Math.max(0,Number(item.available)||0);
  const price=Number(item.price);
  product.stock=available;
  if(Number.isFinite(price)&&price>=0)product.price=price;
  product._stockSource='factusol-live';
  product._stockCheckedAt=checkedAt||null;
  const stock=document.querySelector('.stock');
  if(stock){stock.textContent=available>0?`${available} uds. disponibles ahora`:'Agotado actualmente';stock.classList.toggle('ok',available>0);stock.classList.toggle('out',available<=0)}
  const priceEl=document.querySelector('.price');
  if(priceEl&&Number.isFinite(price)&&price>=0)priceEl.textContent=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(price);
  const buy=document.querySelector('.buy');
  const mobile=document.querySelector('.mobile-buy');
  if(available<=0){
    if(buy)buy.innerHTML='<button class="secondary" disabled style="opacity:.6">Producto agotado</button>';
    if(mobile)mobile.remove();
    addStockAlert();
  }
  document.querySelectorAll('.detail').forEach(el=>{const strong=el.querySelector('strong');if(strong?.textContent==='Disponibilidad'){const span=el.querySelector('span');if(span)span.textContent=available>0?`${available} uds. disponibles ahora`:'Agotado actualmente'}});
  document.querySelector('.buy-note')?.replaceChildren(document.createTextNode('Precio y stock verificados contra FACTUSOL. El checkout vuelve a validarlos antes del pago.'));
}
async function refreshLiveStock(){
  if(!product||!product.code||typeof product.stock!=='number')return;
  try{
    const r=await fetch('/.netlify/functions/factusol-public-catalog?codes='+encodeURIComponent(product.code),{cache:'no-store',headers:{Accept:'application/json'}});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d||d.status!=='LIVE'||d.live!==true||d.authoritative!==true)return;
    const item=(d.items||[]).find(x=>String(x.code)===String(product.code));
    if(item)setLiveStock(item,d.checkedAt);
    else if((d.missingCodes||[]).map(String).includes(String(product.code)))setLiveStock({code:product.code,available:0,price:product.price,blocked:true},d.checkedAt);
  }catch(_){ }
}
function init(){loadCommunity();addStockAlert();syncWishlist();trackView();refreshLiveStock();setInterval(refreshLiveStock,60*1000);window.addEventListener('focus',refreshLiveStock)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();