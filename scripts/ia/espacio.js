// IA reparadora — el espacio aparte. Todo se prueba ahí
// (node_modules/.cache/ia-reparador/espacio), nunca sobre el proyecto: dentro
// de node_modules los require siguen encontrando las dependencias, y ningún
// escáner del proyecto lo recorre.
'use strict';

const fs = require('fs');
const path = require('path');
const { NO_COPIAR } = require('./config');

function recorre(dir, raiz, fuera, cada) {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(raiz, abs).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (dir === raiz && fuera.has(e.name)) continue;
      recorre(abs, raiz, fuera, cada);
    } else if (e.isFile()) cada(rel, abs);
  }
}

/** Deja el espacio igual que el proyecto, copiando solo lo que ha cambiado. */
function sincroniza(ctx) {
  const vistos = new Set();
  recorre(ctx.raiz, ctx.raiz, NO_COPIAR, (rel, abs) => {
    vistos.add(rel);
    const dst = path.join(ctx.espacio, rel);
    const a = fs.statSync(abs);
    let b = null;
    try { b = fs.statSync(dst); } catch { /* nuevo */ }
    if (b && b.size === a.size && Math.trunc(b.mtimeMs) === Math.trunc(a.mtimeMs)) return;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(abs, dst);
    fs.utimesSync(dst, a.atime, a.mtime);
  });
  recorre(ctx.espacio, ctx.espacio, new Set(['node_modules']), (rel, abs) => {
    if (!vistos.has(rel)) fs.rmSync(abs, { force: true });
  });
}

function existe(dir, rel) {
  try { return fs.statSync(path.join(dir, rel)).isFile(); } catch { return false; }
}

module.exports = { recorre, sincroniza, existe };
