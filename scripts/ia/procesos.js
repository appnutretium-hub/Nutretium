// IA reparadora — lanzar las pruebas: sin secretos, con tope de tiempo y
// matando el árbol entero si se cuelga.
'use strict';

const { spawn, execFileSync } = require('child_process');

// Las pruebas corren con un entorno mínimo. Dos motivos: que el resultado no
// dependa de las variables que tenga puestas quien lo lanza (en un equipo con
// COMMERCE_LIVE o REDSYS_ENV fallan pruebas que están bien), y que ningún
// secreto acabe en una salida que luego se le enseña a la IA.
const ENTORNO_PERMITIDO = ['PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'SystemDrive', 'ComSpec', 'COMSPEC', 'windir', 'WINDIR',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData', 'NUMBER_OF_PROCESSORS', 'OS', 'LANG', 'TERM', 'SHELL'];

function entornoLimpio(origen = process.env) {
  const env = {};
  for (const k of ENTORNO_PERMITIDO) if (origen[k] !== undefined) env[k] = origen[k];
  env.NO_COLOR = '1';
  return env;
}

function mataArbol(hijo) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-hijo.pid, 'SIGKILL');
  } catch { /* ya había terminado */ }
}

function lanza(comando, cwd, tiempoMs) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    let salida = '';
    let agotado = false;
    const hijo = spawn(comando, { cwd, shell: true, env: entornoLimpio(), detached: process.platform !== 'win32', windowsHide: true });
    const junta = (b) => { salida += b; if (salida.length > 400000) salida = salida.slice(-200000); };
    hijo.stdout.on('data', junta);
    hijo.stderr.on('data', junta);
    const reloj = setTimeout(() => { agotado = true; mataArbol(hijo); }, tiempoMs);
    hijo.on('error', (e) => { clearTimeout(reloj); resolver({ codigo: -1, salida: String(e.message), agotado, ms: Date.now() - inicio }); });
    hijo.on('close', (codigo) => { clearTimeout(reloj); resolver({ codigo, salida, agotado, ms: Date.now() - inicio }); });
  });
}

module.exports = { entornoLimpio, mataArbol, lanza };
