/**
 * netlify/lib/github.js — NUTRETIUM
 *
 * Escribe en el repositorio. Es la forma que tiene el panel online de publicar:
 * hace un commit con el products-data.js nuevo (y las fotos que lo acompañen) y
 * Netlify despliega solo al ver la rama moverse.
 *
 * POR QUÉ ASÍ Y NO ESCRIBIENDO EN UN ALMACÉN
 *
 * El sistema de archivos de una función de Netlify es de solo lectura y
 * efímero: no se puede editar products-data.js desde aquí, y aunque se pudiera,
 * el cambio desaparecería en el siguiente despliegue. La alternativa —guardar
 * el catálogo en Blobs y leerlo en caliente— sería una segunda fuente de
 * precios, justo lo que CLAUDE.md prohíbe. Con el commit, products-data.js
 * sigue siendo la única lista, el camino del cobro no se toca, y cada cambio
 * queda en el historial de git con vuelta atrás.
 *
 * A cambio, publicar tarda lo que tarde el despliegue (uno o dos minutos).
 *
 * Variables de entorno:
 *   GITHUB_TOKEN   token con permiso de escritura de contenido en el repo
 *   GITHUB_REPO    "propietario/repositorio" (por defecto appnutretium-hub/Nutretium)
 *   GITHUB_BRANCH  rama a la que se hace commit (por defecto main)
 *
 * Sin GITHUB_TOKEN no se publica nada: se falla cerrado, como el resto de
 * credenciales del proyecto.
 */

'use strict';

const API = 'https://api.github.com';

const repositorio = () => process.env.GITHUB_REPO || 'appnutretium-hub/Nutretium';
const rama = () => process.env.GITHUB_BRANCH || 'main';

const configurado = () => Boolean(process.env.GITHUB_TOKEN);

async function llama(ruta, opciones = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN no está configurado: el panel no puede publicar.');

  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nutretium-panel',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers,
    },
  });

  const texto = await respuesta.text();
  if (!respuesta.ok) {
    // El mensaje se le enseña a quien usa el panel: tiene que decir qué hacer.
    const detalle = (() => {
      try { return JSON.parse(texto).message; } catch { return texto.slice(0, 200); }
    })();
    if (respuesta.status === 401) throw new Error('GitHub rechaza el token: está caducado o mal copiado.');
    if (respuesta.status === 403) throw new Error(`GitHub no deja escribir: revisa los permisos del token. (${detalle})`);
    if (respuesta.status === 404) throw new Error(`No encuentro ${repositorio()} en GitHub, o el token no ve ese repositorio.`);
    if (respuesta.status === 409 || respuesta.status === 422) {
      throw new Error(`GitHub rechazó el commit: alguien ha publicado mientras editabas. Recarga y repite. (${detalle})`);
    }
    throw new Error(`GitHub respondió ${respuesta.status}: ${detalle}`);
  }
  return texto ? JSON.parse(texto) : null;
}

/**
 * Lee un archivo de la rama. Devuelve su texto.
 *
 * El panel lo usa para editar SIEMPRE la última versión del catálogo: la copia
 * que viaja dentro del paquete de la función es la del despliegue en curso, y
 * si alguien publicó hace un minuto, está atrasada.
 */
async function leeArchivo(ruta) {
  const datos = await llama(
    `/repos/${repositorio()}/contents/${encodeURI(ruta)}?ref=${encodeURIComponent(rama())}`
  );
  if (!datos.content) throw new Error(`${ruta} no es un archivo de texto en el repositorio.`);
  return Buffer.from(datos.content, 'base64').toString('utf8');
}

/**
 * Un solo commit con todos los archivos. Se usa la API de datos de git (blob →
 * árbol → commit → mover la rama) en vez de la de contenidos porque esa escribe
 * un commit por archivo: publicar un producto con foto dejaría dos despliegues
 * y un estado intermedio con el catálogo apuntando a una foto que aún no está.
 *
 * @param {object} opciones
 * @param {string} opciones.mensaje    texto del commit
 * @param {Array}  opciones.archivos   [{ruta, texto}] o [{ruta, base64}]
 * @returns {Promise<{sha:string, url:string, rama:string}>}
 */
async function publica({ mensaje, archivos }) {
  if (!archivos || !archivos.length) throw new Error('No hay nada que publicar.');

  const repo = repositorio();
  const referencia = `heads/${rama()}`;

  const ref = await llama(`/repos/${repo}/git/ref/${referencia}`);
  const commitPadre = ref.object.sha;
  const padre = await llama(`/repos/${repo}/git/commits/${commitPadre}`);

  // Los blobs se suben en paralelo: una foto de 150 KB y el catálogo de 200 KB
  // no tienen por qué esperarse el uno al otro.
  const arbol = await Promise.all(archivos.map(async ({ ruta, texto, base64 }) => {
    const blob = await llama(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify(
        base64 !== undefined
          ? { content: base64, encoding: 'base64' }
          : { content: texto, encoding: 'utf-8' }
      ),
    });
    return { path: ruta, mode: '100644', type: 'blob', sha: blob.sha };
  }));

  const arbolNuevo = await llama(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: padre.tree.sha, tree: arbol }),
  });

  const commit = await llama(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: mensaje, tree: arbolNuevo.sha, parents: [commitPadre] }),
  });

  // Sin force: si alguien ha publicado entre medias, GitHub rechaza el empujón
  // en vez de pisarle el commit. El panel dice que se recargue y se repita.
  await llama(`/repos/${repo}/git/refs/${referencia}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    sha: commit.sha,
    url: `https://github.com/${repo}/commit/${commit.sha}`,
    rama: rama(),
  };
}

module.exports = { configurado, leeArchivo, publica, repositorio, rama };
