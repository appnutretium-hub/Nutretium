/* NUTRETIUM — Product Information Model (PIM)
   Normaliza el catálogo existente sin inventar EAN, composición, claims ni documentación.
   Funciona en navegador y Node para que ficha, SEO y build compartan exactamente la misma lógica. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NUTRETIUM_PIM = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const RULES = [
    { key:'barebells-milkshake', label:'Barebells Milkshake', re:/^Milkshake\s+(.+?)\s+330ml\s+Barebells$/i, flavor:1, fixedSize:'330 ml' },
    { key:'nocco-bcaa', label:'NOCCO BCAA', re:/^Nocco\s+BCAA\+?\s+(.+?)\s+355ml$/i, flavor:1, fixedSize:'355 ml' },
    { key:'nocco-electrolyte', label:'NOCCO Electrolyte', re:/^Nocco\s+Electrolyte\s+(.+?)\s+355ml$/i, flavor:1, fixedSize:'355 ml' },
    { key:'nocco-focus', label:'NOCCO Focus', re:/^Nocco\s+Focus\s+(.+?)\s+330ml$/i, flavor:1, fixedSize:'330 ml' },
    { key:'protella-crema-proteina', label:'Crema de proteína Protella', re:/^Crema\s+De\s+Proteina\s+(.+?)\s+Protella\s+200g$/i, flavor:1, fixedSize:'200 g' },
    { key:'amro-harina-avena', label:'Harina de avena AMRO', re:/^Harina\s+De\s+Avena\s+(.+?)\s+1000g\s+Amro$/i, flavor:1, fixedSize:'1000 g' },
    { key:'servivita-salsa', label:'Salsa Servivita', re:/^Salsa\s+(.+?)\s+320ml\s+Servivita$/i, flavor:1, fixedSize:'320 ml', flavorLabel:'Variedad' },
    { key:'barebells-barrita', label:'Barrita proteica Barebells', re:/^Barrita\s+Proteina\s+(.+?)\s+16g\s+Barebells(?:\s+\d+)?$/i, flavor:1 },
    { key:'amro-bcaa-glutamina', label:'BCAA + Glutamina AMRO', re:/^BCAA\s+Glutamina\s+(.+?)\s+500g\s+Amro$/i, flavor:1, fixedSize:'500 g' },
    { key:'protella-colageno', label:'Colágeno Protella', re:/^Colageno\s+(.+?)\s+(180g|200g)\s+Protella$/i, flavor:1, size:2 },
    { key:'protella-creatina', label:'Creatina Monohydrate Protella', re:/^Creatina\s+Monohydrate(?:\s+(.+?))?[ ,]*(300g)\s+Protella$/i, flavor:1, size:2, emptyFlavor:'Neutro' },
    { key:'protella-crema-arroz', label:'Crema de arroz Protella', re:/^Crema\s+De\s+Arroz\s+(.+?)\s+(500g)\s+Protella$/i, flavor:1, size:2 },
    { key:'protella-mermelada', label:'Mermelada Protella', re:/^Mermelada\s+(.+?)\s+Protella\s+(170g)$/i, flavor:1, size:2 },
    { key:'amro-whey-1kg', label:'Proteína Whey AMRO 1 kg', re:/^Proteina\s+Whey\s+(?!100%)(.+?)\s+(1kg)\s+Amro$/i, flavor:1, size:2 },
    { key:'amro-whey-2kg', label:'Proteína Whey 100% AMRO 2 kg', re:/^Proteina\s+Whey\s+100%\s+(.+?)\s+(2000g)\s+Amro$/i, flavor:1, size:2 },
    { key:'amro-lcarnitine-3000', label:'L-Carnitine 3000 AMRO', re:/^L-Carnitine\s+3000\s+(.+?)\s+(500ml|20\s*x\s*25ml)\s+Amro$/i, flavor:1, size:2 }
  ];

  const SEO_INTENTS = [
    { slug:'proteinas', label:'Proteínas', categories:['Proteínas'] },
    { slug:'creatinas', label:'Creatinas', categories:['Creatinas'] },
    { slug:'pre-entrenos', label:'Pre-entrenos', categories:['Pre-entrenos'] },
    { slug:'snacks-proteicos', label:'Snacks y alimentación proteica', categories:['Barritas y snacks','Alimentación proteica'] },
    { slug:'vitaminas-y-bienestar', label:'Vitaminas y bienestar', categories:['Vitaminas y salud','Colágeno y bienestar'] },
    { slug:'bebidas', label:'Bebidas', categories:['Bebidas'] }
  ];

  const slugify = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const prettySize = (value) => String(value || '')
    .replace(/(\d)kg\b/i, '$1 kg').replace(/(\d)g\b/i, '$1 g')
    .replace(/(\d)ml\b/i, '$1 ml').replace(/\s+/g, ' ').trim();

  function fallbackSize(name) {
    const text = String(name || '');
    const multi = text.match(/\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
    if (multi) return `${multi[1]} x ${multi[2]} ${multi[3].toLowerCase()}`;
    const mass = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i);
    if (mass) {
      const n = Number(String(mass[1]).replace(',', '.'));
      const unit = mass[2].toLowerCase();
      if (unit === 'kg' || unit === 'l' || (unit === 'g' && n >= 100) || (unit === 'ml' && n >= 100)) return `${mass[1]} ${unit}`;
    }
    const count = text.match(/\b(\d+)\s*(caps|cápsulas|capsulas|perlas)\b/i);
    return count ? `${count[1]} ${count[2]}` : null;
  }

  function validGtin(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return [8, 12, 13, 14].includes(digits.length) ? digits : null;
  }

  function meta(product) {
    const explicitFamily = String(product?.parentProductId || product?.familyKey || '').trim();
    const explicitFlavor = String(product?.flavor || product?.sabor || '').trim() || null;
    const explicitSize = String(product?.size || product?.format || product?.formato || '').trim() || null;
    if (explicitFamily) {
      return {
        familyKey: explicitFamily,
        familyLabel: String(product?.familyLabel || product?.name || 'Producto'),
        flavor: explicitFlavor,
        flavorLabel: String(product?.flavorLabel || 'Sabor'),
        size: explicitSize || fallbackSize(product?.name),
        source: 'explicit'
      };
    }
    const name = String(product?.name || '');
    for (const rule of RULES) {
      const match = name.match(rule.re);
      if (!match) continue;
      const flavor = rule.flavor ? String(match[rule.flavor] || rule.emptyFlavor || '').trim() : null;
      const rawSize = rule.size ? match[rule.size] : rule.fixedSize;
      return {
        familyKey: rule.key,
        familyLabel: rule.label,
        flavor: flavor || rule.emptyFlavor || null,
        flavorLabel: rule.flavorLabel || 'Sabor',
        size: explicitSize || (rawSize ? prettySize(rawSize) : fallbackSize(name)),
        source: 'catalog-rule'
      };
    }
    return {
      familyKey: `sku-${product?.id}`,
      familyLabel: product?.name || 'Producto',
      flavor: explicitFlavor,
      flavorLabel: 'Sabor',
      size: explicitSize || fallbackSize(name),
      source: 'single-sku'
    };
  }

  function images(product) {
    const list = [];
    if (product?.image) list.push(String(product.image));
    if (Array.isArray(product?.images)) product.images.forEach(v => v && list.push(String(v)));
    return [...new Set(list)];
  }

  function normalize(product) {
    const m = meta(product);
    const gtin = validGtin(product?.ean || product?.gtin || product?.barcode);
    return {
      ...product,
      slug: slugify(product?.name || `producto-${product?.id}`),
      sku: String(product?.code || product?.sku || '').trim() || null,
      gtin,
      familyKey: m.familyKey,
      familyLabel: m.familyLabel,
      flavor: m.flavor,
      flavorLabel: m.flavorLabel,
      size: m.size,
      variantSource: m.source,
      images: images(product),
      manufacturer: String(product?.manufacturer || '').trim() || null,
      ingredients: product?.ingredients ?? null,
      allergens: product?.allergens ?? null,
      nutrition: product?.nutrition ?? null,
      directions: product?.directions ?? product?.usage ?? null,
      warnings: product?.warnings ?? null,
      legalName: String(product?.legalName || '').trim() || null,
      documentation: product?.documentation ?? null
    };
  }

  function family(product, products) {
    const current = normalize(product);
    if (current.variantSource === 'single-sku') return [{ product, meta: current }];
    return (products || []).map(p => ({ product:p, meta:normalize(p) }))
      .filter(row => row.meta.familyKey === current.familyKey)
      .sort((a,b) => String(a.meta.flavor || '').localeCompare(String(b.meta.flavor || ''), 'es') || String(a.meta.size || '').localeCompare(String(b.meta.size || ''), 'es'));
  }

  function factualDescription(product) {
    const p = normalize(product);
    const bits = [];
    if (p.brand) bits.push(`Marca ${p.brand}`);
    if (p.category) bits.push(`categoría ${p.category}`);
    if (p.flavor) bits.push(`${String(p.flavorLabel || 'Sabor').toLowerCase()} ${p.flavor}`);
    if (p.size) bits.push(`formato ${p.size}`);
    return `${p.name || 'Producto'} disponible en el catálogo Nutretium${bits.length ? `. ${bits.join(' · ')}` : '.'}`;
  }

  function audit(products) {
    const active = (products || []).filter(p => p && p.active !== false).map(normalize);
    return {
      active: active.length,
      withSku: active.filter(p => p.sku).length,
      withGtin: active.filter(p => p.gtin).length,
      withImage: active.filter(p => p.images.length).length,
      withDescription: active.filter(p => String(p.description || '').trim()).length,
      withIngredients: active.filter(p => p.ingredients).length,
      withAllergens: active.filter(p => p.allergens).length,
      withNutrition: active.filter(p => p.nutrition).length,
      missingGtin: active.filter(p => !p.gtin).map(p => p.sku || p.name),
      missingDocumentation: active.filter(p => !p.documentation).map(p => p.sku || p.name)
    };
  }

  return { RULES, SEO_INTENTS, slugify, validGtin, meta, normalize, family, factualDescription, audit };
});
