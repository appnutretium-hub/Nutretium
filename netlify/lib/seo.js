'use strict';

const SEO_INTENTS = Object.freeze([
  { slug:'proteinas', label:'Proteínas', categories:['Proteínas'] },
  { slug:'creatinas', label:'Creatinas', categories:['Creatinas'] },
  { slug:'pre-entrenos', label:'Pre-entrenos', categories:['Pre-entrenos'] },
  { slug:'snacks-proteicos', label:'Snacks y alimentación proteica', categories:['Barritas y snacks','Alimentación proteica'] },
  { slug:'vitaminas-y-bienestar', label:'Vitaminas y bienestar', categories:['Vitaminas y salud','Colágeno y bienestar'] },
  { slug:'bebidas', label:'Bebidas', categories:['Bebidas'] }
]);

function slugify(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function escapeXml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function productPath(product){return `/producto/${slugify(product.name)}-${product.id}`;}
function categoryPath(category){return `/categoria/${slugify(category)}`;}
function brandPath(brand){return `/marca/${slugify(brand)}`;}
function objectivePath(intent){return `/objetivo/${slugify(intent.slug||intent.label||intent)}`;}

function buildSitemap({baseUrl='https://nutretium.com',products=[],categories=[],intents=SEO_INTENTS}={}){
  const base=String(baseUrl).replace(/\/+$/,'');
  const activeProducts=(products||[]).filter(product=>product&&product.active!==false&&Number.isFinite(Number(product.id))&&String(product.name||'').trim());
  const urls=[{loc:`${base}/`,changefreq:'daily',priority:'1.0'},{loc:`${base}/privacidad`,changefreq:'yearly',priority:'0.3'}];

  for(const category of categories||[]){
    if(!String(category||'').trim())continue;
    urls.push({loc:`${base}${categoryPath(category)}`,changefreq:'weekly',priority:'0.8'});
  }

  const brands=[...new Set(activeProducts.map(product=>String(product.brand||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  for(const brand of brands)urls.push({loc:`${base}${brandPath(brand)}`,changefreq:'weekly',priority:'0.7'});

  for(const intent of intents||[]){
    if(!intent||!Array.isArray(intent.categories)||!intent.categories.some(category=>activeProducts.some(product=>product.category===category)))continue;
    urls.push({loc:`${base}${objectivePath(intent)}`,changefreq:'weekly',priority:'0.7'});
  }

  for(const product of activeProducts)urls.push({loc:`${base}${productPath(product)}`,changefreq:'weekly',priority:product.featured?'0.8':'0.7'});

  const unique=[],seen=new Set();
  for(const item of urls){if(seen.has(item.loc))continue;seen.add(item.loc);unique.push(item);}
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((u)=>`  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
}

module.exports={SEO_INTENTS,slugify,escapeXml,productPath,categoryPath,brandPath,objectivePath,buildSitemap};
