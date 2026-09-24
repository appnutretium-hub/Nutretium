// Etapa 6 — RELEASE.
//
// Lo que pasó revisión y QA se convierte en un parche suelto con número
// (.ia-reparador/parches/0007-…), que se prueba o se deshace por sí solo.
//
//   ensayo      el parche queda como propuesta; el proyecto no se toca
//   --aplicar   se escribe en el proyecto (con copia de seguridad y sin pisar
//               lo que hayas cambiado tú) y se vuelve a pasar la comprobación
//               ALLÍ (CA-6). Si allí falla, se deshace solo y se avisa.
'use strict';

const { pasaComprobacion, lineaDelFallo } = require('../comprobaciones');
const { llevaAlProyecto, retiraDelProyecto } = require('../cambios');
const { registra } = require('../bitacora');
const criterios = require('../criterios');
const correcciones = require('../correcciones');
const parches = require('../parches');
const tiquets = require('../tiquets');
const { escribePlan } = require('./2-plan');

/**
 * Publica. `existente` = parche ya verificado que se reutiliza; `depende` = id
 * del parche principal si este atiende su revisión (etapa 7).
 * Devuelve {resultado: 'aplicado'|'propuesto'|'fallido', parche, nota}.
 */
async function publica(ctx, caso, t, plan, propuesta, revision, { existente = null, depende = null, marcaRegistro = true } = {}) {
  const parche = existente || parches.crea(ctx, {
    caso, diagnostico: propuesta.diagnostico, cambios: propuesta.aplicado.cambios, archivos: propuesta.aplicado.archivos,
    investigacion: t?.causa ? { causa: t.causa, archivo: t.archivo, lineas: t.lineas } : null,
    verificacion: revision ? { motivo: revision.motivo, comoProbar: revision.comoProbar } : null,
    tiquet: tiquets.relativa(ctx, caso), objetivo: plan?.objetivo || null, depende,
  });

  // revertido = falló en el proyecto y se deshizo solo; atascado = falló y NO
  // se pudo deshacer (alguien tocó el archivo en ese instante): se deja
  // 'aplicado' para que --revertir lo pueda quitar, y pasa a una persona.
  let aplicada = false;
  let revertido = false;
  let atascado = false;
  let nota = null;
  if (ctx.aplicar) {
    nota = llevaAlProyecto(ctx, propuesta.aplicado.archivos);
    if (!nota) {
      const alli = await pasaComprobacion(ctx, caso.suite, ctx.raiz);
      const sigue = caso.general ? !alli.ok : alli.casos.some((c) => c.clave === caso.clave);
      if (sigue) {
        const fallo = lineaDelFallo(alli.salida).slice(0, 160);
        const noSe = retiraDelProyecto(ctx, propuesta.aplicado.archivos);
        if (noSe) { atascado = true; nota = `en el proyecto sigue fallando (${fallo}) y NO se ha podido deshacer: ${noSe}. Deshazlo con npm run ia:reparar -- --revertir ${parche.id} --aplicar`; } else { revertido = true; nota = `en el proyecto sigue fallando (${fallo}); se ha deshecho solo`; }
        if (plan) criterios.marca(plan.mapa, 'CA-6', 'no cumple', nota);
      } else {
        aplicada = true;
        if (plan) criterios.marca(plan.mapa, 'CA-6', 'cumple', `npm run ${caso.suite} en el proyecto`);
      }
    } else if (plan) criterios.marca(plan.mapa, 'CA-6', 'no cumple', nota);
  }

  const estado = revertido ? 'revertido' : aplicada || atascado ? 'aplicado' : 'propuesto';
  const extra = { estado, nota, criterios: plan?.mapa || parche.criterios || null };
  // Reutilizado: se guarda lo que se ha escrito de verdad, que es lo que
  // --revertir tiene que deshacer (el proyecto pudo cambiar desde el ensayo).
  if (existente) extra.archivos = Object.fromEntries([...propuesta.aplicado.archivos].map(([rel, a]) => [rel, { antes: a.antes, despues: a.despues }]));
  parches.actualiza(ctx, parche, extra);
  const fallido = revertido || atascado;
  if (marcaRegistro) {
    if (fallido) correcciones.marca(ctx, caso, 'sin-resolver', { huella: t?.huella, parche: parche.id, motivo: nota });
    else correcciones.marca(ctx, caso, aplicada ? 'corregido' : 'propuesto', { parche: parche.id, nota });
  }
  if (!fallido) {
    ctx.estado.reparaciones.push({
      fecha: new Date().toISOString(), parche: parche.id, comprobacion: caso.suite, fallo: caso.texto,
      diagnostico: parche.diagnostico, cambios: parche.cambios, aplicada, nota, reutilizada: Boolean(existente),
      investigacion: parche.investigacion || null, verificacion: parche.verificacion || null, probar: parche.probar,
      tiquet: parche.tiquet || null, depende, terminado: plan ? criterios.terminado(plan.mapa) : null,
    });
  }
  registra(ctx, `  RELEASE ${caso.suite} — parche ${parche.id}${depende ? ` (atiende la revisión de ${depende})` : ''} ${aplicada ? '(aplicado al proyecto)' : ctx.aplicar ? `(no aplicado: ${nota})` : '(propuesta verificada; ensayo)'}`);

  if (!depende) {
    if (plan) escribePlan(ctx, caso, t, plan);
    tiquets.escribe(ctx, caso, 6, [
      `# Release · \`${caso.suite}\` · ${caso.clave}`, '',
      `- **Parche:** ${parche.id} (\`.ia-reparador/parches/${parche.id}-…\`)${existente ? ' — reutilizado del ensayo, sin volver a preguntar a la IA' : ''}`,
      `- **Estado:** ${estado}${nota ? ` — ${nota}` : ''}`,
      `- **Criterios de aceptación:** ${plan ? (criterios.terminado(plan.mapa) ? 'todos cumplidos ✅' : 'NO todos cumplidos (ver 02-PLAN.md)') : 'ver 02-PLAN.md'}`,
      '', '## Probarlo', '', `\`\`\`\n${parche.probar}\n\`\`\``,
      ...(parche.verificacion?.comoProbar ? ['', `A mano: ${parche.verificacion.comoProbar}`] : []),
      '', '## Deshacerlo', '', aplicada || atascado ? `\`\`\`\nnpm run ia:reparar -- --revertir ${parche.id} --aplicar\n\`\`\`` : 'No hay nada que deshacer: el proyecto no se ha tocado.',
      '', '## El cambio', '', ...tiquets.cambiosMd(parche.cambios),
    ]);
  }
  return { resultado: fallido ? 'fallido' : aplicada ? 'aplicado' : 'propuesto', parche, nota };
}

module.exports = { publica };
