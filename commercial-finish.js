/* NUTRETIUM — Commercial Finish
   Capa comercial única: copy verificable, navegación, búsqueda predictiva,
   accesibilidad de compra y conexión con educación/reseñas sin tocar pagos. */
(function(){
'use strict';
const SESSION='nutretium_user';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify=(v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}};
const money=(n)=>Number(n||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});

function ensureStyle(){
  if(document.querySelector('link[href="/commercial-finish.css"]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/commercial-finish.css';document.head.appendChild(link);
}

function replaceVisiblePattern(pattern,to){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{if(n.nodeValue&&pattern.test(n.nodeValue)){pattern.lastIndex=0;n.nodeValue=n.nodeValue.replace(pattern,to)}else pattern.lastIndex=0;});
}

function normalizeCommercialFacts(){
  replaceVisiblePattern(/Lun\s*[–-]\s*Sáb\s+09:00\s*[–-]\s*21:00/g,'Lun – Sáb 09:30 – 22:00');
  replaceVisiblePattern(/Lunes\s*[–-]\s*Sábado:\s*09:00\s*[–-]\s*21:00/g,'Lunes – Sábado: 09:30 – 22:00');
  replaceVisiblePattern(/633 653 517/g,'633 753 517');
  replaceVisiblePattern(/Formulaciones avanzadas para atletas que no aceptan compromisos\./g,'Suplementación deportiva, açaí, smoothies y alimentación saludable desde Santander.');

  const stats=document.getElementById('statsBar');
  if(stats){
    stats.classList.add('nt-fact-grid');
    stats.innerHTML=`
      <div class="nt-fact"><strong>Santander</strong><span>Tienda física · La Albericia</span></div>
      <div class="nt-fact"><strong>Online</strong><span>Catálogo y compra desde la web</span></div>
      <div class="nt-fact"><strong>Redsys</strong><span>Pago con tarjeta mediante pasarela bancaria</span></div>
      <div class="nt-fact"><strong>Ayuda</strong><span>Atención antes y después de comprar</span></div>`;
  }

  const hero=document.querySelector('.hero-bg');
  if(hero){
    const badge=hero.querySelector('span.inline-block');
    if(badge)badge.textContent='Santander · Tienda física + online';
    const intro=hero.querySelector('h1 + p');
    if(intro)intro.textContent='Suplementación deportiva, açaí, smoothies y alimentación saludable desde Santander.';
    const links=[...hero.querySelectorAll('a')];
    const primary=links.find(a=>(a.textContent||'').includes('Ver Productos'));
    const categories=links.find(a=>(a.textContent||'').includes('Explorar Categorías'));
    if(primary)primary.textContent='Comprar ahora';
    if(categories){categories.textContent='Comprar por objetivo';categories.href='/recomendador';}
  }

  document.querySelectorAll('p').forEach(p=>{
    const t=(p.textContent||'').replace(/\s+/g,' ').trim();
    if(t.includes('Envío a península gratis a partir de 50€')||t.includes('10% de descuento en tu primer pedido')){
      p.innerHTML='Compra online y atención desde Santander <span class="hidden xs:inline mx-2 opacity-50">|</span> <span class="block xs:inline">Crea tu cuenta para guardar pedidos y favoritos</span>';
    }
  });
}

function replaceGenericSportsMedia(){
  const video=[...document.querySelectorAll('video')].find(v=>{
    const src=v.querySelector('source')?.getAttribute('src')||'';
    const poster=v.getAttribute('poster')||'';
    return /coverr\.co|unsplash\.com/i.test(src+' '+poster);
  });
  if(!video)return;
  const section=video.closest('section');
  if(!section||section.dataset.ntLocalProof==='1')return;
  section.dataset.ntLocalProof='1';
  section.innerHTML=`<div class="nt-local-proof">
    <div class="nt-local-proof-copy">
      <span class="nt-kicker">NUTRETIUM · SANTANDER</span>
      <h2>De la tienda física a tu compra online</h2>
      <p>Estamos en C/ La Albericia nº 1. Puedes explorar el catálogo online y, si necesitas ayuda para elegir, contactar con el equipo antes de comprar.</p>
      <div class="nt-local-proof-actions"><a href="#products">Ver catálogo</a><a class="secondary" href="#contact">Contactar</a></div>
    </div>
    <div class="nt-local-proof-meta" aria-label="Servicios disponibles">
      <div><strong>Açaí y smoothies</strong><span>Preparación en tienda</span></div>
      <div><strong>Suplementación</strong><span>Catálogo especializado</span></div>
      <div><strong>Alimentación saludable</strong><span>Selección Nutretium</span></div>
      <div><strong>Horario</strong><span>Lun – Sáb · 09:30 – 22:00</span></div>
    </div>
  </div>`;
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
      return `<article class="nt-review-card"><div class="nt-review-top"><span class="nt-stars" aria-label="${rating} de 5 estrellas">${'★'.repeat(rating)}<i aria-hidden="true">${'★'.repeat(5-rating)}</i></span>${r.verifiedPurchase?'<span class="nt-verified">Compra verificada</span>':'<span class="nt-moderated">Opinión moderada</span>'}</div><p>“${esc(r.text)}”</p><footer><strong>${esc(r.author)}</strong><span>${esc(r.product)}</span></footer></article>`;
    }).join('');
  };
}

function addEditorialLearning(){
  if(document.getElementById('ntLearnStrip'))return;
  const products=document.getElementById('products');if(!products)return;
  const section=document.createElement('section');
  section.id='ntLearnStrip';section.className='nt-learn-strip';
  section.innerHTML=`<div class="nt-learn-copy"><span class="nt-kicker">NUTRETIUM APRENDE</span><h2>Entiende lo que compras</h2><p>Guías sencillas para conocer cada categoría, comparar formatos y revisar la información del producto antes de elegir.</p><a href="/aprende">Entrar al centro de aprendizaje</a></div><div class="nt-learn-grid"><a href="/aprende#creatina"><small>01</small><strong>Creatina</strong><span>Qué es · formato · constancia</span></a><a href="/aprende#proteina"><small>02</small><strong>Proteína</strong><span>Tipos · formato · etiqueta</span></a><a href="/aprende#preentreno"><small>03</small><strong>Pre-entreno</strong><span>Cafeína · etiqueta · horario</span></a><a href="/aprende#vitaminas"><small>04</small><strong>Vitaminas</strong><span>Qué revisar antes de comprar</span></a></div>`;
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
  dock.innerHTML='<a href="/">Inicio</a><a href="/#products">Comprar</a><a href="/recomendador">Asesor</a><a href="/cuenta.html">Cuenta</a>';
  document.body.appendChild(dock);
}

function addCommercialHeroCTA(){
  const hero=document.querySelector('.hero-bg');if(!hero||hero.querySelector('.nt-hero-secondary'))return;
  const primary=[...hero.querySelectorAll('a')].find(a=>(a.textContent||'').includes('Comprar ahora'));
  if(!primary)return;
  const a=document.createElement('a');a.className='nt-hero-secondary';a.href='/aprende';a.textContent='Quiero entender qué elegir';primary.insertAdjacentElement('afterend',a);
}

function addHumanProof(){
  const proof=document.getElementById('ntStoreProof');if(!proof||proof.querySelector('.nt-human-proof'))return;
  const p=proof.querySelector('.nt-store-proof-copy p');if(p){p.insertAdjacentHTML('afterend','<div class="nt-human-proof"><span>Ayuda antes de comprar</span><strong>Si dudas entre productos, puedes consultar las diferencias con el equipo de Nutretium.</strong></div>');}
}

function installPredictiveSearch(){
  const products=Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS.filter(p=>p&&p.active!==false):[];
  if(!products.length)return;
  ['navSearchInput','mobileSearchInput'].forEach(id=>{
    const input=document.getElementById(id);if(!input||input.dataset.ntSuggest==='1')return;
    input.dataset.ntSuggest='1';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
    const host=input.closest('.relative')||input.parentElement;if(!host)return;
    const list=document.createElement('div');list.className='nt-search-suggest';list.id=`${id}Suggestions`;list.setAttribute('role','listbox');list.hidden=true;host.appendChild(list);input.setAttribute('aria-controls',list.id);
    let active=-1;
    const hide=()=>{list.hidden=true;list.innerHTML='';active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
    const render=()=>{
      const q=String(input.value||'').trim().toLocaleLowerCase('es');
      if(q.length<2){hide();return;}
      const matches=products.filter(p=>[p.name,p.brand,p.category,p.code].filter(Boolean).some(v=>String(v).toLocaleLowerCase('es').includes(q))).slice(0,6);
      if(!matches.length){list.innerHTML='<div class="nt-search-empty">No hay coincidencias directas. Pulsa Enter para ver todos los resultados.</div>';list.hidden=false;input.setAttribute('aria-expanded','true');return;}
      list.innerHTML=matches.map((p,i)=>`<a role="option" id="${list.id}-${i}" data-nt-suggest-index="${i}" href="/producto/${slugify(p.name)}-${encodeURIComponent(p.id)}"><span class="nt-search-thumb">${p.image?`<img src="/${esc(p.image)}" alt="" loading="lazy" decoding="async">`:esc(p.emoji||'•')}</span><span class="nt-search-copy"><strong>${esc(p.name)}</strong><small>${esc([p.brand,p.category].filter(Boolean).join(' · '))}</small></span><b>${money(p.price)}</b></a>`).join('');
      list.hidden=false;active=-1;input.setAttribute('aria-expanded','true');
    };
    input.addEventListener('input',render);
    input.addEventListener('focus',()=>{if(String(input.value||'').trim().length>=2)render();});
    input.addEventListener('keydown',e=>{
      const options=[...list.querySelectorAll('[data-nt-suggest-index]')];if(list.hidden||!options.length){if(e.key==='Escape')hide();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();active=e.key==='ArrowDown'?(active+1)%options.length:(active<=0?options.length-1:active-1);
        options.forEach((o,i)=>o.classList.toggle('active',i===active));input.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});
      }else if(e.key==='Enter'&&active>=0){e.preventDefault();options[active].click();}
      else if(e.key==='Escape'){e.preventDefault();hide();}
    },true);
    document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))hide();});
  });
}

function enhanceProductCards(){
  const run=()=>document.querySelectorAll('.product-card').forEach((card,index)=>{
    if(card.dataset.ntCommerceReady==='1')return;card.dataset.ntCommerceReady='1';
    const title=(card.querySelector('h3')?.textContent||'Producto').trim();
    card.setAttribute('aria-label',title);
    card.querySelectorAll('img').forEach(img=>{img.decoding='async';if(index>3)img.loading='lazy';});
    card.querySelectorAll('button').forEach(btn=>{if(!btn.getAttribute('aria-label'))btn.setAttribute('aria-label',`${(btn.textContent||'Acción').trim()} · ${title}`);});
  });
  run();
  const root=document.getElementById('products')||document.body;
  new MutationObserver(run).observe(root,{childList:true,subtree:true});
}

function enableKeyboardCards(){
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const target=e.target.closest?.('.category-card[role="button"],.mega-link[role="button"]');
    if(!target)return;e.preventDefault();target.click();
  });
}

function init(){
  ensureStyle();normalizeCommercialFacts();replaceGenericSportsMedia();updateLoyaltyCopy();installVerifiedReviews();addEditorialLearning();addDesktopLinks();addMobileDock();addCommercialHeroCTA();addHumanProof();installPredictiveSearch();enhanceProductCards();enableKeyboardCards();
  try{if(typeof renderReviews==='function')renderReviews()}catch(_){ }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,120),{once:true});else setTimeout(init,120);
})();