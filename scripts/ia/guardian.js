// IA reparadora — qué puede tocar la IA. Todo cambio pasa por revisaCambio()
// ANTES de aplicarse, también los que se reutilizan de un parche guardado.
'use strict';

const path = require('path');
const vm = require('vm');
const { MAX_TEXTO_CAMBIO } = require('./config');

const EXTENSIONES_EDITABLES = new Set(['.js', '.html', '.css']);
const PROHIBIDOS = [
  [/^products-data\.js$/, 'products-data.js no se edita a mano: cada campo tiene su herramienta'],
  [/^netlify\.toml$/, 'netlify.toml se ha roto tres veces editándolo con scripts'],
  [/^package(-lock)?\.json$/, 'las dependencias y los comandos no los cambia la IA'],
  [/^styles\.css$/, 'styles.css es compilado: se regenera con npm run build:css'],
  [/^(_headers|_redirects)$/, 'las cabeceras y redirecciones de seguridad no las cambia la IA'],
  [/^(node_modules|dist|sources|\.git|\.netlify|\.ia-reparador)\//, 'carpeta fuera del alcance'],
  [/(^|\/)\.env/, 'variables de entorno'],
  [/^scripts\/(ia\/|ia-|IA )/, 'la IA no se edita a sí misma'],
];

/** Las pruebas son la especificación: la IA las lee, pero no las toca. */
function esPrueba(rel) {
  return /(^|\/)tests?\//.test(rel) || /(^|\/)test-[^/]*\.js$/.test(rel) || /\.(spec|test)\.js$/.test(rel);
}

// Palabras que marcan una comprobación de seguridad. Si un cambio las quita,
// se rechaza: «hacer que pase la prueba» quitando el control es justo lo que un
// modelo pequeño propondría.
const MARCAS_SEGURIDAD = /JWT_SECRET|REDSYS_SECRET_KEY|ADMIN_EMAILS|GITHUB_TOKEN|MFA_ENCRYPTION_KEY|timingSafeEqual|statusCode\s*:\s*(401|403|503)|\b(401|403|503)\b|rolDe|requireAdmin|verif(y|ica)/g;
const SECRETO_POR_DEFECTO = /(SECRET|TOKEN|KEY|PASSWORD|PASS)\w*['"\]]?\s*\)?\s*(\|\||\?\?)\s*['"`][^'"`\s]{4,}/i;
const CODIGO_PELIGROSO = /\beval\s*\(|new\s+Function\s*\(|child_process|process\.exit\s*\(/;

const cuenta = (texto, re) => (String(texto).match(re) || []).length;

function normalizaRuta(archivo) {
  return String(archivo || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Comprueba un cambio propuesto por la IA ANTES de aplicarlo. Devuelve el
 * motivo del rechazo, o null si es aceptable. `contenido` es el archivo tal
 * como está en ese momento (con los cambios anteriores del mismo plan ya
 * aplicados).
 */
function revisaCambio(cambio, raiz, contenido) {
  if (!cambio || typeof cambio !== 'object') return 'el cambio no es un objeto';
  const rel = normalizaRuta(cambio.archivo);
  if (!rel) return 'falta «archivo»';
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split('/').includes('..')) return `${rel}: la ruta tiene que ser relativa al proyecto`;
  const destino = path.resolve(raiz, rel);
  if (!destino.startsWith(path.resolve(raiz) + path.sep)) return `${rel}: queda fuera del proyecto`;
  if (esPrueba(rel)) return `${rel}: es una prueba, y las pruebas no se tocan (si la prueba está mal, dilo en el diagnóstico)`;
  for (const [re, motivo] of PROHIBIDOS) if (re.test(rel)) return `${rel}: ${motivo}`;
  if (!EXTENSIONES_EDITABLES.has(path.extname(rel).toLowerCase())) return `${rel}: solo se editan .js, .html y .css`;
  if (contenido == null) return `${rel}: no existe (no se crean archivos nuevos)`;

  const { buscar, reemplazar } = cambio;
  if (typeof buscar !== 'string' || !buscar) return `${rel}: falta «buscar»`;
  if (typeof reemplazar !== 'string') return `${rel}: falta «reemplazar»`;
  if (buscar.length > MAX_TEXTO_CAMBIO || reemplazar.length > MAX_TEXTO_CAMBIO) return `${rel}: el cambio es demasiado grande; tiene que ser mínimo`;
  if (buscar === reemplazar) return `${rel}: «buscar» y «reemplazar» son iguales`;

  const veces = contenido.split(buscar).length - 1;
  if (veces === 0) return `${rel}: el texto de «buscar» no aparece en el archivo; cópialo exacto, con sus espacios`;
  if (veces > 1) return `${rel}: el texto de «buscar» aparece ${veces} veces; alárgalo hasta que sea único`;

  if (cuenta(reemplazar, MARCAS_SEGURIDAD) < cuenta(buscar, MARCAS_SEGURIDAD)) return `${rel}: el cambio quita una comprobación de seguridad; eso lo decide una persona`;
  if (SECRETO_POR_DEFECTO.test(reemplazar)) return `${rel}: inventa un valor por defecto para un secreto; sin credencial se falla cerrado`;
  if (CODIGO_PELIGROSO.test(reemplazar) && !CODIGO_PELIGROSO.test(buscar)) return `${rel}: introduce eval, Function, child_process o process.exit`;
  return null;
}

/** ¿Se podría editar este archivo? (sin mirar el contenido) */
function esEditable(rel, raiz) {
  return !esPrueba(rel) && revisaCambio({ archivo: rel, buscar: 'x', reemplazar: 'y' }, raiz, 'x') === null;
}

/** Sintaxis de un .js sin ejecutarlo, con el mismo envoltorio que usa Node. */
function sintaxisValida(codigo) {
  if (/^\s*(import|export)\s/m.test(codigo)) return null; // módulo ES: no aplica
  try {
    new vm.Script(`(function (exports, require, module, __filename, __dirname) {${String(codigo).replace(/^#!.*/, '')}\n})`);
    return null;
  } catch (error) {
    return error.message;
  }
}

/** Lo que devuelve la IA: JSON, a veces envuelto en ```json o con <think> delante. */
function extraeJSON(texto) {
  const limpio = String(texto || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
  try { return JSON.parse(limpio); } catch { /* sigue */ }
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (ini >= 0 && fin > ini) {
    try { return JSON.parse(limpio.slice(ini, fin + 1)); } catch { /* sigue */ }
  }
  return null;
}

module.exports = { revisaCambio, esEditable, esPrueba, normalizaRuta, sintaxisValida, extraeJSON };
