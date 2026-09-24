// IA reparadora — cada error es un tiquet con su carpeta, y cada etapa deja su
// documento numerado. Para saber qué ha pasado con un error basta con abrir la
// carpeta y leer en orden:
//
//   .ia-reparador/tiquets/test-catalogo-3f9a…/
//     01-TIQUET.md            qué falla, dónde y por qué (enriquecido)
//     02-PLAN.md              el plan y el mapa de criterios de aceptación
//     03-IMPLEMENTACION.md    cada intento, y el cambio que se quedó
//     04-REVISION.md          la revisión de código: bloqueantes y sugerencias
//     05-QA.md                qué pruebas se pasaron y con qué resultado
//     06-RELEASE.md           el parche, si se aplicó y cómo probarlo
//     07-ADDRESS-REVIEW.md    qué se hizo con las sugerencias de la revisión
'use strict';

const fs = require('fs');
const path = require('path');

const DOCUMENTOS = {
  1: '01-TIQUET.md', 2: '02-PLAN.md', 3: '03-IMPLEMENTACION.md', 4: '04-REVISION.md',
  5: '05-QA.md', 6: '06-RELEASE.md', 7: '07-ADDRESS-REVIEW.md',
};

// Solo letras, números y guiones: «test:catalogo» no es un nombre válido en Windows.
const limpio = (t) => String(t).replace(/[^\w-]+/g, '-');
const nombre = (caso) => `${limpio(caso.suite)}-${limpio(String(caso.clave).split(':').pop())}`;
const carpeta = (ctx, caso) => path.join(ctx.datos, 'tiquets', nombre(caso));
/** Ruta relativa al proyecto, para citarla en informes y parches. */
const relativa = (ctx, caso) => path.relative(ctx.raiz, carpeta(ctx, caso)).split(path.sep).join('/');

const cerca = (t) => `\`\`\`\n${String(t ?? '').replace(/```/g, "'''")}\n\`\`\``;

/** Escribe el documento de una etapa. `lineas` puede ser texto o lista de líneas. */
function escribe(ctx, caso, etapa, lineas) {
  const dir = carpeta(ctx, caso);
  fs.mkdirSync(dir, { recursive: true });
  const texto = Array.isArray(lineas) ? lineas.join('\n') : String(lineas);
  fs.writeFileSync(path.join(dir, DOCUMENTOS[etapa]), `${texto}\n`);
}

function lee(ctx, caso, etapa) {
  try { return fs.readFileSync(path.join(carpeta(ctx, caso), DOCUMENTOS[etapa]), 'utf8'); } catch { return null; }
}

/** Los cambios de un intento, para leerlos: antes y después de cada trozo. */
function cambiosMd(cambios) {
  const l = [];
  for (const c of cambios || []) l.push(`\`${c.archivo}\` — antes:`, cerca(c.buscar), 'después:', cerca(c.reemplazar), '');
  return l;
}

module.exports = { DOCUMENTOS, nombre, carpeta, relativa, escribe, lee, cerca, cambiosMd };
