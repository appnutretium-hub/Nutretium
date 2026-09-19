/* NUTRETIUM — educación contextual y conversión móvil en ficha de producto */
(function(){
'use strict';
const MAP=[
  {match:/creatina/i,hash:'creatina',title:'Antes de comprar creatina',copy:'Entiende qué revisar en la etiqueta, por qué la constancia importa y cómo comparar formatos antes de elegir.'},
  {match:/prote[ií]na|whey|iso/i,hash:'proteina',title:'Cómo elegir una proteína',copy:'Compara fuente, proteína por servicio, ingredientes, alérgenos y formato según tus necesidades.'},
  {match:/pre[- ]?entreno|preworkout/i,hash:'preentreno',title:'Pre-entreno: qué revisar',copy:'Comprueba cafeína, cantidad por servicio, advertencias y horario antes de decidir.'},
  {match:/vitamina|mineral|multivitam/i,hash:'vitaminas',title:'Vitaminas: compra con criterio',copy:'Revisa cantidades, valores de referencia, duplicidades y cuándo conviene consultar a un profesional.'},
  {match:/col[aá]geno/i,hash:'colageno',title:'Cómo comparar colágeno',copy:'Mira tipo, cantidad, ingredientes añadidos, alérgenos y modo de empleo del producto concreto.'}
];
function addEducation(main){
  if(document.getElementById('ntProductEducation'))return;
  const title=(document.querySelector('.title')?.textContent||'');
  const category=(document.querySelector('.meta')?.textContent||'');
  const guide=MAP.find(g=>g.match.test(title+' '+category));
  if(!guide)return;
  const details=[...main.querySelectorAll('.details')].pop();
  const section=document.createElement('section');section.id='ntProductEducation';section.className='details';
  section.innerHTML=`<div style="display:grid;grid-template-columns:.75fr 1.25fr;gap:22px;align-items:center;padding:24px;border:1px solid rgba(212,175,55,.18);border-radius:18px;background:linear-gradient(135deg,#111,#15120a)"><div><span class="eyebrow">NUTRETIUM APRENDE</span><h2 style="margin:8px 0 0">${guide.title}</h2></div><div><p style="color:#aaa59a;line-height:1.7;margin:0 0 14px">${guide.copy}</p><a class="primary" style="display:inline-flex;padding:11px 14px;border-radius:10px;text-decoration:none;font-weight:900;font-size:.8rem" href="/aprende#${guide.hash}">Ver guía completa</a></div></div>`;
  if(details)details.insertAdjacentElement('afterend',section);else main.appendChild(section);
}
function addMobileBuy(){
  if(document.getElementById('ntMobileBuy'))return;
  const original=document.getElementById('addToCartBtn');
  const title=document.querySelector('.title')?.textContent||'Producto';
  const price=document.querySelector('.price')?.textContent||'';
  if(!original||original.disabled)return;
  const bar=document.createElement('div');bar.id='ntMobileBuy';
  bar.innerHTML=`<div><span>${title.replace(/[<>]/g,'')}</span><strong>${price.replace(/[<>]/g,'')}</strong></div><button type="button">Añadir</button>`;
  const style=document.createElement('style');style.textContent='#ntMobileBuy{display:none}@media(max-width:800px){body{padding-bottom:78px}#ntMobileBuy{position:fixed;display:flex;left:8px;right:8px;bottom:8px;z-index:9999;align-items:center;gap:12px;padding:10px 11px;background:rgba(12,12,12,.96);border:1px solid rgba(255,255,255,.1);border-radius:15px;box-shadow:0 18px 50px rgba(0,0,0,.55);backdrop-filter:blur(16px)}#ntMobileBuy>div{min-width:0;flex:1}#ntMobileBuy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#aaa59a;font-size:.68rem}#ntMobileBuy strong{display:block;color:#fff;margin-top:2px;font-size:.9rem}#ntMobileBuy button{border:0;border-radius:10px;background:#d4af37;color:#090909;padding:11px 16px;font-weight:900}}';document.head.appendChild(style);
  bar.querySelector('button').addEventListener('click',()=>original.click());document.body.appendChild(bar);
}
function run(){const main=document.getElementById('app');if(!main)return;addEducation(main);addMobileBuy();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,80),{once:true});else setTimeout(run,80);
})();
