'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const requestedTarget = String(process.env.NUTRETIUM_HTML_REPAIR_FILE || '').trim();
const file = requestedTarget ? path.resolve(requestedTarget) : path.join(ROOT, 'index.html');
const allowedTargets = new Set([path.join(ROOT, 'index.html'), path.join(ROOT, 'dist', 'index.html')]);
if (!allowedTargets.has(file)) throw new Error(`[repair-index-html] destino no autorizado: ${file}`);
const mode = String(process.env.NUTRETIUM_HTML_REPAIR_MODE || 'write').trim().toLowerCase();
if (!['write', 'check'].includes(mode)) throw new Error(`[repair-index-html] modo no soportado: ${mode}`);
let html = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const original = html;

if (!/<meta\s+name=["']robots["']/i.test(html)) {
  html = html.replace(/(<meta\s+name=["']description["'][^>]*>)/i,'$1\n  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />');
}
if (!/<meta\s+property=["']og:locale["']/i.test(html)) {
  html = html.replace(/(<meta\s+property=["']og:type["'][^>]*>)/i,'  <meta property="og:locale" content="es_ES" />\n$1');
}

// Rendimiento: la portada no necesita bloquear el primer render esperando una
// fuente de terceros. La familia ya tiene system-ui como fallback en Tailwind.
// Eliminamos únicamente los recursos de Google Fonts conocidos de esta página;
// no tocamos otros <link> externos que pudieran añadirse en el futuro.
html = html
  .replace(/\s*<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.googleapis\.com["']\s*\/?>/gi, '')
  .replace(/\s*<link\s+href=["']https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:[^"']+["']\s+rel=["']stylesheet["']\s*\/?>/gi, '');

// Los scripts clásicos estaban al final del body pero seguían creando una
// cascada bloqueante de descarga/ejecución. `defer` conserva el orden entre
// scripts, ejecuta antes de DOMContentLoaded y permite descargar en paralelo.
html = html.replace(/<script\b(?![^>]*\b(?:defer|async)\b)([^>]*\bsrc=["'][^"']+["'][^>]*)><\/script>/gi, '<script defer$1></script>');

// Evitar trabajo de layout/paint de tarjetas y paneles que todavía no son
// visibles. content-visibility se ignora de forma segura en navegadores que no
// lo soporten; visibility mantiene las transiciones de los modales existentes.
if (!/id=["']nutretium-perf-css["']/i.test(html)) {
  html = html.replace(/<\/head>/i, `  <style id="nutretium-perf-css">
    .modal-backdrop:not(.open), .chat-pop:not(.open) { visibility: hidden; }
    .modal-backdrop.open, .chat-pop.open { visibility: visible; }
    .product-card { content-visibility: auto; contain-intrinsic-size: 430px; }
    #about, #contact, #location, footer { content-visibility: auto; contain-intrinsic-size: 800px; }
  </style>\n</head>`);
}

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
html = html.replace(/<a\b([^>]*?)href=["']#["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, before, after, body) => {
  const attrs = `${before}${after}`;
  if (/\bonclick\s*=/i.test(attrs)) {
    const cleaned = attrs.replace(/\s*role=["'](?:button|menuitem)["']/ig, '').replace(/\s*tabindex=["']0["']/ig, '').trim();
    return `<button type="button"${cleaned ? ' ' + cleaned : ''}>${body}</button>`;
  }
  return `<a ${before}href="/"${after}>${body}</a>`;
});
html = html.replace(/<a\b([^>]*\brole=["']button["'][^>]*)>([\s\S]*?)<\/a>/gi, (full, attrs, body) => {
  if (/\bhref\s*=/i.test(attrs)) return full;
  const cleaned = attrs.replace(/\s*role=["']button["']/ig, '').replace(/\s*tabindex=["']0["']/ig, '').trim();
  return `<button type="button"${cleaned ? ' ' + cleaned : ''}>${body}</button>`;
});
html = html.replace(/<div\b([^>]*\bclass=["'][^"']*category-card[^"']*["'][^>]*\brole=["']button["'][^>]*)>([\s\S]*?)<\/div>/gi, (full, attrs, body) => {
  const cleaned = attrs.replace(/\s*role=["']button["']/ig, '').replace(/\s*tabindex=["']0["']/ig, '').trim();
  return `<button type="button" ${cleaned}>${body}</button>`;
});
html = html.replace(/<button\b(?![^>]*\btype=)([^>]*)>/gi, '<button type="button"$1>');
html = html.replace(/<label\b(?![^>]*\bfor=)([^>]*)>([\s\S]*?)<\/label>(\s*)(<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["'][^>]*>)/gi,(_full, attrs, body, ws, control, id) => `<label for="${id}"${attrs}>${body}</label>${ws}${control}`);
html = html.replace(/<label\b(?![^>]*\bfor=)([^>]*)>([\s\S]*?)<\/label>/gi, (full, attrs, body) => {
  if (/<(?:input|select|textarea)\b/i.test(body)) return full;
  return `<p${attrs}>${body}</p>`;
});
html = html.replace(/<img\b([^>]*)>/gi, (full, attrs) => {
  if (/\balt\s*=\s*["'][^"']*["']/i.test(attrs)) return full;
  const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const leaf = (src.split('/').pop() || '').split('?')[0];
  const filename = leaf.replace(/\.[a-z0-9]+$/i, '');
  const derived = filename.replace(/[-_]+/g, ' ').replace(/\b(img|image|foto|photo|webp|jpg|jpeg|png)\b/gi, '').replace(/\s+/g, ' ').trim();
  const alt = derived ? `Nutretium - ${derived}` : 'Nutretium';
  return `<img${attrs} alt="${alt.replace(/"/g, '&quot;')}">`;
});
const mainMatch = html.match(/<main\b([^>]*)>/i);
if (!mainMatch) throw new Error('Falta landmark <main>');
let mainTargetId = (mainMatch[0].match(/\bid=["']([^"']+)["']/i) || [])[1];
if (!mainTargetId) {
  mainTargetId = 'mainContent';
  html = html.replace(/<main\b([^>]*)>/i, '<main id="mainContent"$1>');
}
if (!new RegExp(`href=["']#${mainTargetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)) {
  html = html.replace(/(<body\b[^>]*>)/i,`$1\n  <a href="#${mainTargetId}" class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-brand-gold focus:text-black focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold">Saltar al contenido principal</a>`);
}
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
for (const m of html.matchAll(/<img\b([^>]*)>/gi)) if (!/\balt\s*=\s*["'][^"']*["']/i.test(m[1])) problems.push(`imagen sin alt: ${m[0].slice(0, 100)}`);
const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(m => m[1]);
const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (duplicateIds.length) problems.push(`IDs duplicados: ${duplicateIds.join(', ')}`);
for (const m of html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
  const attrs = m[1],body = m[2];
  if (!/\bfor=["'][^"']+["']/i.test(attrs) && !/<(?:input|select|textarea)\b/i.test(body)) problems.push(`label sin asociación: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
}
for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
  const attrs = m[1];
  const visible = m[2].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').replace(/&times;|&nbsp;/gi, ' ').trim();
  if (!visible && !/\baria-label=["'][^"']+["']/i.test(attrs) && !/\baria-labelledby=["'][^"']+["']/i.test(attrs)) problems.push(`botón sin nombre accesible: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
}
if (!/<header\b/i.test(html)) problems.push('falta landmark <header>');
if (!/<nav\b/i.test(html)) problems.push('falta landmark <nav>');
if (!/<footer\b/i.test(html)) problems.push('falta landmark <footer>');
if (problems.length) {
  console.error('[repair-index-html] VALIDACIÓN FALLIDA');
  for (const p of problems) console.error(' - ' + p);
  throw new Error(`[repair-index-html] ${problems.length} problema(s) de cierre HTML`);
}
if (html !== original) {
  if (mode === 'check') throw new Error('[repair-index-html] el objetivo requiere la transformación HTML determinista; ejecuta primero en modo write sobre un checkout o artefacto no persistente.');
  const iteration = Number(process.env.NUTRETIUM_HTML_REPAIR_ITERATION || 0);
  if (!Number.isInteger(iteration) || iteration < 0 || iteration >= 5) throw new Error('[repair-index-html] la transformación no alcanza un punto fijo seguro en 5 iteraciones.');
  fs.writeFileSync(file, html, 'utf8');
  console.log(`[repair-index-html] ${path.relative(ROOT,file)} reparado y validado · iteración ${iteration + 1}`);
  execFileSync(process.execPath,[__filename],{
    stdio:'inherit',
    env:{...process.env,NUTRETIUM_HTML_REPAIR_ITERATION:String(iteration + 1)}
  });
} else {
  console.log(`[repair-index-html] ${path.relative(ROOT,file)} ya cumplía las reglas auditadas`);
}
