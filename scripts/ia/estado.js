// IA reparadora — estado entre ejecuciones (.ia-reparador/estado.json): lo
// revisado, los hallazgos y las reparaciones. Se escribe de forma atómica para
// que un corte de luz no lo deje a medias.
'use strict';

const fs = require('fs');
const path = require('path');

function vacio() {
  return { version: 2, llamadas: 0, ciclos: 0, reparaciones: [], revisados: {}, hallazgos: {}, ultimaPasada: [], esperandoOllama: null, minutosEsperandoOllama: 0 };
}

function lee(datos) {
  try { return { ...vacio(), ...JSON.parse(fs.readFileSync(path.join(datos, 'estado.json'), 'utf8')) }; } catch { return vacio(); }
}

function guarda(ctx) {
  const tmp = path.join(ctx.datos, 'estado.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(ctx.estado, null, 1));
  fs.renameSync(tmp, path.join(ctx.datos, 'estado.json'));
}

module.exports = { vacio, lee, guarda };
