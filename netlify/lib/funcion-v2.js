'use strict';

/**
 * Adaptador de Functions v1 (evento Lambda) a Functions v2 (Request/Response).
 *
 * Por qué existe: con `exports.handler` Netlify ejecuta la función en modo
 * compatibilidad Lambda, y ahí Blobs solo recibe `edgeURL` (connectLambda), sin
 * `uncachedEdgeURL`. Toda lectura con `consistency:'strong'` lanza entonces
 * BlobsConsistencyError: el login no encontraba al usuario, el registro no
 * podía crearlo y el freno a la fuerza bruta respondía 429 al primer intento.
 * Las funciones v2 reciben de Netlify el contexto completo de Blobs, así que
 * la consistencia fuerte funciona sin tocar la lógica de cada función.
 *
 * Uso en cada archivo de netlify/functions:
 *   exports.handleEvent = handleEvent;             // lógica v1, la usan las pruebas
 *   exports.default = aFuncionV2(handleEvent);     // lo que despliega Netlify
 *
 * No exportes nada llamado `handler` en esos archivos: Netlify lo tomaría por
 * una función v1 y volvería el fallo de Blobs. `npm run test:funciones-v2` lo
 * comprueba en todas.
 */

const BINARIO = /^(image|audio|video)\/|application\/octet-stream|multipart\//i;

function primero(valor) {
  return Array.isArray(valor) ? valor[valor.length - 1] : valor;
}

async function eventoDesdeRequest(req, context) {
  const url = new URL(req.url);
  const headers = {};
  req.headers.forEach((valor, nombre) => { headers[nombre.toLowerCase()] = valor; });
  // El limitador y la auditoría leen la IP de esta cabecera, como en v1.
  if (!headers['x-nf-client-connection-ip'] && context && context.ip) headers['x-nf-client-connection-ip'] = String(context.ip);

  const queryStringParameters = {};
  const multiValueQueryStringParameters = {};
  url.searchParams.forEach((valor, clave) => {
    queryStringParameters[clave] = valor;
    (multiValueQueryStringParameters[clave] = multiValueQueryStringParameters[clave] || []).push(valor);
  });

  let body = null;
  let isBase64Encoded = false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const bytes = Buffer.from(await req.arrayBuffer());
    if (BINARIO.test(headers['content-type'] || '')) {
      body = bytes.toString('base64');
      isBase64Encoded = true;
    } else {
      body = bytes.toString('utf8');
    }
  }

  return {
    httpMethod: req.method,
    headers,
    multiValueHeaders: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, [v]])),
    queryStringParameters,
    multiValueQueryStringParameters,
    path: url.pathname,
    rawUrl: req.url,
    rawQuery: url.search.replace(/^\?/, ''),
    body,
    isBase64Encoded
  };
}

function responseDesdeResultado(resultado) {
  const r = resultado || { statusCode: 204 };
  const status = Number(r.statusCode) || 200;
  const headers = new Headers();
  for (const [nombre, valor] of Object.entries(r.headers || {})) {
    if (valor === undefined || valor === null) continue;
    headers.append(nombre, String(primero(valor)));
  }
  for (const [nombre, valores] of Object.entries(r.multiValueHeaders || {})) {
    headers.delete(nombre);
    for (const valor of [].concat(valores)) headers.append(nombre, String(valor));
  }
  // 204 y 304 no admiten cuerpo en la API Response.
  if (status === 204 || status === 304 || r.body === undefined || r.body === null) return new Response(null, { status, headers });
  const cuerpo = r.isBase64Encoded ? Buffer.from(String(r.body), 'base64') : String(r.body);
  return new Response(cuerpo, { status, headers });
}

function aFuncionV2(handleEvent) {
  if (typeof handleEvent !== 'function') throw new TypeError('aFuncionV2 necesita la función que atiende el evento.');
  return async function funcionV2(req, context) {
    const evento = await eventoDesdeRequest(req, context);
    const resultado = await handleEvent(evento, {});
    return responseDesdeResultado(resultado);
  };
}

module.exports = { aFuncionV2, eventoDesdeRequest, responseDesdeResultado };
