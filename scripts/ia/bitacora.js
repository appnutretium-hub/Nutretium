// IA reparadora — registro y esperas. Por defecto NO escribe en pantalla:
// trabaja sin aparecer y deja cada paso en .ia-reparador/registro.log. Con
// --detalle también se ve en la consola.
'use strict';

const fs = require('fs');
const path = require('path');

function registra(ctx, linea) {
  if (ctx.detalle && !ctx.silencioso) console.log(`[${new Date().toLocaleTimeString('es-ES')}] ${linea}`);
  try { fs.appendFileSync(path.join(ctx.datos, 'registro.log'), `${new Date().toISOString()} ${linea}\n`); } catch { /* sin disco no se para */ }
}

/**
 * ¿Hay que parar? Ctrl+C, fin del tiempo, o el archivo PARAR que deja
 * `--parar`: en segundo plano no hay ventana donde pulsar Ctrl+C.
 */
function debeParar(ctx) {
  if (ctx.parar || Date.now() >= ctx.fin) return true;
  if (fs.existsSync(path.join(ctx.datos, 'PARAR'))) {
    ctx.parar = true;
    registra(ctx, 'Petición de parada recibida (--parar).');
    return true;
  }
  return false;
}

async function espera(ctx, ms) {
  const hasta = Math.min(ctx.fin, Date.now() + ms);
  while (Date.now() < hasta && !debeParar(ctx)) await new Promise((r) => setTimeout(r, Math.max(1, Math.min(1000, hasta - Date.now()))));
}

module.exports = { registra, debeParar, espera };
