/* NUTRETIUM Smart Store Engine — pure, testable catalog intelligence */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NutretiumSmartEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const CATEGORY_SETS={
  entrenamiento:['Proteínas','Creatinas','Accesorios gym'],
  energia:['Pre-entrenos','Café y matcha','Bebidas'],
  bienestar:['Vitaminas y salud','Colágeno y bienestar'],
  snack:['Barritas y snacks','Alimentación proteica'],
  preparados:['Bowls','Yogures','Smoothies y batidos','Waffles y caprichos','Helados']
};
const SYNONYMS={
  proteina:['proteina','proteinas','whey','aislado','isolate'],
  creatina:['creatina','creatine'],
  preentreno:['pre entreno','preentreno','pre-workout','pre workout'],
  vitaminas:['vitamina','vitaminas','multivitaminico','multivitamínico'],
  colageno:['colageno','colágeno'],
  snack:['snack','barrita','barritas','proteica','proteico'],
  bebida:['bebida','bebidas','matcha','cafe','café'],
  preparado:['bowl','acai','açaí','smoothie','batido','yogur','helado','waffle']
};
const TERM_CATEGORIES={
  proteina:['Proteínas'],creatina:['Creatinas'],preentreno:['Pre-entrenos'],vitaminas:['Vitaminas y salud'],
  colageno:['Colágeno y bienestar'],snack:['Barritas y snacks','Alimentación proteica'],bebida:['Bebidas','Café y matcha'],
  preparado:CATEGORY_SETS.preparados
};
function text(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function moneyBudget(query){
  const q=text(query).replace(/,/g,'.');
  const m=q.match(/(?:menos de|hasta|maximo|max|presupuesto|por debajo de)\s*(\d+(?:\.\d{1,2})?)/);
  if(m)return Number(m[1]);
  const euro=q.match(/(\d+(?:\.\d{1,2})?)\s*(?:eur|euros?)/);
  return euro?Number(euro[1]):null;
}
function activeCatalog(products){return (Array.isArray(products)?products:[]).filter(p=>p&&p.active!==false&&Number(p.price)>0&&String(p.name||'').trim())}
function availability(p){
  if(typeof p?.stock!=='number'||!Number.isFinite(p.stock))return 'unknown';
  return p.stock>0?'in_stock':'out_of_stock';
}
function matchCategories(query){
  const q=text(query),out=new Set();
  Object.entries(SYNONYMS).forEach(([key,terms])=>{if(terms.some(t=>q.includes(text(t))))(TERM_CATEGORIES[key]||[]).forEach(c=>out.add(c))});
  Object.entries(CATEGORY_SETS).forEach(([key,cats])=>{if(q.includes(text(key)))cats.forEach(c=>out.add(c))});
  return [...out];
}
function parseIntent(query){return {query:String(query||'').trim(),normalized:text(query),budget:moneyBudget(query),categories:matchCategories(query)}}
function scoreProduct(p,intent){
  const hay=text([p.name,p.brand,p.category,p.code,p.pdfDescription].filter(Boolean).join(' '));
  const words=intent.normalized.split(' ').filter(w=>w.length>1&&!['quiero','para','algo','menos','hasta','euros','euro','por','con','sin','de','del','la','el'].includes(w));
  let score=0;
  words.forEach(w=>{if(hay.includes(w))score+=hay.startsWith(w)?5:2});
  if(intent.categories.includes(p.category))score+=8;
  if(p.featured)score+=1;
  if(availability(p)==='out_of_stock')score-=20;
  return score;
}
function find(products,query,{limit=12}={}){
  const intent=parseIntent(query),catalog=activeCatalog(products);
  const filtered=catalog.filter(p=>intent.budget==null||Number(p.price)<=intent.budget);
  return filtered.map(p=>({product:p,score:scoreProduct(p,intent)})).filter(x=>intent.normalized?x.score>0:true).sort((a,b)=>b.score-a.score||Number(a.product.price)-Number(b.product.price)).slice(0,limit).map(x=>x.product);
}
function categoryPick(catalog,category,remaining,used){
  return catalog.filter(p=>p.category===category&&!used.has(Number(p.id))&&availability(p)!=='out_of_stock'&&Number(p.price)<=remaining)
    .sort((a,b)=>(availability(a)==='in_stock'?0:1)-(availability(b)==='in_stock'?0:1)||Number(a.price)-Number(b.price))[0]||null;
}
function buildStack(products,{preset='entrenamiento',budget=Infinity,maxItems=3}={}){
  const catalog=activeCatalog(products),cats=CATEGORY_SETS[preset]||CATEGORY_SETS.entrenamiento;
  const cap=Number.isFinite(Number(budget))&&Number(budget)>0?Number(budget):Infinity;
  const items=[],used=new Set();let total=0;
  for(const category of cats){
    if(items.length>=Math.max(1,Math.min(6,Number(maxItems)||3)))break;
    const p=categoryPick(catalog,category,cap-total,used);if(!p)continue;
    items.push(p);used.add(Number(p.id));total+=Number(p.price);
  }
  return {preset,categories:[...cats],items,total:Number(total.toFixed(2)),budget:Number.isFinite(cap)?cap:null,complete:items.length===Math.min(cats.length,Math.max(1,Math.min(6,Number(maxItems)||3)))};
}
function extractMeasure(name){
  const s=String(name||'').replace(/\./g,'');
  const kg=s.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*kg\b/i);if(kg)return{kind:'g',amount:Number(kg[1].replace(',','.'))*1000,label:`${kg[1]} kg`};
  const g=s.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*g\b/i);if(g)return{kind:'g',amount:Number(g[1].replace(',','.')),label:`${g[1]} g`};
  const l=s.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*l\b/i);if(l)return{kind:'ml',amount:Number(l[1].replace(',','.'))*1000,label:`${l[1]} L`};
  const ml=s.match(/(?:^|\s)(\d+(?:[,.]\d+)?)\s*ml\b/i);if(ml)return{kind:'ml',amount:Number(ml[1].replace(',','.')),label:`${ml[1]} ml`};
  return null;
}
function unitPrice(p){const m=extractMeasure(p?.name);if(!m||!m.amount||!Number(p?.price))return null;return {kind:m.kind,per100:Number((Number(p.price)*100/m.amount).toFixed(2)),measure:m}}
function prepared(products){return activeCatalog(products).filter(p=>CATEGORY_SETS.preparados.includes(p.category))}
function encodeList(ids){
  const clean=[...new Set((Array.isArray(ids)?ids:[]).map(Number).filter(Number.isFinite))].slice(0,30);
  const raw=clean.join(',');
  if(typeof btoa==='function')return btoa(raw).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
  return Buffer.from(raw,'utf8').toString('base64url');
}
function decodeList(token){
  try{let raw;if(typeof atob==='function'){let s=String(token||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';raw=atob(s)}else raw=Buffer.from(String(token||''),'base64url').toString('utf8');return [...new Set(raw.split(',').map(Number).filter(Number.isFinite))].slice(0,30)}catch{return[]}
}
return {CATEGORY_SETS,text,activeCatalog,availability,parseIntent,find,buildStack,extractMeasure,unitPrice,prepared,encodeList,decodeList};
});
