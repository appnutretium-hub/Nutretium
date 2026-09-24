// IA reparadora — el flujo de un error, en siete etapas:
//
//   1 · tiquet          recibe el caso que falla y lo enriquece (causa, archivo, líneas)
//   2 · plan            plan en .md y mapa de criterios de aceptación
//   3 · implementación  el cambio mínimo, en el espacio aparte (guardián + sintaxis)
//   4 · revisión        revisión de código: bloqueantes vuelven a la 3, sugerencias a la 7
//   5 · QA              las pruebas: el caso arreglado, nada roto
//   6 · release         parche con número; con --aplicar, al proyecto y comprobado allí
//   7 · address-review  las sugerencias de la revisión, como parche aparte
//
// Las etapas 3 a 5 se repiten hasta que un intento cumple todo el mapa o se
// agotan los intentos. Cada etapa deja su documento en la carpeta del tiquet
// (tiquets.js). Un error, un tiquet, un parche: corrección única.
'use strict';

const { archivosDelFallo, huellaArchivos } = require('./contexto');
const { registra, debeParar } = require('./bitacora');
const { deshace, describe } = require('./cambios');
const criterios = require('./criterios');
const correcciones = require('./correcciones');
const parches = require('./parches');
const tiquets = require('./tiquets');
const { recibe, enfoca } = require('./etapas/1-tiquet');
const { planifica } = require('./etapas/2-plan');
const implementacion = require('./etapas/3-implementa');
const { revisa, sinTrampas } = require('./etapas/4-revision');
const QA = require('./etapas/5-qa');
const { publica } = require('./etapas/6-release');
const { atiende } = require('./etapas/7-address-review');

/** 03-IMPLEMENTACION.md y 04-REVISION.md: la historia de los intentos. */
function documenta(ctx, caso, intentos) {
  const l3 = [`# Implementación · \`${caso.suite}\` · ${caso.clave}`, ''];
  const l4 = [`# Revisión de código · \`${caso.suite}\` · ${caso.clave}`, ''];
  for (const x of intentos) {
    l3.push(`## Intento ${x.n} — ${x.final ? '✅ el que se quedó' : `❌ ${x.etapa}`}`, '', `**Diagnóstico:** ${x.diagnostico || '—'}`, '');
    if (x.motivo) l3.push(`**Por qué no valió:** ${x.motivo}`, '');
    l3.push(...tiquets.cambiosMd(x.cambios));
    if (!x.revision) continue;
    const r = x.revision;
    l4.push(`## Intento ${x.n} — ${r.aprobado ? '✅ aprobado' : '❌ cambios pedidos'}`, '', `**Veredicto:** ${r.motivo}`, '');
    if (r.bloqueantes.length) l4.push('**Bloqueantes** (vuelven a la implementación):', ...r.bloqueantes.map((b) => `- ${b}`), '');
    if (r.sugerencias.length) l4.push('**Sugerencias** (se atienden tras el release, etapa 7):', ...r.sugerencias.map((s) => `- ${s}`), '');
    if (r.comoProbar) l4.push(`**Cómo probarlo a mano:** ${r.comoProbar}`, '');
  }
  tiquets.escribe(ctx, caso, 3, l3);
  if (intentos.some((x) => x.revision)) tiquets.escribe(ctx, caso, 4, l4);
}

/**
 * Con --aplicar, reutiliza lo verificado en el ensayo sin volver a preguntar
 * a la IA: el parche principal y, si lo hubo, el de address-review. Pasa otra
 * vez por guardián, sinTrampas y QA, porque el proyecto puede haber cambiado.
 */
async function reutiliza(ctx, r, caso, e, verdes) {
  const guardado = parches.lee(ctx, e.parche);
  const caduca = (p, motivo) => { registra(ctx, `  el parche ${p.id} ya no vale (${motivo.slice(0, 160)}); se busca otro`); parches.actualiza(ctx, p, { estado: 'caducado', nota: motivo.slice(0, 300) }); };
  if (guardado) {
    const mapa = criterios.delPlan(criterios.base(caso, verdes, true), e.plan?.criterios);
    const aplicado = implementacion.aplica(ctx, guardado);
    const trampa = aplicado.error ? null : sinTrampas(aplicado.cambios);
    if (aplicado.error || trampa) caduca(guardado, aplicado.error || trampa);
    else {
      criterios.marca(mapa, 'CA-4', 'cumple', 'guardián y sintaxis');
      // Lo que decidió la revisión del ensayo se hereda tal cual: si allí
      // quedó pendiente, aquí también.
      for (const c of mapa.filter((x) => x.id === 'CA-5' || Number(x.id.slice(3)) > 6)) {
        const antes = (guardado.criterios || []).find((x) => x.id === c.id);
        criterios.marca(mapa, c.id, antes?.estado || 'pendiente', antes ? `en el ensayo: ${antes.detalle || antes.estado}` : 'sin revisión guardada');
      }
      const prueba = await QA.qa(ctx, caso, r, verdes, mapa);
      if (!prueba.ok) { deshace(ctx, aplicado.archivos); caduca(guardado, prueba.motivo); } else {
        const t = { ...(e.tiquet || {}), suite: caso.suite, caso: caso.texto };
        const plan = e.plan ? { ...e.plan, mapa } : null;
        const pub = await publica(ctx, caso, t, plan, { diagnostico: guardado.diagnostico, aplicado }, null, { existente: guardado });
        if (pub.resultado !== 'aplicado') { deshace(ctx, aplicado.archivos); return pub.resultado; }
        const seg = e.seguimiento && parches.lee(ctx, e.seguimiento);
        if (seg && seg.estado === 'propuesto') {
          const a2 = implementacion.aplica(ctx, seg);
          const q2 = a2.error ? { ok: false, motivo: a2.error } : await QA.qa(ctx, caso, prueba.repetida, verdes);
          if (q2.ok) { const p2 = await publica(ctx, caso, t, null, { diagnostico: seg.diagnostico, aplicado: a2 }, null, { existente: seg, depende: guardado.id, marcaRegistro: false }); if (p2.resultado !== 'aplicado') deshace(ctx, a2.archivos); } else {
            if (!a2.error) deshace(ctx, a2.archivos);
            caduca(seg, q2.motivo);
          }
        }
        return 'aplicado';
      }
    }
  }
  correcciones.marca(ctx, caso, 'en-curso', { parche: null, seguimiento: null });
  return null;
}

/**
 * Atiende un caso de principio a fin. Devuelve 'aplicado' | 'propuesto' |
 * 'saltado' | 'fallido' | 'pendiente' ('pendiente' = se cortó por tiempo o
 * parada; se retoma después, con el tiquet y el plan ya hechos).
 */
async function atiendeCaso(ctx, r, caso, verdes) {
  const archivos = archivosDelFallo(ctx, r, caso);
  const huella = huellaArchivos(ctx, archivos.editables);
  const d = correcciones.decide(ctx, caso, huella);
  if (d.accion === 'saltar') { registra(ctx, `Salto ${caso.suite} «${caso.texto.slice(0, 100)}»: ${d.motivo}`); return 'saltado'; }

  registra(ctx, `Tiquet ${caso.suite}: ${caso.texto.slice(0, 160)}`);
  if (d.accion === 'reutilizar') {
    const hecho = await reutiliza(ctx, r, caso, d.entrada, verdes);
    if (hecho) return hecho;
  }
  if (!archivos.editables.length) {
    correcciones.marca(ctx, caso, 'sin-resolver', { huella, motivo: 'no se ha encontrado ningún archivo editable relacionado con el fallo' });
    return 'saltado';
  }
  const e = correcciones.entrada(ctx, caso);

  // 1 · tiquet y 2 · plan: una vez por error, mientras no cambien sus archivos.
  if (debeParar(ctx)) return 'pendiente';
  const t = await recibe(ctx, r, caso, archivos, e, huella);
  if (!t) return 'pendiente';
  correcciones.guarda(ctx);
  registra(ctx, `  1 tiquet: ${t.causa ? `${t.causa.slice(0, 160)}${t.archivo ? ` (${t.archivo})` : ''}` : 'sin causa clara; se sigue con la salida'}`);
  const plan = await planifica(ctx, caso, t, e, verdes);
  if (!plan) return 'pendiente';
  correcciones.guarda(ctx);
  registra(ctx, `  2 plan: ${plan.objetivo.slice(0, 160)} · ${plan.mapa.length} criterios`);
  const enfocados = enfoca(archivos, t);

  const intentos = [];
  const pasadas = [];
  const noVale = (x, etapa, motivo, propuesta, archivosAplicados) => {
    if (archivosAplicados) deshace(ctx, archivosAplicados);
    Object.assign(x, { etapa, motivo });
    registra(ctx, `  intento ${x.n}: no vale en ${etapa} — ${motivo.slice(0, 200)}`);
    correcciones.descarta(ctx, caso, propuesta);
    correcciones.anotaPrevio(ctx, caso, `${x.cambios?.length ? `aplicaste ${describe(x.cambios)}; ` : ''}${etapa}: ${motivo}`);
    documenta(ctx, caso, intentos);
  };

  for (let i = 0; i < ctx.intentosPorRonda && e.intentos < ctx.intentosMaximos; i++) {
    if (debeParar(ctx)) return 'pendiente';
    correcciones.anotaIntento(ctx, caso);
    criterios.reinicia(plan.mapa);

    // 3 · implementación
    const propuesta = await implementacion.propone(ctx, r, caso, enfocados, t, plan, e.previos);
    if (propuesta == null) return 'pendiente';
    if (propuesta.invalido) { correcciones.anotaPrevio(ctx, caso, 'la respuesta no era JSON válido'); continue; }
    if (correcciones.yaDescartada(ctx, caso, propuesta)) {
      registra(ctx, `  intento ${e.intentos}: propuesta repetida, ya probada y descartada`);
      correcciones.anotaPrevio(ctx, caso, `propusiste exactamente lo mismo que ya se probó y se descartó: ${describe(propuesta.cambios)}`);
      continue;
    }
    const x = { n: e.intentos, diagnostico: String(propuesta.diagnostico || ''), cambios: propuesta.cambios };
    intentos.push(x);
    const aplicado = implementacion.aplica(ctx, propuesta);
    if (aplicado.error) { criterios.marca(plan.mapa, 'CA-4', 'no cumple', aplicado.error); noVale(x, '3 · implementación', aplicado.error, propuesta); continue; }
    criterios.marca(plan.mapa, 'CA-4', 'cumple', 'guardián y sintaxis');
    x.cambios = aplicado.cambios;

    // 4 · revisión de código
    const revision = await revisa(ctx, t, plan, { diagnostico: x.diagnostico, cambios: aplicado.cambios });
    x.revision = revision;
    if (!revision.aprobado) { noVale(x, '4 · revisión', `la revisión pide cambios: ${revision.bloqueantes.join('; ')}`, propuesta, aplicado.archivos); continue; }

    // 5 · QA
    const prueba = await QA.qa(ctx, caso, r, verdes, plan.mapa);
    pasadas.push({ intento: x.n, ...prueba });
    QA.escribe(ctx, caso, pasadas);
    if (!prueba.ok) { noVale(x, '5 · QA', prueba.motivo, propuesta, aplicado.archivos); continue; }

    // 6 · release
    x.final = true;
    documenta(ctx, caso, intentos);
    const pub = await publica(ctx, caso, t, plan, { diagnostico: x.diagnostico, aplicado }, revision);
    if (pub.resultado === 'fallido') { deshace(ctx, aplicado.archivos); return 'fallido'; }

    // 7 · address-review (el espacio tiene el principal aplicado). Con
    // --aplicar, solo si el principal está en el proyecto: sin él, el
    // seguimiento se escribiría sobre un código que no es en el que se probó.
    const sinBase = ctx.aplicar && pub.resultado !== 'aplicado';
    const seg = sinBase ? null : await atiende(ctx, { r, caso, archivos: enfocados, t, plan, revision, principal: pub.parche, qaPrincipal: prueba, verdes, e });
    if (seg) pasadas.push({ etiqueta: `address-review (parche ${seg.parche.id})`, ok: true, suites: [], motivo: null });
    // En ensayo (o si no se pudo aplicar), cada tiquet parte del proyecto tal cual.
    if (seg && seg.parche.estado !== 'aplicado') deshace(ctx, seg.aplicado.archivos);
    if (pub.resultado !== 'aplicado') deshace(ctx, aplicado.archivos);
    return pub.resultado;
  }

  if (e.intentos >= ctx.intentosMaximos) correcciones.marca(ctx, caso, 'sin-resolver', { huella, motivo: e.previos[e.previos.length - 1] || 'sin propuesta válida' });
  else correcciones.guarda(ctx);
  return 'fallido';
}

module.exports = { atiendeCaso };
