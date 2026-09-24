'use strict';
// Qué se le puede enseñar al cliente de un error.
//
// Los errores que el código lanza a propósito llevan un statusCode (o un code
// conocido) y un mensaje escrito para quien compra. El resto son fallos internos
// —nombres de almacenes, respuestas de terceros, rutas— y no deben salir en la
// respuesta: se quedan en el registro de la función y el cliente ve un texto
// genérico.
const CODES_PUBLICOS = Object.freeze({ STORE_UNAVAILABLE: 503, CONFLICT: 409 });

function respuestaError(err, porDefecto, etiqueta) {
  const code = err && CODES_PUBLICOS[err.code];
  const statusCode = Number(err && err.statusCode) || code || 500;
  const aProposito = Boolean(err && (err.statusCode || code));
  if (!aProposito) console.error(`[${etiqueta || 'función'}]`, err);
  return { statusCode, error: aProposito && err.message ? String(err.message) : porDefecto };
}

module.exports = { respuestaError };
