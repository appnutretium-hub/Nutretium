// IA reparadora — cada reparación es un parche suelto.
//
// .ia-reparador/parches/0007-test-catalogo.json guarda un error y solo uno: el
// caso, lo que dijo cada agente, los cambios y cada archivo antes y después. Al
// lado va un .diff para leerlo. Así se puede probar o deshacer UNA reparación
// sin tocar las demás:
//
//   npm run ia:probar -- 0007                         lo comprueba
//   npm run ia:reparar -- --revertir 0007             enseña qué desharía
//   npm run ia:reparar -- --revertir 0007 --aplicar   lo deshace
//
// Si el archivo sigue tal cual lo dejó el parche, se restaura entero. Si ha
// cambiado después (otro parche, o tú), se deshace solo el trozo del parche,
// y únicamente si ese trozo aparece una vez: si no, no se toca nada.
'use strict';

const fs = require('fs');
const path = require('path');

const carpeta = (ctx) => path.join(ctx.datos, 'parches');

function lista(ctx) {
  let nombres = [];
  try { nombres = fs.readdirSync(carpeta(ctx)).filter((n) => /^\d{4}-.*\.json$/.test(n)).sort(); } catch { /* aún no hay */ }
  return nombres.map((n) => { try { return JSON.parse(fs.readFileSync(path.join(carpeta(ctx), n), 'utf8')); } catch { return null; } }).filter(Boolean);
}

function lee(ctx, id) {
  const buscado = String(id).padStart(4, '0');
  return lista(ctx).find((p) => p.id === buscado) || null;
}

function escribe(ctx, parche) {
  fs.mkdirSync(carpeta(ctx), { recursive: true });
  const base = path.join(carpeta(ctx), `${parche.id}-${parche.suite.replace(/[^\w-]+/g, '-')}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(parche, null, 1));
  fs.writeFileSync(`${base}.diff`, diff(parche));
}

/** Diff para leer: líneas antes (-) y después (+) de cada cambio. */
function diff(parche) {
  const l = [`# Parche ${parche.id} — ${parche.suite}: ${parche.caso}`, `# ${parche.diagnostico || ''}`];
  if (parche.probar) l.push(`# Probarlo: ${parche.probar}`);
  l.push('');
  for (const c of parche.cambios) {
    const antes = parche.archivos[c.archivo]?.antes || '';
    const pos = antes.indexOf(c.buscar);
    const linea = pos < 0 ? '?' : antes.slice(0, pos).split('\n').length;
    l.push(`--- a/${c.archivo}`, `+++ b/${c.archivo}`, `@@ línea ${linea} @@`);
    for (const x of c.buscar.split('\n')) l.push(`-${x}`);
    for (const x of c.reemplazar.split('\n')) l.push(`+${x}`);
    l.push('');
  }
  return l.join('\n');
}

/** Guarda una reparación verificada como parche nuevo. Devuelve el parche. */
function crea(ctx, { caso, diagnostico, cambios, archivos, investigacion = null, verificacion = null, tiquet = null, objetivo = null, depende = null }) {
  const ultimo = lista(ctx).reduce((n, p) => Math.max(n, Number(p.id)), 0);
  const id = String(ultimo + 1).padStart(4, '0');
  const parche = {
    id,
    fecha: new Date().toISOString(),
    clave: caso.clave, suite: caso.suite, caso: caso.texto,
    diagnostico: String(diagnostico || '').slice(0, 600),
    investigacion, verificacion, tiquet, objetivo, depende,
    probar: `npm run ia:probar -- ${id}`,
    cambios,
    archivos: Object.fromEntries([...archivos].map(([rel, a]) => [rel, { antes: a.antes, despues: a.despues }])),
    estado: 'propuesto', nota: null,
  };
  escribe(ctx, parche);
  return parche;
}

function actualiza(ctx, parche, cambios) {
  Object.assign(parche, cambios);
  escribe(ctx, parche);
}

/**
 * Deshace un parche en el proyecto. Con `aplicar: false` solo dice qué haría.
 * Todo o nada: calcula todos los archivos antes de escribir el primero.
 */
function revierte(ctx, id, { aplicar = false } = {}) {
  const parche = lee(ctx, id);
  if (!parche) return { error: `No hay ningún parche ${id}.` };
  if (parche.estado === 'revertido') return { error: `El parche ${parche.id} ya está revertido.` };
  if (parche.estado !== 'aplicado') return { error: `El parche ${parche.id} no llegó a aplicarse al proyecto (estado: ${parche.estado}); no hay nada que deshacer.` };
  const encima = lista(ctx).find((p) => p.depende === parche.id && p.estado === 'aplicado');
  if (encima) return { error: `El parche ${encima.id} atiende la revisión de ${parche.id} y está aplicado encima: deshaz primero el ${encima.id}.` };

  const nuevos = new Map();
  for (const [rel, a] of Object.entries(parche.archivos)) {
    let actual;
    try { actual = fs.readFileSync(path.join(ctx.raiz, rel), 'utf8'); } catch { return { error: `${rel} ya no existe.` }; }
    if (actual === a.despues) { nuevos.set(rel, { actual, texto: a.antes, modo: 'entero' }); continue; }
    let texto = actual;
    for (const c of [...parche.cambios].reverse().filter((x) => x.archivo === rel)) {
      if (!c.reemplazar || texto.split(c.reemplazar).length - 1 !== 1) {
        return { error: `${rel} ha cambiado desde el parche y su trozo no se localiza con seguridad; deshazlo a mano (antes/después en el .json del parche).` };
      }
      texto = texto.replace(c.reemplazar, () => c.buscar);
    }
    nuevos.set(rel, { actual, texto, modo: 'trozo' });
  }

  const resumen = [...nuevos].map(([rel, n]) => `${rel} (${n.modo === 'entero' ? 'se restaura entero' : 'se deshace solo el trozo del parche'})`);
  if (!aplicar) return { ok: true, ensayo: true, parche, resumen };

  const sello = `revertir-${parche.id}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const [rel, n] of nuevos) {
    const copia = path.join(ctx.datos, 'copias', sello, `${rel}.bak`);
    fs.mkdirSync(path.dirname(copia), { recursive: true });
    fs.writeFileSync(copia, n.actual);
    fs.writeFileSync(path.join(ctx.raiz, rel), n.texto);
  }
  actualiza(ctx, parche, { estado: 'revertido', revertido: new Date().toISOString() });
  return { ok: true, ensayo: false, parche, resumen };
}

module.exports = { lista, lee, crea, actualiza, revierte, diff };
