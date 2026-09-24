// IA reparadora — corrección única.
//
// Cada error (cada caso que falla, identificado por su huella) se corrige UNA
// vez y solo una. El registro vive en .ia-reparador/correcciones.json y dura
// entre sesiones:
//
//   propuesto     reparación verificada en ensayo; con --aplicar se reutiliza
//                 el mismo parche, sin volver a preguntar a la IA
//   corregido     reparación aplicada al proyecto
//   reaparecido   estaba corregido y vuelve a fallar: NO se corrige otra vez
//                 (algo lo ha deshecho, o el arreglo no era el bueno) — lo
//                 decide una persona
//   revertido     una persona deshizo el parche con --revertir: no se toca más
//   sin-resolver  agotó los intentos; solo se reintenta si alguien cambia los
//                 archivos implicados
//
// Además se recuerda cada propuesta descartada (por su huella), para no
// probar dos veces la misma.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_PREVIOS } = require('./config');
const { normalizaRuta } = require('./guardian');

const vacio = () => ({ version: 1, errores: {}, descartadas: {} });
const archivo = (ctx) => path.join(ctx.datos, 'correcciones.json');

function abre(ctx) {
  try { return { ...vacio(), ...JSON.parse(fs.readFileSync(archivo(ctx), 'utf8')) }; } catch { return vacio(); }
}

function guarda(ctx) {
  const tmp = `${archivo(ctx)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ctx.correcciones, null, 1));
  fs.renameSync(tmp, archivo(ctx));
}

function entrada(ctx, caso) {
  const e = ctx.correcciones.errores;
  if (!e[caso.clave]) e[caso.clave] = { clave: caso.clave, suite: caso.suite, caso: caso.texto, estado: 'en-curso', intentos: 0, previos: [], visto: new Date().toISOString() };
  return e[caso.clave];
}

/**
 * Qué hacer con un caso que falla:
 *   {accion: 'reparar'}      que trabajen los agentes
 *   {accion: 'reutilizar'}   aplicar el parche ya verificado (solo con --aplicar)
 *   {accion: 'saltar', motivo}
 */
function decide(ctx, caso, huella) {
  const e = ctx.correcciones.errores[caso.clave];
  if (!e) return { accion: 'reparar' };
  switch (e.estado) {
    case 'corregido':
      e.estado = 'reaparecido';
      e.reaparecido = new Date().toISOString();
      guarda(ctx);
      return { accion: 'saltar', motivo: `ya se corrigió una vez (parche ${e.parche}) y ha vuelto a fallar` };
    case 'reaparecido':
      return { accion: 'saltar', motivo: `corregido con el parche ${e.parche} y reaparecido: lo decide una persona` };
    case 'revertido':
      return { accion: 'saltar', motivo: `una persona revirtió el parche ${e.parche}` };
    case 'propuesto':
      return ctx.aplicar ? { accion: 'reutilizar', entrada: e } : { accion: 'saltar', motivo: `ya hay propuesta verificada (parche ${e.parche})` };
    case 'sin-resolver':
      if (e.huella === huella) return { accion: 'saltar', motivo: 'sin resolver; no se reintenta hasta que cambien sus archivos' };
      Object.assign(e, { estado: 'en-curso', intentos: 0, previos: [] });
      return { accion: 'reparar' };
    default:
      return e.intentos >= ctx.intentosMaximos ? { accion: 'saltar', motivo: 'intentos agotados' } : { accion: 'reparar' };
  }
}

function anotaIntento(ctx, caso) {
  entrada(ctx, caso).intentos++;
}

function anotaPrevio(ctx, caso, motivo) {
  const e = entrada(ctx, caso);
  e.previos = [...e.previos, String(motivo).slice(0, 400)].slice(-MAX_PREVIOS);
}

function marca(ctx, caso, estado, extra = {}) {
  Object.assign(entrada(ctx, caso), { estado, fecha: new Date().toISOString() }, extra);
  guarda(ctx);
}

/**
 * Marca como revertido el error de un parche (por su clave). Si el parche
 * era el de address-review, el arreglo principal sigue puesto: solo se quita
 * el seguimiento, y el error sigue como estaba.
 */
function marcaRevertido(ctx, clave, { soloSeguimiento = false } = {}) {
  const e = ctx.correcciones.errores[clave];
  if (!e) return;
  if (soloSeguimiento) e.seguimiento = null;
  else Object.assign(e, { estado: 'revertido', fecha: new Date().toISOString() });
  guarda(ctx);
}

/** Huella de una propuesta: los mismos cambios dan la misma huella. */
function huellaPlan(plan) {
  const cambios = (Array.isArray(plan?.cambios) ? plan.cambios : [])
    .map((c) => [normalizaRuta(c?.archivo), String(c?.buscar ?? ''), String(c?.reemplazar ?? '')]);
  return crypto.createHash('sha256').update(JSON.stringify(cambios)).digest('hex').slice(0, 16);
}

function yaDescartada(ctx, caso, plan) {
  return (ctx.correcciones.descartadas[caso.clave] || []).includes(huellaPlan(plan));
}

function descarta(ctx, caso, plan) {
  const d = ctx.correcciones.descartadas;
  d[caso.clave] = [...new Set([...(d[caso.clave] || []), huellaPlan(plan)])].slice(-50);
}

module.exports = { abre, guarda, entrada, decide, anotaIntento, anotaPrevio, marca, marcaRevertido, huellaPlan, yaDescartada, descarta };
