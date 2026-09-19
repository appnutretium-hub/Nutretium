/* NUTRETIUM — Commercial Finish 10/10
   Última capa visual/comercial: elimina restos de plantilla, conecta educación,
   refuerza navegación móvil y hace visible la verificación real de reseñas. */
(function(){
'use strict';
const SESSION='nutretium_user';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}};

function ensureStyle(){
  if(document.querySelector('link[href="/commercial-finish.css"]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/commercial-finish.css';document.head.appendChild(link);
}

function replaceVisible(from,to){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{if(n.nodeValue&&n.nodeValue.includes(from))n.nodeValue=n.nodeValue.replaceAll(from,to)});
}

function removeTemplateNoise(){
  document.querySelectorAll('section').forEach(section=>{
    const t=(section.textContent||'').replace(/\s+/g,' ').trim();
    if(t.includes('Hilo musical')||t.includes('Los 40 Principales')) section.remove();
  });
  replaceVisible('633 653 517','633 753 517');
  replaceVisible('Calidad certificada','Atención en tienda');
  replaceVisible('Envío express','Compra online');
  replaceVisible('Garantía devolución','Ayuda postventa');
  replaceVisible('Formulaciones avanzadas para atletas que no aceptan compromisos.','Suplementación, alimentación saludable y asesoramiento cercano desde Santander.');
}

function updateLoyaltyCopy(){
  try{
    if(typeof INFO_CONTENT!=='undefined'){
      INFO_CONTENT.afiliacion={
        title:'Nutretium Points',
        html:'<p><strong class="text-white">Nutretium Points</strong> forma parte del área Mi Nutretium. El saldo se calcula a partir de compras confirmadas y se consulta desde la cuenta del cliente.</p><p><a href="/cuenta.html" class="text-brand-gold hover:underline">Abrir Mi Nutretium</a></p><p class="text-brand-muted text-sm">Las condiciones comerciales aplicables deben mostrarse antes de canjear cualquier recompensa.</p>'
      };
    }
  }catch(_){ }
}

function installVerifiedReviews(){
  window.submitReview=async function(){
    const product=document.getElementById('reviewProduct')?.value||'';
    const author=document.getElementById('reviewAuthor')?.value.trim()||'';
    const text=document.getElementById('reviewText')?.value.trim()||'';
    const errEl=document.getElementById('reviewError');
    if(errEl)errEl.classList.add('hidden');
    const fail=(m)=>{if(typeof showFieldError==='function'&&errEl)showFieldError(errEl,m);else if(errEl){errEl.textContent=m;errEl.classList.remove('hidden')}};
    if(!product)return fail('Selecciona un producto.');
    if(typeof reviewStarValue==='undefined'||!reviewStarValue)return fail('Selecciona una valoración.');
    if(!author)return fail('Escribe tu nombre.');
    if(!text)return fail('Escribe un comentario.');
    const s=session();
    try{
      const res=await fetch('/.netlify/functions/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',review:{author,product,rating:reviewStarValue,text},token:s?.token||null})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||'No se pudo enviar la reseña.');
      if(typeof closeModal==='function')closeModal('reviewModal');
      if(typeof showToast==='function')showToast(data.verifiedPurchase?'Reseña enviada · compra verificada':'Gracias. Tu reseña se publicará tras ser revisada.');
    }catch(err){fail(err.message||'No se pudo enviar la reseña. Inténtalo de nuevo.');}
  };

  window.renderReviews=function(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    if(typeof REVIEWS==='undefined'||!REVIEWS.length){grid.innerHTML='<div class="col-span-full nt-empty-review"><strong>Aún no hay opiniones publicadas</strong><span>Las nuevas reseñas pasan por moderación antes de mostrarse.</span></div>';return;}
    grid.innerHTML=REVIEWS.slice(0,6).map(r=>{
      const rating=Math.max(1,Math.min(5,Math.round(Number(r.rating)||0)));
      return `<article class="nt-review-card"><div class="nt-review-top"><span class="nt-stars">${'★'.repeat(rating)}<i>${'★'.repeat(5-rating)}</i></span>${r.verifiedPurchase?'<span class="nt-verified">Compra verificada</span>':'<span class="nt-moderated">Opinión moderada</span>'}</div><p>“${esc(r.text)}”</p><footer><strong>${esc(r.author)}</strong><span>${esc(r.product)}</span></footer></article>`;
    }).join('');
  };
}

function addEditorialLearning(){
  if(document.getElementById('ntLearnStrip'))return;
  const products=document.getElementById('products');if(!products)return;
  const section=document.createElement('section');
  section.id='ntLearnStrip';section.className='nt-learn-strip';
  section.innerHTML=`<div class="nt-learn-copy"><span class="nt-kicker">NUTRETIUM APRENDE</span><h2>No compres un suplemento sin entenderlo</h2><p>Guías sencillas para saber qué hace cada categoría, cómo elegir formato y cuándo consultar la etiqueta o a un profesional.</p><a href="/aprende">Entrar al centro de aprendizaje</a></div><div class="nt-learn-grid"><a href="/aprende#creatina"><small>01</small><strong>Creatina</strong><span>Qué es · cuándo · constancia</span></a><a href="/aprende#proteina"><small>02</small><strong>Proteína</strong><span>Cómo elegir · cuándo usarla</span></a><a href="/aprende#preentreno"><small>03</small><strong>Pre-entreno</strong><span>Cafeína · etiqueta · horario</span></a><a href="/aprende#vitaminas"><small>04</small><strong>Vitaminas</strong><span>Qué revisar antes de comprar</span></a></div>`;
  products.insertAdjacentElement('beforebegin',section);
}

function addDesktopLinks(){
  const nav=document.querySelector('nav');if(!nav||nav.querySelector('[data-nt-education]'))return;
  const candidates=[...nav.querySelectorAll('a')];
  const anchor=candidates.find(a=>(a.textContent||'').trim()==='Productos')||candidates[0];
  if(!anchor)return;
  const learn=anchor.cloneNode(false);learn.textContent='Aprende';learn.href='/aprende';learn.setAttribute('data-nt-education','1');
  const advisor=anchor.cloneNode(false);advisor.textContent='Recomendador';advisor.href='/recomendador';advisor.setAttribute('data-nt-education','1');
  anchor.insertAdjacentElement('afterend',advisor);anchor.insertAdjacentElement('afterend',learn);
}

function addMobileDock(){
  if(document.getElementById('ntMobileDock'))return;
  const dock=document.createElement('nav');dock.id='ntMobileDock';dock.className='nt-mobile-dock';dock.setAttribute('aria-label','Navegación rápida móvil');
  dock.innerHTML='<a href="/">Inicio</a><a href="/#products">Comprar</a><a href="/aprende">Aprende</a><a href="/recomendador">Asesor</a><a href="/cuenta.html">Cuenta</a>';
  document.body.appendChild(dock);
}

function addCommercialHeroCTA(){
  const hero=document.querySelector('.hero-bg');if(!hero||hero.querySelector('.nt-hero-secondary'))return;
  const primary=[...hero.querySelectorAll('a')].find(a=>(a.textContent||'').includes('Ver Productos'));
  if(!primary)return;
  const a=document.createElement('a');a.className='nt-hero-secondary';a.href='/aprende';a.textContent='No sé qué necesito';primary.insertAdjacentElement('afterend',a);
}

function addHumanProof(){
  const proof=document.getElementById('ntStoreProof');if(!proof||proof.querySelector('.nt-human-proof'))return;
  const p=proof.querySelector('.nt-store-proof-copy p');if(p){p.insertAdjacentHTML('afterend','<div class="nt-human-proof"><span>Compra con apoyo real</span><strong>Si no sabes qué elegir, te explicamos las diferencias antes de venderte nada.</strong></div>');}
}

function init(){
  ensureStyle();removeTemplateNoise();updateLoyaltyCopy();installVerifiedReviews();addEditorialLearning();addDesktopLinks();addMobileDock();addCommercialHeroCTA();addHumanProof();
  try{if(typeof renderReviews==='function')renderReviews()}catch(_){ }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,140),{once:true});else setTimeout(init,140);
})();
