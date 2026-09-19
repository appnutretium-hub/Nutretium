/* NUTRETIUM — comparador funcional basado en catálogo real */
(function(){
'use strict';
const KEY='nutretium_compare_v1';
const CART='nutretium_cart_v1';
const content=document.getElementById('content');
const products=Array.isArray(window.NUTRETIUM_PRODUCTS)?window.NUTRETIUM_PRODUCTS.filter(p=>p.active!==false):[];
const variants=window.NUTRETIUM_VARIANTS||null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const url=p=>`/producto/${slug(p.name)}-${p.id}`;
function ids(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.map(Number).filter(Number.isFinite).slice(0,3):[]}catch{return[]}}
function save(v){try{localStorage.setItem(KEY,JSON.stringify(v.slice(0,3)))}catch{}}
function cart(){try{const v=JSON.parse(localStorage.getItem(CART)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function saveCart(v){try{localStorage.setItem(CART,JSON.stringify(v.slice(0,100)))}catch{}}
function meta(p){return variants?.meta(p)||{size:null,flavor:null,familyLabel:p.name}}
function unitPrice(p){
  const s=String(meta(p).size||'').trim().toLowerCase().replace(',','.');
  const m=s.match(/^(\d+(?:\.\d+)?)\s*(kg|g|l|ml)$/i);if(!m)return null;
  const n=Number(m[1]);if(!Number.isFinite(n)||n<=0)return null;
  const u=m[2].toLowerCase();
  if(u==='kg')return {label:'€/kg',value:Number(p.price)/n};
  if(u==='g')return {label:'€/kg',value:Number(p.price)/(n/1000)};
  if(u==='l')return {label:'€/L',value:Number(p.price)/n};
  if(u==='ml')return {label:'€/L',value:Number(p.price)/(n/1000)};
  return null;
}
function stock(p){if(typeof p.stock!=='number')return 'Disponibilidad no cuantificada';return p.stock>0?`${p.stock} uds. registradas`:'Agotado'}
function image(p){return p.image?`<img src="/${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">`:`<span>${esc(p.emoji||'📦')}</span>`}
function add(p){const c=cart();const i=c.findIndex(x=>Number(x.id)===Number(p.id)&&!x.customization);const max=typeof p.stock==='number'?Math.max(0,p.stock):99;if(max===0)return;if(i>=0)c[i].quantity=Math.min(max||99,Math.max(1,Number(c[i].quantity)||1)+1);else c.push({key:String(p.id),id:Number(p.id),quantity:1,customization:null});saveCart(c);location.href='/?cart=1#products'}
function remove(id){const next=ids().filter(x=>x!==Number(id));save(next);render()}
function td(value,cls=''){return `<td class="${cls}">${value}</td>`}
function row(label,values){return `<tr><td>${esc(label)}</td>${values.join('')}</tr>`}
function render(){
  const selected=ids().map(id=>products.find(p=>Number(p.id)===id)).filter(Boolean);
  if(!selected.length){content.innerHTML='<div class="empty"><h2 style="margin-top:0">Aún no has elegido productos</h2><p class="muted">Vuelve al catálogo y pulsa “Comparar” en hasta tres productos.</p><a class="btn primary" href="/#products">Ir al catálogo</a></div>';return}
  const heads=selected.map(p=>`<th><div class="prodimg">${image(p)}</div><div class="name">${esc(p.name)}</div><div class="price">${Number(p.price).toFixed(2)} €</div><div class="actions"><a class="btn primary" href="${url(p)}">Ver ficha</a><button class="btn" type="button" data-add="${p.id}" ${typeof p.stock==='number'&&p.stock<=0?'disabled':''}>Añadir</button><button class="btn" type="button" data-remove="${p.id}">Quitar</button></div></th>`).join('');
  const unit=selected.map(p=>{const x=unitPrice(p);return td(x?`${x.value.toFixed(2)} ${x.label}`:'—')});
  const status=selected.map(p=>td(esc(stock(p)),typeof p.stock==='number'&&p.stock<=0?'no':'ok'));
  const table=`<div class="tablewrap"><table><thead><tr><th>Producto</th>${heads}</tr></thead><tbody>
    ${row('Marca',selected.map(p=>td(esc(p.brand||'No indicada'))))}
    ${row('Categoría',selected.map(p=>td(esc(p.category||'No indicada'))))}
    ${row('Referencia',selected.map(p=>td(esc(p.code||'No indicada'))))}
    ${row('Formato',selected.map(p=>td(esc(meta(p).size||p.pdfDescription||'No indicado'))))}
    ${row('Sabor / variedad',selected.map(p=>td(esc(meta(p).flavor||'No aplica / no indicado'))))}
    ${row('Precio unitario',unit)}
    ${row('Disponibilidad',status)}
    ${row('Ingredientes',selected.map(()=>td('Pendiente de documentación estructurada del fabricante')))}
    ${row('Alérgenos',selected.map(()=>td('Pendiente de documentación estructurada del fabricante')))}
    ${row('Información nutricional',selected.map(()=>td('Pendiente de documentación estructurada del fabricante')))}
    ${row('Modo de empleo',selected.map(()=>td('Consultar etiquetado vigente del producto')))}
  </tbody></table></div>`;
  content.innerHTML=table;
  content.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>remove(Number(b.dataset.remove)));
  content.querySelectorAll('[data-add]').forEach(b=>{b.onclick=()=>{const p=products.find(x=>Number(x.id)===Number(b.dataset.add));if(p)add(p)}});
}
render();
})();
