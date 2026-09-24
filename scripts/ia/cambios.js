// IA reparadora — aplicar y deshacer cambios. En el espacio aparte, siempre;
// en el proyecto, solo desde la etapa de release y sin pisar lo que hayas
// cambiado tú mientras tanto.
'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_CAMBIOS } = require('./config');
const { revisaCambio, sintaxisValida, normalizaRuta } = require('./guardian');

const lee = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

/** Una línea legible de lo que se cambió, para contárselo a la IA y a ti. */
const describe = (cambios) => (cambios || []).map((c) => `en ${normalizaRuta(c?.archivo)} «${String(c?.buscar).slice(0, 80)}» → «${String(c?.reemplazar).slice(0, 80)}»`).join('; ');

/**
 * Aplica un plan en el espacio aparte, pasando cada cambio por el guardián y
 * la sintaxis por node antes de escribir nada. Todo o nada.
 * Devuelve {error} o {archivos: Map rel → {antes, despues}, cambios}.
 */
function aplicaPlan(ctx, plan) {
  const cambios = Array.isArray(plan?.cambios) ? plan.cambios : [];
  if (!cambios.length) return { error: plan?.diagnostico ? `sin cambios: ${String(plan.diagnostico).slice(0, 300)}` : 'la respuesta no traía cambios' };
  if (cambios.length > MAX_CAMBIOS) return { error: `demasiados cambios (${cambios.length}); máximo ${MAX_CAMBIOS}` };
  const archivos = new Map();
  for (const c of cambios) {
    const rel = normalizaRuta(c?.archivo);
    if (!archivos.has(rel)) {
      let antes = null;
      try { if (rel && fs.statSync(path.join(ctx.espacio, rel)).isFile()) antes = lee(ctx.espacio, rel); } catch { /* no existe */ }
      archivos.set(rel, { antes, despues: antes });
    }
    const a = archivos.get(rel);
    const error = revisaCambio(c, ctx.espacio, a.despues);
    if (error) return { error };
    a.despues = a.despues.replace(c.buscar, () => c.reemplazar);
  }
  for (const [rel, a] of archivos) {
    const error = rel.endsWith('.js') ? sintaxisValida(a.despues) : null;
    if (error) return { error: `${rel}: el cambio deja el archivo con un error de sintaxis (${error})` };
  }
  for (const [rel, a] of archivos) fs.writeFileSync(path.join(ctx.espacio, rel), a.despues);
  return { archivos, cambios: cambios.map((c) => ({ archivo: normalizaRuta(c.archivo), buscar: c.buscar, reemplazar: c.reemplazar })) };
}

/** Devuelve el espacio a como estaba antes de aplicar. */
function deshace(ctx, archivos) {
  for (const [rel, a] of archivos) fs.writeFileSync(path.join(ctx.espacio, rel), a.antes);
}

/**
 * Lleva un cambio verificado al proyecto de verdad, con copia de seguridad.
 * Devuelve null si lo ha escrito, o el motivo por el que no. Todo o nada: si
 * falla a medias (un archivo borrado o bloqueado durante las horas de trabajo),
 * deja como estaban los que ya había escrito y no lanza.
 */
function llevaAlProyecto(ctx, archivos) {
  try {
    for (const [rel, a] of archivos) {
      if (lee(ctx.raiz, rel) !== a.antes) return `${rel} ha cambiado en el proyecto mientras se verificaba; no se pisa`;
    }
  } catch (error) {
    return `no se puede leer el proyecto (${String(error.code || error.message)}); no se toca nada`;
  }
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const escritos = [];
  try {
    for (const [rel, a] of archivos) {
      const copia = path.join(ctx.datos, 'copias', sello, `${rel}.bak`);
      fs.mkdirSync(path.dirname(copia), { recursive: true });
      fs.writeFileSync(copia, a.antes);
      fs.writeFileSync(path.join(ctx.raiz, rel), a.despues);
      escritos.push([rel, a]);
    }
  } catch (error) {
    for (const [rel, a] of escritos) { try { fs.writeFileSync(path.join(ctx.raiz, rel), a.antes); } catch { /* queda la copia */ } }
    return `no se pudo escribir en el proyecto (${String(error.code || error.message)}); se ha dejado como estaba`;
  }
  return null;
}

/**
 * Lo contrario, justo después de llevarlo: vuelve cada archivo a `antes` si
 * sigue exactamente como lo dejó el cambio. Devuelve null o el motivo por el
 * que no se ha podido (y entonces no toca ninguno).
 */
function retiraDelProyecto(ctx, archivos) {
  try {
    for (const [rel, a] of archivos) {
      if (lee(ctx.raiz, rel) !== a.despues) return `${rel} ha cambiado desde que se escribió; no se deshace a ciegas`;
    }
    for (const [rel, a] of archivos) fs.writeFileSync(path.join(ctx.raiz, rel), a.antes);
    return null;
  } catch (error) {
    return `no se pudo deshacer (${String(error.code || error.message)})`;
  }
}

module.exports = { aplicaPlan, deshace, llevaAlProyecto, retiraDelProyecto, describe };
