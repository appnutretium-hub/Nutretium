'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const original = html;

// HEAD: mantener los metadatos existentes y completar directivas seguras si faltan.
if (!/<meta\s+name=["']robots["']/i.test(html)) {
  html = html.replace(
    /(<meta\s+name=["']description["'][^>]*>)/i,
    '$1\n  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />'
  );
}
if (!/<meta\s+property=["']og:locale["']/i.test(html)) {
  html = html.replace(
    /(<meta\s+property=["']og:type["'][^>]*>)/i,
    '  <meta property="og:locale" content="es_ES" />\n$1'
  );
}

// Landmark de cabecera: agrupa cinta informativa + navegación sin alterar IDs ni JS.
if (!/<header\b/i.test(html)) {
  const promoMarker = '  <!-- ══════════════════════════════════════════\n       TOP PROMO BANNER (CINTA DE ANUNCIOS)';
  const start = html.indexOf(promoMarker);
  if (start === -1) throw new Error('No se encontró el inicio estable de la cabecera');
  const navStart = html.indexOf('<nav ', start);
  if (navStart === -1) throw new Error('No se encontró <nav> principal');
  const navEnd = html.indexOf('</nav>', navStart);
  if (navEnd === -1) throw new Error('No se encontró cierre </nav> principal');
  html = html.slice(0, start) + '  <header>\n' + html.slice(start, navEnd + 6) + '\n  </header>' + html.slice(navEnd + 6);
}

// href="#": si ejecuta una acción, debe ser botón; si es el logo, debe volver al inicio real.
html = html.replace(/<a\b([^>]*?)href=["']#["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, before, after, body) => {
  const attrs = `${before}${after}`;
  if (/\bonclick\s*=/i.test(attrs)) {
    const cleaned = attrs
      .replace(/\s*role=["'](?:button|menuitem)["']/ig, '')
      .replace(/\s*tabindex=["']0["']/ig, '')
      .trim();
    return `<button type="button"${cleaned ? ' ' + cleaned : ''}>${body}</button>`;
  }
  return `<a ${before}href="/"${after}>${body}</a>`;
});

// <a> usado como botón sin href: convertirlo en botón nativo y mantener onclick/clases.
html = html.replace(/<a\b([^>]*\brole=["']button["'][^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs, body) => {
  if (/\bhref\s*=/i.test(attrs)) return full;
  const cleaned = attrs
    .replace(/\s*role=["']button["']/ig, '')
    .replace(/\s*tabindex=["']0["']/ig, '')
    .trim();
  return `<button type="button"${cleaned ? ' ' + cleaned : ''}>${body}</button>`;
});

// Tarjetas de categoría interactivas: controles nativos, no divs con role="button".
html = html.replace(/<div\b([^>]*\bclass=["'][^"']*category-card[^"']*["'][^>]*\brole=["']button["'][^>]*)>([\s\S]*?)<\/div>/gi, (full, attrs, body) => {
  const cleaned = attrs
    .replace(/\s*role=["']button["']/ig, '')
    .replace(/\s*tabindex=["']0["']/ig, '')
    .trim();
  return `<button type="button" ${cleaned}>${body}</button>`;
});

// Todos los botones son acciones, no submits implícitos, salvo los submit declarados.
html = html.replace(/<button\b(?![^>]*\btype=)([^>]*)>/gi, '<button type="button"$1>');

// Labels: asociar los que preceden directamente a un control con id.
html = html.replace(
  /<label\b(?![^>]*\bfor=)([^>]*)>([\s\S]*?)<\/label>(\s*)(<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["'][^>]*>)/gi,
  (_full, attrs, body, ws, control, id) => `<label for="${id}"${attrs}>${body}</label>${ws}${control}`
);

// Labels puramente visuales (sin control implícito) no deben anunciarse como etiquetas de formulario.
html = html.replace(/<label\b(?![^>]*\bfor=)([^>]*)>([\s\S]*?)<\/label>/gi, (full, attrs, body) => {
  if (/<(?:input|select|textarea)\b/i.test(body)) return full;
  return `<p${attrs}>${body}</p>`;
});

// Imágenes estáticas: ninguna puede quedar sin alt. Se deriva un texto conservador del src.
html = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
  if (/\balt\s*=\s*["'][^"']*["']/i.test(attrs)) return full;
  const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const leaf = (src.split('/').pop() || '').split('?')[0];
  const filename = leaf.replace(/\.[a-z0-9]+$/i, '');
  const derived = filename
    .replace(/[-_]+/g, ' ')
    .replace(/\b(img|image|foto|photo|webp|jpg|jpeg|png)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const alt = derived ? `Nutretium - ${derived}` : 'Nutretium';
  return `<img${attrs} alt="${alt.replace(/"/g, '&quot;')}">`;
});

// Skip-link: conservar el id de <main> si ya existe para no romper JS ni crear IDs duplicados.
const mainMatch = html.match(/<main\b([^>]*)>/i);
if (!mainMatch) throw new Error('Falta landmark <main>');
let mainTargetId = (mainMatch[0].match(/\bid=["']([^"']+)["']/i) || [])[1];
if (!mainTargetId) {
  mainTargetId = 'mainContent';
  html = html.replace(/<main\b([^>]*)>/i, '<main id="mainContent"$1>');
}
if (!new RegExp(`href=["']#${mainTargetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)) {
  html = html.replace(
    /(<body\b[^>]*>)/i,
    `$1\n  <a href="#${mainTargetId}" class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-brand-gold focus:text-black focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold">Saltar al contenido principal</a>`
  );
}

// --- Validación de cierre ---
const problems = [];
const count = (re) => (html.match(re) || []).length;

if (!/^<!DOCTYPE html>/i.test(html.trimStart())) problems.push('DOCTYPE ausente o incorrecto');
if (count(/<html\b/gi) !== 1 || count(/<\/html>/gi) !== 1) problems.push('html: apertura/cierre inválidos');
if (count(/<head\b/gi) !== 1 || count(/<\/head>/gi) !== 1) problems.push('head: apertura/cierre inválidos');
if (count(/<body\b/gi) !== 1 || count(/<\/body>/gi) !== 1) problems.push('body: apertura/cierre inválidos');
if (count(/<main\b/gi) !== 1 || count(/<\/main>/gi) !== 1) problems.push('debe existir exactamente un <main>');
if (count(/<h1\b/gi) !== 1 || count(/<\/h1>/gi) !== 1) problems.push('debe existir exactamente un <h1>');
if (!/<meta\s+charset=/i.test(html)) problems.push('falta meta charset');
if (!/<meta\s+name=["']viewport["']/i.test(html)) problems.push('falta meta viewport');
if (!/<meta\s+name=["']description["']/i.test(html)) problems.push('falta meta description');
if (/href=["']#["']/i.test(html)) problems.push('quedan enlaces href="#"');
if (/<a\b(?=[^>]*\brole=["']button["'])(?![^>]*\bhref=)[^>]*>/i.test(html)) problems.push('quedan <a> sin href usados como botón');

for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
  if (!/\balt\s*=\s*["'][^"']*["']/i.test(m[1])) problems.push(`imagen sin alt: ${m[0].slice(0, 100)}`);
}

const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(m => m[1]);
const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (duplicateIds.length) problems.push(`IDs duplicados: ${duplicateIds.join(', ')}`);

for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
  const attrs = m[1];
  const body = m[2];
  if (!/\bfor=["'][^"']+["']/i.test(attrs) && !/<(?:input|select|textarea)\b/i.test(body)) {
    problems.push(`label sin asociación: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
  }
}

for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
  const attrs = m[1];
  const visible = m[2]
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&times;|&nbsp;/gi, ' ')
    .trim();
  if (!visible && !/\baria-label=["'][^"']+["']/i.test(attrs) && !/\baria-labelledby=["'][^"']+["']/i.test(attrs)) {
    problems.push(`botón sin nombre accesible: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
  }
}

if (!/<header\b/i.test(html)) problems.push('falta landmark <header>');
if (!/<nav\b/i.test(html)) problems.push('falta landmark <nav>');
if (!/<footer\b/i.test(html)) problems.push('falta landmark <footer>');

if (problems.length) {
  console.error('[repair-index-html] VALIDACIÓN FALLIDA');
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}

if (html !== original) {
  fs.writeFileSync(file, html, 'utf8');
  console.log('[repair-index-html] index.html reparado y validado');
} else {
  console.log('[repair-index-html] index.html ya cumplía las reglas auditadas');
}
