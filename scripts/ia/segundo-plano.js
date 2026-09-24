// IA reparadora — arrancarla sin ventana. Lanza el mismo programa como proceso
// aparte, oculto y desenganchado de la consola: se puede cerrar la ventana (o
// la sesión de PowerShell) y sigue trabajando. Lo que escriba va a
// .ia-reparador/salida.log.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function lanzaEnSegundoPlano(datos, argumentos) {
  fs.mkdirSync(datos, { recursive: true });
  const salida = fs.openSync(path.join(datos, 'salida.log'), 'a');
  const programa = path.join(__dirname, '..', 'ia-reparador.js');
  const hijo = spawn(process.execPath, [programa, ...argumentos.filter((a) => a !== '--segundo-plano')], {
    cwd: path.join(__dirname, '..', '..'), detached: true, windowsHide: true, stdio: ['ignore', salida, salida],
  });
  hijo.unref();
  fs.closeSync(salida);
  return hijo.pid;
}

module.exports = { lanzaEnSegundoPlano };
