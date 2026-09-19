/* NUTRETIUM — variantes de producto derivadas de SKUs reales del catálogo.
   No inventa sabores ni formatos. Solo agrupa patrones explícitos conocidos. */
(function (root) {
  'use strict';

  const RULES = [
    { key:'barebells-milkshake', label:'Barebells Milkshake', re:/^Milkshake\s+(.+?)\s+330ml\s+Barebells$/i, flavor:1, fixedSize:'330 ml' },
    { key:'nocco-bcaa', label:'NOCCO BCAA', re:/^Nocco\s+BCAA\+?\s+(.+?)\s+355ml$/i, flavor:1, fixedSize:'355 ml' },
    { key:'nocco-electrolyte', label:'NOCCO Electrolyte', re:/^Nocco\s+Electrolyte\s+(.+?)\s+355ml$/i, flavor:1, fixedSize:'355 ml' },
    { key:'nocco-focus', label:'NOCCO Focus', re:/^Nocco\s+Focus\s+(.+?)\s+330ml$/i, flavor:1, fixedSize:'330 ml' },
    { key:'protella-crema-proteina', label:'Crema de proteína Protella', re:/^Crema\s+De\s+Proteina\s+(.+?)\s+Protella\s+200g$/i, flavor:1, fixedSize:'200 g' },
    { key:'amro-harina-avena', label:'Harina de avena AMRO', re:/^Harina\s+De\s+Avena\s+(.+?)\s+1000g\s+Amro$/i, flavor:1, fixedSize:'1000 g' },
    { key:'servivita-salsa', label:'Salsa Servivita', re:/^Salsa\s+(.+?)\s+320ml\s+Servivita$/i, flavor:1, fixedSize:'320 ml', flavorLabel:'Variedad' },
    { key:'barebells-barrita', label:'Barrita proteica Barebells', re:/^Barrita\s+Proteina\s+(.+?)\s+16g\s+Barebells(?:\s+\d+)?$/i, flavor:1, fixedSize:null },
    { key:'amro-bcaa-glutamina', label:'BCAA + Glutamina AMRO', re:/^BCAA\s+Glutamina\s+(.+?)\s+500g\s+Amro$/i, flavor:1, fixedSize:'500 g' },
    { key:'protella-colageno', label:'Colágeno Protella', re:/^Colageno\s+(.+?)\s+(180g|200g)\s+Protella$/i, flavor:1, size:2 },
    { key:'protella-creatina', label:'Creatina Monohydrate Protella', re:/^Creatina\s+Monohydrate(?:\s+(.+?))?[ ,]*(300g)\s+Protella$/i, flavor:1, size:2, emptyFlavor:'Neutro' },
    { key:'protella-crema-arroz', label:'Crema de arroz Protella', re:/^Crema\s+De\s+Arroz\s+(.+?)\s+(500g)\s+Protella$/i, flavor:1, size:2 },
    { key:'protella-mermelada', label:'Mermelada Protella', re:/^Mermelada\s+(.+?)\s+Protella\s+(170g)$/i, flavor:1, size:2 },
    { key:'amro-whey-1kg', label:'Proteína Whey AMRO 1 kg', re:/^Proteina\s+Whey\s+(?!100%)(.+?)\s+(1kg)\s+Amro$/i, flavor:1, size:2 },
    { key:'amro-whey-2kg', label:'Proteína Whey 100% AMRO 2 kg', re:/^Proteina\s+Whey\s+100%\s+(.+?)\s+(2000g)\s+Amro$/i, flavor:1, size:2 },
    { key:'amro-lcarnitine-3000', label:'L-Carnitine 3000 AMRO', re:/^L-Carnitine\s+3000\s+(.+?)\s+(500ml|20\s*x\s*25ml)\s+Amro$/i, flavor:1, size:2 },
  ];

  const prettySize = (value) => String(value || '')
    .replace(/(\d)kg\b/i, '$1 kg')
    .replace(/(\d)g\b/i, '$1 g')
    .replace(/(\d)ml\b/i, '$1 ml')
    .replace(/\s+/g, ' ')
    .trim();

  function fallbackSize(name) {
    const text = String(name || '');
    const multi = text.match(/\b(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|g)\b/i);
    if (multi) return `${multi[1]} x ${multi[2]} ${multi[3].toLowerCase()}`;
    const mass = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i);
    if (mass) {
      const n = Number(String(mass[1]).replace(',', '.'));
      const unit = mass[2].toLowerCase();
      // Evita presentar como tamaño valores pequeños que pueden ser proteína por barrita/ración.
      if (unit === 'kg' || unit === 'l' || (unit === 'g' && n >= 100) || (unit === 'ml' && n >= 100)) {
        return `${mass[1]} ${unit}`;
      }
    }
    const count = text.match(/\b(\d+)\s*(caps|cápsulas|capsulas|perlas)\b/i);
    if (count) return `${count[1]} ${count[2]}`;
    return null;
  }

  function meta(product) {
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
        size: rawSize ? prettySize(rawSize) : fallbackSize(name),
        ruleMatched: true,
      };
    }
    return {
      familyKey: `sku-${product?.id}`,
      familyLabel: product?.name || 'Producto',
      flavor: null,
      flavorLabel: 'Sabor',
      size: fallbackSize(name),
      ruleMatched: false,
    };
  }

  function family(product, products) {
    const current = meta(product);
    if (!current.ruleMatched) return [{ product, meta: current }];
    return (products || [])
      .map(p => ({ product:p, meta:meta(p) }))
      .filter(row => row.meta.familyKey === current.familyKey)
      .sort((a,b) => {
        const fs = String(a.meta.flavor || '').localeCompare(String(b.meta.flavor || ''), 'es');
        return fs || String(a.meta.size || '').localeCompare(String(b.meta.size || ''), 'es');
      });
  }

  function factualDescription(product) {
    const m = meta(product);
    const bits = [];
    if (product?.brand) bits.push(`Marca ${product.brand}`);
    if (product?.category) bits.push(`categoría ${product.category}`);
    if (m.flavor) bits.push(`${m.flavorLabel.toLowerCase()} ${m.flavor}`);
    if (m.size) bits.push(`formato ${m.size}`);
    const facts = bits.length ? ` ${bits.join(' · ')}.` : '';
    return `${product?.name || 'Producto'} disponible en el catálogo Nutretium.${facts}`;
  }

  root.NUTRETIUM_VARIANTS = { rules:RULES, meta, family, factualDescription };
})(typeof window !== 'undefined' ? window : globalThis);
