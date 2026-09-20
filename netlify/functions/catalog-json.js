'use strict';
const {NUTRETIUM_PRODUCTS=[]}=require('../../products-data.js');
function slug(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function availability(p){return typeof p.stock==='number'&&Number.isFinite(p.stock)?(p.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock'):null}
function item(p){const offers={'@type':'Offer',url:`https://nutretium.com/producto/${slug(p.name)}-${p.id}`,priceCurrency:'EUR',price:Number(p.price).toFixed(2)};const av=availability(p);if(av)offers.availability=av;return {'@type':'Product','@id':`https://nutretium.com/producto/${slug(p.name)}-${p.id}`,name:String(p.name),sku:String(p.code||p.id),category:String(p.category||''),brand:p.brand?{'@type':'Brand',name:String(p.brand)}:undefined,image:p.image?`https://nutretium.com/${String(p.image).replace(/^\//,'')}`:undefined,offers}}
function eligible(p){return Boolean(p&&p.active!==false&&Number(p.price)>0&&String(p.name||'').trim())}
exports.handler=async()=>{const graph=NUTRETIUM_PRODUCTS.filter(eligible).map(item);return{statusCode:200,headers:{'Content-Type':'application/ld+json; charset=utf-8','Cache-Control':'public, max-age=300, s-maxage=900','X-Content-Type-Options':'nosniff'},body:JSON.stringify({'@context':'https://schema.org','@type':'ItemList',name:'Catálogo Nutretium',url:'https://nutretium.com/',numberOfItems:graph.length,itemListElement:graph.map((x,i)=>({'@type':'ListItem',position:i+1,item:x}))})}};
exports._test={slug,availability,item,eligible};
