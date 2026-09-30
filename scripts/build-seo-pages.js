'use strict';

const fs = require('fs');
const path = require('path');
const { NUTRETIUM_PRODUCTS = [], NUTRETIUM_CATEGORIES = [] } = require('../products-data.js');
const pim = require('../product-pim.js');

const ROOT = process.cwd();
const ORIGIN = 'https://nutretium.com';
const products = NUTRETIUM_PRODUCTS.filter(p => p && p.active !== false).map(pim.normalize);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const productUrl = (p) => `/producto/${pim.slugify(p.name)}-${p.id}`;
const abs = (url) => new URL(url, ORIGIN).href;

function cleanDir(name) {
  const target = path.join(ROOT, name);
  fs.rmSync(target, { recursive:true, force:true });
  fs.mkdirSync(target, { recursive:true });
}

function writeRoute(prefix, slug, html) {
  const dir = path.join(ROOT, prefix, slug);
  fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

function layout({ title, description, canonical, body, schema=[] }) {
  const schemas = schema.map((data, i) => `<script id="nt-static-schema-${i}" type="application/ld+json">${json(data)}</script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="es"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="index,follow"><title>${esc(title)}</title>
  <meta name="description" content="${esc(description.slice(0,160))}"><link rel="canonical" href="${esc(canonical)}">
  <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/commercial-finish.css"><link rel="stylesheet" href="/reference-premium.css">
  ${schemas}
  <style>body{margin:0;background:#0b0b0b;color:#f3f1eb;font-family:Inter,Arial,sans-serif}.nt-seo-wrap{max-width:1180px;margin:auto;padding:0 20px}.nt-seo-head{border-bottom:1px solid rgba(255,255,255,.08);background:#0e0e0e}.nt-seo-head .nt-seo-wrap{height:72px;display:flex;align-items:center;justify-content:space-between}.nt-seo-brand{font-weight:900;color:#d4af37;text-decoration:none;font-size:1.3rem}.nt-seo-brand span{color:#fff}.nt-seo-nav{color:#aaa;text-decoration:none;font-weight:700;font-size:.82rem}.nt-seo-hero{padding:62px 0 32px}.nt-seo-kicker{color:#d4af37;font-size:.72rem;letter-spacing:.12em;font-weight:900;text-transform:uppercase}.nt-seo-hero h1{font-size:clamp(2.2rem,5vw,4rem);letter-spacing:-.05em;margin:10px 0 12px}.nt-seo-hero p{color:#aaa59a;max-width:760px;line-height:1.7}.nt-seo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:12px 0 72px}.nt-seo-card{display:flex;flex-direction:column;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#111;overflow:hidden;min-height:100%}.nt-seo-img{height:190px;display:flex;align-items:center;justify-content:center;background:#151515;padding:14px}.nt-seo-img img{max-width:100%;max-height:100%;object-fit:contain}.nt-seo-copy{padding:16px}.nt-seo-copy small{color:#8f8a80}.nt-seo-copy strong{display:block;margin:6px 0;line-height:1.3}.nt-seo-price{color:#d4af37;font-weight:900}.nt-seo-links{display:flex;gap:8px;flex-wrap:wrap;padding:0 0 50px}.nt-seo-links a{color:#d9d5cc;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:8px 12px;text-decoration:none;font-size:.78rem}.nt-seo-foot{border-top:1px solid rgba(255,255,255,.08);padding:30px 0 50px;color:#777;font-size:.75rem}@media(max-width:900px){.nt-seo-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:540px){.nt-seo-grid{grid-template-columns:1fr}.nt-seo-head .nt-seo-wrap{height:62px}}</style>
</head><body><header class="nt-seo-head"><div class="nt-seo-wrap"><a class="nt-seo-brand" href="/">NUTRE<span>TIUM</span></a><a class="nt-seo-nav" href="/#products">Tienda</a></div></header>${body}<footer class="nt-seo-foot"><div class="nt-seo-wrap">Nutretium · BAHÍA NORTE CAPITAL, S.L. · C/ La Albericia 1, Santander · <a class="nt-seo-nav" href="/ayuda">Ayuda</a> · <a class="nt-seo-nav" href="/privacidad">Privacidad</a></div></footer></body></html>`;
}

function cards(list) {
  return list.map(p => {
    const img = p.images?.[0] ? `<img src="/${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : `<span aria-hidden="true" style="font-size:3rem">${esc(p.emoji || '📦')}</span>`;
    const stock = typeof p.stock === 'number' ? (p.stock > 0 ? 'Disponible' : 'Agotado') : 'Consultar disponibilidad';
    return `<a class="nt-seo-card" href="${productUrl(p)}"><div class="nt-seo-img">${img}</div><div class="nt-seo-copy"><small>${esc(p.brand || p.category || 'Nutretium')} · ${esc(stock)}</small><strong>${esc(p.name)}</strong><span class="nt-seo-price">${Number(p.price).toFixed(2)} €</span></div></a>`;
  }).join('');
}

function collectionPage({kind, label, slug, list, description}) {
  const canonical = abs(`/${kind}/${slug}`);
  const schema = [
    {'@context':'https://schema.org','@type':'CollectionPage',name:label,description,url:canonical},
    {'@context':'https://schema.org','@type':'ItemList',numberOfItems:list.length,itemListElement:list.slice(0,50).map((p,i)=>({'@type':'ListItem',position:i+1,url:abs(productUrl(p)),name:p.name}))}
  ];
  const links = kind !== 'categoria' ? '' : `<div class="nt-seo-links"><a href="/">Ver catálogo completo</a>${[...new Set(list.map(p=>p.brand).filter(Boolean))].slice(0,12).map(b=>`<a href="/marca/${pim.slugify(b)}">${esc(b)}</a>`).join('')}</div>`;
  const categories = kind === 'categoria' ? `<aside class="nt-seo-sidebar"><strong>Explorar categorías</strong>${NUTRETIUM_CATEGORIES.filter(c => products.some(p => p.category === c)).map(c => `<a ${c === label ? 'aria-current="page"' : ''} href="/categoria/${pim.slugify(c)}">${esc(c)}</a>`).join('')}</aside>` : '';
  const chips = kind === 'categoria' ? `<nav class="nt-seo-chips" aria-label="Otras categorías">${NUTRETIUM_CATEGORIES.filter(c => products.some(p => p.category === c)).slice(0,8).map(c => `<a ${c === label ? 'aria-current="page"' : ''} href="/categoria/${pim.slugify(c)}">${esc(c)}</a>`).join('')}</nav>` : '';
  const body = `<main class="nt-seo-wrap nt-seo-collection"><section class="nt-seo-hero"><span class="nt-seo-kicker">Nutrición & rendimiento · Catálogo</span><h1>${esc(label)}</h1><p>${esc(description)}</p>${chips}</section><div class="nt-seo-layout">${categories}<section class="nt-seo-grid" aria-label="Productos de ${esc(label)}">${cards(list)}</section></div>${links}</main>`;
  return layout({title:`${label} | Nutretium Santander`,description,canonical,body,schema});
}

function buildProductPages() {
  const source = fs.readFileSync(path.join(ROOT,'producto.html'),'utf8');
  for (const p of products) {
    const canonical = abs(productUrl(p));
    const description = (p.description || pim.factualDescription(p)).slice(0,155);
    const available = typeof p.stock !== 'number' || p.stock > 0;
    const productSchema = {
      '@context':'https://schema.org','@type':'Product',name:p.name,sku:p.sku || undefined,gtin:p.gtin || undefined,
      brand:p.brand?{'@type':'Brand',name:p.brand}:undefined,
      manufacturer:p.manufacturer?{'@type':'Organization',name:p.manufacturer}:undefined,
      description,image:p.images?.length?p.images.map(src=>abs('/'+src.replace(/^\//,''))):undefined,
      offers:{'@type':'Offer',priceCurrency:'EUR',price:Number(p.price).toFixed(2),availability:available?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:canonical,itemCondition:'https://schema.org/NewCondition'}
    };
    Object.keys(productSchema).forEach(k => productSchema[k] === undefined && delete productSchema[k]);
    const breadcrumb = {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'Inicio',item:abs('/')},
      {'@type':'ListItem',position:2,name:p.category || 'Catálogo',item:abs(`/categoria/${pim.slugify(p.category || 'catalogo')}`)},
      {'@type':'ListItem',position:3,name:p.name,item:canonical}
    ]};
    const pre = `<div class="crumb"><a href="/">Inicio</a> · <a href="/categoria/${pim.slugify(p.category || 'catalogo')}">${esc(p.category || 'Catálogo')}</a> · ${esc(p.name)}</div><section class="product"><div class="visual">${p.images?.[0]?`<img src="/${esc(p.images[0])}" alt="${esc(p.name)}">`:`<div class="emoji">${esc(p.emoji || '📦')}</div>`}</div><div><span class="eyebrow">${esc(p.brand || p.category || 'Nutretium')}</span><h1 class="title">${esc(p.name)}</h1><div class="price">€${Number(p.price).toFixed(2)}</div><p class="desc">${esc(description)}</p><noscript><p>Activa JavaScript para seleccionar variantes y añadir este producto al carrito.</p></noscript></div></section>`;
    let html = source
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.name)} | NUTRETIUM</title>`)
      .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(description)}">`)
      .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}">`)
      .replace('</head>', `  <meta property="og:type" content="product"><meta property="og:title" content="${esc(p.name)} | NUTRETIUM"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">${p.images?.[0]?`<meta property="og:image" content="${esc(abs('/'+p.images[0].replace(/^\//,'')))}">`:''}<script id="nt-product-schema" type="application/ld+json">${json(productSchema)}</script><script id="nt-breadcrumb-schema" type="application/ld+json">${json(breadcrumb)}</script>\n</head>`)
      .replace('<main id="app" class="wrap"></main>', `<main id="app" class="wrap">${pre}</main>`);
    writeRoute('producto', `${pim.slugify(p.name)}-${p.id}`, html);
  }
}

function buildCollections() {
  for (const category of NUTRETIUM_CATEGORIES) {
    const list = products.filter(p => p.category === category);
    if (!list.length) continue;
    const slug = pim.slugify(category);
    writeRoute('categoria', slug, collectionPage({kind:'categoria',label:category,slug,list,description:`Compra ${category.toLowerCase()} disponibles en el catálogo online de Nutretium. Precio y disponibilidad se muestran por referencia; la composición específica debe verificarse en cada ficha y etiquetado.`}));
  }
  const brands = [...new Set(products.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  for (const brand of brands) {
    const list = products.filter(p => p.brand === brand);
    const slug = pim.slugify(brand);
    writeRoute('marca', slug, collectionPage({kind:'marca',label:brand,slug,list,description:`Productos de ${brand} publicados actualmente en Nutretium. Consulta precio, formato y disponibilidad de cada referencia antes de comprar.`}));
  }
  for (const intent of pim.SEO_INTENTS) {
    const list = products.filter(p => intent.categories.includes(p.category));
    if (!list.length) continue;
    writeRoute('objetivo', intent.slug, collectionPage({kind:'objetivo',label:intent.label,slug:intent.slug,list,description:`Selección del catálogo Nutretium agrupada por tipo de producto: ${intent.label.toLowerCase()}. La agrupación no constituye una recomendación sanitaria ni atribuye beneficios a una referencia concreta.`}));
  }
  return brands;
}

function buildSitemap(brands) {
  const urls = new Set([`${ORIGIN}/`,`${ORIGIN}/ayuda`,`${ORIGIN}/aprende`,`${ORIGIN}/recomendador`,`${ORIGIN}/privacidad`,`${ORIGIN}/condiciones`]);
  NUTRETIUM_CATEGORIES.forEach(c => { if (products.some(p=>p.category===c)) urls.add(`${ORIGIN}/categoria/${pim.slugify(c)}`); });
  brands.forEach(b => urls.add(`${ORIGIN}/marca/${pim.slugify(b)}`));
  pim.SEO_INTENTS.forEach(x => { if (products.some(p=>x.categories.includes(p.category))) urls.add(`${ORIGIN}/objetivo/${x.slug}`); });
  products.forEach(p => urls.add(abs(productUrl(p))));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u,i)=>`  <url><loc>${esc(u)}</loc><changefreq>${i===0?'daily':'weekly'}</changefreq><priority>${i===0?'1.0':'0.7'}</priority></url>`).join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT,'sitemap.xml'),xml,'utf8');
  fs.writeFileSync(path.join(ROOT,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /backoffice\nDisallow: /settings\nDisallow: /control\nDisallow: /checkout\nDisallow: /mi-nutretium\nSitemap: ${ORIGIN}/sitemap.xml\n`,'utf8');
  return urls.size;
}

cleanDir('categoria'); cleanDir('marca'); cleanDir('objetivo'); cleanDir('producto');
buildProductPages();
const brands = buildCollections();
const count = buildSitemap(brands);
const audit = pim.audit(products);
fs.writeFileSync(path.join(ROOT,'pim-audit.json'),JSON.stringify({...audit,generatedAt:new Date().toISOString()},null,2),'utf8');
console.log(`[build-seo-pages] ${products.length} productos · ${brands.length} marcas · sitemap ${count} URLs · GTIN verificados ${audit.withGtin}/${audit.active}`);
