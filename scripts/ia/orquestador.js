// IA reparadora — el bucle de horas. Autónomo: no pregunta ni enseña nada
// hasta el final, espera a Ollama si no está, y se retoma donde lo dejó.
//
//   pasa las pruebas → parte los fallos en casos → cada caso es un tiquet que
//   recorre las siete etapas de flujo.js (un tiquet, un parche; con --aplicar, tras cada reparación se vuelve a
//   empezar desde el proyecto ya reparado) → con todo en verde, revisión
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./config');
const { leeScripts, pasaTodas, pasaComprobacion, lineaDelFallo } = require('./comprobaciones');
const { sincroniza } = require('./espacio');
const { esLocal, esperaOllama } = require('./ollama');
const { registra, espera, debeParar } = require('./bitacora');
const { atiendeCaso } = require('./flujo');
const { aplicaPlan } = require('./cambios');
const { revisaSiguiente } = require('./revisor');
const estado = require('./estado');
const correcciones = require('./correcciones');
const parches = require('./parches');
const informe = require('./informe');

function preparaContexto(o = {}) {
  const raiz = path.resolve(o.raiz || C.RAIZ);
  const ollama = String(o.ollama || process.env.AI_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  if (!esLocal(ollama)) throw new Error(`Ollama tiene que estar en este equipo (127.0.0.1 o localhost), no en ${ollama}: el código del proyecto no sale de la máquina.`);
  const horas = Number(o.horas ?? 10);
  if (!(horas > 0) || horas > 72) throw new Error('--horas tiene que estar entre 0 y 72.');
  const inicio = Date.now();
  const scripts = leeScripts(raiz);
  const pedidas = o.comprobaciones || C.COMPROBACIONES;
  const ctx = {
    raiz, ollama, inicio, inicioIso: new Date(inicio).toISOString(),
    fin: o.finMs || inicio + horas * 3600 * 1000,
    modelo: String(o.modelo || process.env.AI_OLLAMA_MODEL || 'qwen3:4b').trim(),
    aplicar: Boolean(o.aplicar),
    revision: o.revision !== false,
    comprobaciones: ['sintaxis', ...pedidas.filter((n) => n !== 'sintaxis' && scripts[n])],
    datos: path.resolve(o.datos || path.join(raiz, '.ia-reparador')),
    espacio: path.resolve(o.espacio || path.join(raiz, 'node_modules', '.cache', 'ia-reparador', 'espacio')),
    intentosPorRonda: o.intentosPorRonda || C.INTENTOS_POR_RONDA,
    intentosMaximos: o.intentosMaximos || C.INTENTOS_MAXIMOS,
    tiempoPruebaMs: o.tiempoPruebaMs || C.TIEMPO_PRUEBA_MS,
    tiempoOllamaMs: o.tiempoOllamaMs || C.TIEMPO_OLLAMA_MS,
    esperaOllamaMs: o.esperaOllamaMs || C.ESPERA_OLLAMA_MS,
    esperaOllamaMaxMs: o.esperaOllamaMaxMs || C.ESPERA_OLLAMA_MAX_MS,
    repasoMs: o.repasoMs || C.REPASO_MS,
    numCtx: o.numCtx || 16384,
    maxCiclos: o.maxCiclos || Infinity,
    detalle: Boolean(o.detalle),
    silencioso: Boolean(o.silencioso),
    parar: false,
    ciclos: 0,
  };
  fs.mkdirSync(ctx.datos, { recursive: true });
  fs.mkdirSync(ctx.espacio, { recursive: true });
  if (o.reiniciar) {
    for (const f of ['estado.json', 'correcciones.json']) fs.rmSync(path.join(ctx.datos, f), { force: true });
  }
  ctx.estado = estado.lee(ctx.datos);
  ctx.correcciones = correcciones.abre(ctx);
  return ctx;
}

/** Evita dos ejecuciones a la vez sobre el mismo proyecto. */
function tomaCerrojo(ctx) {
  const cerrojo = path.join(ctx.datos, 'en-marcha.lock');
  try {
    const pid = Number(fs.readFileSync(cerrojo, 'utf8'));
    if (pid && pid !== process.pid && vivo(pid)) throw new Error(`Ya hay una IA reparadora en marcha (proceso ${pid}). Para pararla: npm run ia:reparar -- --parar`);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.writeFileSync(cerrojo, String(process.pid));
  fs.rmSync(path.join(ctx.datos, 'PARAR'), { force: true }); // una parada vieja no frena esta ejecución
  return () => { try { fs.rmSync(cerrojo, { force: true }); } catch { /* nada */ } };
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Una vuelta: pruebas, casos, agentes. Devuelve true si había algo que atender. */
async function ciclo(ctx) {
  sincroniza(ctx);
  const resultados = await pasaTodas(ctx);
  ctx.estado.ultimaPasada = resultados.map((r) => ({ nombre: r.nombre, ok: r.ok, fallo: r.ok ? null : lineaDelFallo(r.salida).slice(0, 200), casos: r.casos.map((c) => c.texto.slice(0, 200)) }));
  informe.escribe(ctx);

  const verdes = resultados.filter((r) => r.ok).map((r) => r.nombre);
  let atendidos = 0;
  for (const r of resultados.filter((x) => !x.ok)) {
    for (const caso of r.casos) {
      if (debeParar(ctx)) return true;
      let hecho;
      try { hecho = await atiendeCaso(ctx, r, caso, verdes); } catch (error) {
        // Un imprevisto en un caso (un archivo borrado a media noche) no tumba
        // diez horas de trabajo: se apunta, el espacio vuelve a ser copia del
        // proyecto y se sigue con el siguiente.
        registra(ctx, `  ERROR inesperado en ${caso.suite} «${caso.texto.slice(0, 100)}»: ${String(error?.stack || error).slice(0, 400)}`);
        sincroniza(ctx);
        hecho = 'fallido';
      }
      informe.escribe(ctx);
      if (hecho !== 'saltado') atendidos++;
      // Aplicado: el proyecto ha cambiado, así que lo demás se vuelve a medir
      // desde ahí antes de tocar nada más. Un caso, un parche, de uno en uno.
      if (hecho === 'aplicado') return true;
    }
  }
  return atendidos > 0;
}

async function ejecuta(opciones = {}) {
  const ctx = preparaContexto(opciones);
  const suelta = tomaCerrojo(ctx);
  opciones.alPreparar?.(ctx);
  try {
    registra(ctx, `IA reparadora en marcha: ${ctx.modelo}, ${ctx.aplicar ? 'APLICANDO' : 'ensayo'}, hasta ${new Date(ctx.fin).toLocaleString('es-ES')}`);
    if (!await esperaOllama(ctx)) { informe.escribe(ctx); return ctx; }

    while (!debeParar(ctx) && ctx.ciclos < ctx.maxCiclos) {
      ctx.ciclos++;
      ctx.estado.ciclos++;
      registra(ctx, `── Ciclo ${ctx.estado.ciclos}: pasando las pruebas`);
      if (await ciclo(ctx)) continue;

      // Nada que atender: revisión hasta el próximo repaso de las pruebas.
      const hasta = Math.min(ctx.fin, Date.now() + ctx.repasoMs);
      let revisados = 0;
      while (ctx.revision && Date.now() < hasta && !debeParar(ctx) && await revisaSiguiente(ctx)) { revisados++; informe.escribe(ctx); }
      if (!revisados && ctx.ciclos < ctx.maxCiclos) await espera(ctx, Math.min(5 * C.MINUTO, hasta - Date.now()));
    }
    registra(ctx, 'Terminado.');
    informe.escribe(ctx);
    return ctx;
  } finally {
    suelta();
  }
}

// ── Probar, revertir y consultar: lo que hace una persona al volver ──────────

/**
 * Prueba en un paso. Sin id: todas las comprobaciones sobre el proyecto. Con
 * id: primero la suite de ese parche; si el parche es una propuesta (ensayo),
 * se prueba aplicándolo en el espacio aparte, sin tocar el proyecto.
 */
async function probar(opciones = {}) {
  const ctx = preparaContexto({ ...opciones, horas: 1 });
  let dir = ctx.raiz;
  let orden = ctx.comprobaciones;
  let parche = null;
  if (opciones.parche) {
    parche = parches.lee(ctx, opciones.parche);
    if (!parche) throw new Error(`No hay ningún parche ${opciones.parche}. Los que hay: ${parches.lista(ctx).map((p) => p.id).join(', ') || 'ninguno'}`);
    orden = [parche.suite, ...ctx.comprobaciones.filter((n) => n !== parche.suite)];
    if (parche.estado !== 'aplicado') {
      // Una propuesta se prueba en el espacio aparte. Si atiende la revisión de
      // otro parche (etapa 7), primero va el principal, que es sobre lo que se hizo.
      sincroniza(ctx);
      const base = parche.depende && parches.lee(ctx, parche.depende);
      for (const p of [base && base.estado !== 'aplicado' ? base : null, parche].filter(Boolean)) {
        const aplicado = aplicaPlan(ctx, p);
        if (aplicado.error) { sincroniza(ctx); return { ok: false, parche, resultados: [], motivo: `el parche ${p.id} ya no se puede aplicar: ${aplicado.error}` }; }
      }
      dir = ctx.espacio;
    }
  }
  const resultados = [];
  for (const nombre of orden) {
    const r = await pasaComprobacion(ctx, nombre, dir);
    resultados.push(r);
    opciones.alResultado?.(r);
  }
  if (dir === ctx.espacio) sincroniza(ctx); // el espacio vuelve a ser copia del proyecto
  const caso = parche ? resultados[0].casos.some((c) => c.clave === parche.clave) : false;
  return { ok: resultados.every((r) => r.ok), parche, resultados, casoArreglado: parche ? !caso : null };
}

function revertir(opciones) {
  const ctx = preparaContexto({ ...opciones, horas: 1 });
  const r = parches.revierte(ctx, opciones.parche, { aplicar: opciones.aplicar });
  // Deshacer el de address-review no deshace el arreglo: el error sigue
  // corregido y solo se olvida el seguimiento.
  if (r.ok && !r.ensayo) correcciones.marcaRevertido(ctx, r.parche.clave, { soloSeguimiento: Boolean(r.parche.depende) });
  return r;
}

/** Cómo va, sin molestar a la que está en marcha. */
function consulta(opciones = {}) {
  const ctx = preparaContexto({ ...opciones, horas: 1 });
  let pid = null;
  try { pid = Number(fs.readFileSync(path.join(ctx.datos, 'en-marcha.lock'), 'utf8')); } catch { /* no hay */ }
  const lista = parches.lista(ctx);
  return {
    enMarcha: Boolean(pid && vivo(pid)), pid,
    pasada: ctx.estado.ultimaPasada || [], esperandoOllama: ctx.estado.esperandoOllama,
    parches: lista.map((p) => ({ id: p.id, suite: p.suite, caso: p.caso, estado: p.estado, probar: p.probar, tiquet: p.tiquet || null, depende: p.depende || null })),
    necesitanPersona: Object.values(ctx.correcciones.errores).filter((e) => ['reaparecido', 'sin-resolver'].includes(e.estado)),
    informe: path.join(ctx.datos, 'INFORME.md'),
  };
}

function pideParada(opciones = {}) {
  const ctx = preparaContexto({ ...opciones, horas: 1 });
  fs.writeFileSync(path.join(ctx.datos, 'PARAR'), new Date().toISOString());
  return path.join(ctx.datos, 'PARAR');
}

module.exports = { ejecuta, probar, revertir, consulta, pideParada, preparaContexto, informe };
