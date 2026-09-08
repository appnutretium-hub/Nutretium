// ─────────────────────────────────────────────────────────────────────────────
// NUTRETIUM — pruebas del TPV ANTES de tocar la pasarela del banco
//
// Las pruebas del plan de PRUEBAS_REDSYS.md (§ 5) hay que hacerlas contra
// sis-t.redsys.es con tarjeta de test, y cada intento fallido cuesta un viaje
// entero: desplegar, pagar, mirar Canales, mirar los logs. Esto comprueba antes,
// en local y en un segundo, todo lo que se puede comprobar sin el banco:
//
//   · que sin credenciales NO se firma nada (se falla cerrado);
//   · que el nº de pedido cumple el formato que exige Redsys (o SIS0051);
//   · que la firma HMAC-SHA256v1 es reproducible por una implementación
//     independiente del algoritmo (si está mal, la pasarela da SIS0042);
//   · que el importe lo pone el catálogo y no el navegador;
//   · que la notificación firmada se acepta y marca el pedido como pagado;
//   · que una notificación manipulada se RECHAZA (esto es lo que separa cobrar
//     de verdad de que cualquiera pueda darse un pedido por pagado).
//
// Usa la clave PÚBLICA del sandbox de Redsys, la que viene de ejemplo en la
// documentación. No hay ningún secreto en este archivo.
//
//   npm run test:redsys
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const crypto = require('crypto');
const path = require('path');

// Clave pública del entorno de pruebas de Redsys (aparece en su propia guía).
const CLAVE_SANDBOX = 'sq7HjrUOBfKmC576ILgskD5srU870gJ7';
const COMERCIO = '369551841';
const TERMINAL = '1';

// ─── Implementación INDEPENDIENTE del algoritmo ──────────────────────────────
// A propósito no se importa nada de netlify/: se reescribe desde la
// especificación de Redsys. Si las dos coinciden, el algoritmo está bien; si
// alguien "arregla" una, la otra lo delata.

function claveDelPedido(claveBase64, pedido) {
  const clave = Buffer.from(claveBase64, 'base64');
  const iv = Buffer.alloc(8, 0);
  const cifrador = crypto.createCipheriv('des-ede3-cbc', clave, iv);
  cifrador.setAutoPadding(false);
  const bloque = Buffer.alloc(Math.ceil(pedido.length / 8) * 8, 0);
  bloque.write(pedido, 'utf8');
  return Buffer.concat([cifrador.update(bloque), cifrador.final()]);
}

function firma(parametrosBase64, clavePedido) {
  return crypto.createHmac('sha256', clavePedido).update(parametrosBase64).digest('base64');
}

const aBase64Url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ─── Andamiaje ───────────────────────────────────────────────────────────────

let pasadas = 0;
let falladas = 0;

function compruebo(titulo, fn) {
  try {
    const detalle = fn();
    pasadas++;
    console.log(`  OK  ${titulo}${detalle ? ` — ${detalle}` : ''}`);
  } catch (err) {
    falladas++;
    console.log(`  FALLA  ${titulo}`);
    console.log(`         ${err.message}`);
  }
}

function igual(actual, esperado, que) {
  if (actual !== esperado) {
    throw new Error(`${que}: esperaba ${JSON.stringify(esperado)} y llegó ${JSON.stringify(actual)}`);
  }
}

function cierto(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

// Carga las funciones con el entorno que toque, sin arrastrar el require anterior.
function cargaFuncion(nombre, entorno) {
  const ruta = path.join(__dirname, '..', 'netlify', 'functions', `${nombre}.js`);
  Object.keys(require.cache).forEach((k) => {
    if (k.includes('netlify') || k.includes('products-data')) delete require.cache[k];
  });
  Object.keys(process.env).forEach((k) => {
    if (k.startsWith('REDSYS_') || ['URL_OK', 'URL_KO', 'MERCHANT_URL'].includes(k)) {
      delete process.env[k];
    }
  });
  Object.assign(process.env, entorno);
  return require(ruta).handler;
}

const ENTORNO_OK = {
  REDSYS_SECRET_KEY: CLAVE_SANDBOX,
  REDSYS_MERCHANT_CODE: COMERCIO,
  REDSYS_TERMINAL: TERMINAL,
  REDSYS_ENV: 'test',
};

// ─── Quién compra ────────────────────────────────────────────────────────────
//
// Desde que no hay pedidos de invitado, una petición de pago sin sesión
// responde 401 y una sin dirección de envío responde 422. Así que todas las
// pruebas de pago necesitan una cuenta detrás.

process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';

const EMAIL_CLIENTE = 'cliente@ejemplo.com';
const DIRECCION_OK = {
  calle: 'Calle la Albericia 1', piso: '3B', cp: '39012',
  localidad: 'Santander', provincia: 'Cantabria', pais: 'España',
};

// El token se genera una vez: es una cadena, y sigue valiendo aunque después se
// recargue el módulo, porque JWT_SECRET no cambia en toda la prueba.
const { signJWT } = require('../netlify/lib/jwt');
const SESION = signJWT({
  sub: 'u-prueba', email: EMAIL_CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600,
});

/**
 * Carga redsys.js y deja una cuenta con dirección en el almacén.
 *
 * La siembra va DESPUÉS de cargar a propósito: cargaFuncion() limpia el require
 * de todo lo que hay bajo netlify/, y con él la memoria donde viven los
 * usuarios cuando no hay Blobs. Sembrar antes no serviría de nada.
 */
async function cargaPago(entorno, direccion = DIRECCION_OK) {
  const handler = cargaFuncion('redsys', entorno);
  const usuarios = require(path.join(__dirname, '..', 'netlify', 'lib', 'usuarios.js'));
  await usuarios.escribe(EMAIL_CLIENTE, {
    id: 'u-prueba', name: 'Ana', surname: 'Garcia', email: EMAIL_CLIENTE,
    phone: '600 123 456', direccion,
    passwordHash: 'da-igual', createdAt: new Date().toISOString(),
  });
  return handler;
}

/** `sinSesion: true` omite el token, para poder probar justo ese caso. */
function peticion(cuerpo) {
  const { sinSesion, ...resto } = cuerpo;
  return {
    httpMethod: 'POST',
    headers: { host: 'nutretium.com', 'content-type': 'application/json' },
    body: JSON.stringify(sinSesion ? resto : { token: SESION, ...resto }),
  };
}

// Silencia los console.error/warn esperados y devuelve lo que se registró.
function capturandoConsola(fn) {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const lineas = [];
  const recoge = (...args) => lineas.push(args.join(' '));
  console.log = console.warn = console.error = recoge;
  return Promise.resolve()
    .then(fn)
    .then((valor) => ({ valor, lineas }))
    .finally(() => Object.assign(console, original));
}

// ─── Las pruebas ─────────────────────────────────────────────────────────────

async function main() {
  const { NUTRETIUM_PRODUCTS } = require('../products-data.js');
  // Dos productos con stock de sobra, para que el carrito sea válido siempre.
  //
  // `active !== false` no sobra: el catálogo lo cambia quien lleva la tienda
  // desde /admin.html, y el día que despublicó el que aquí salía elegido, esta
  // prueba se puso roja como si fallara la pasarela. La elección tiene que
  // aguantar que el catálogo cambie por debajo.
  const conStock = NUTRETIUM_PRODUCTS
    .filter((p) => p.active !== false && (p.stock === null || p.stock > 3))
    .slice(0, 2);
  const carrito = conStock.map((p) => ({ id: p.id, code: p.code, qty: 2 }));
  const totalEsperado = conStock.reduce((s, p) => s + Math.round(p.price * 100) * 2, 0);

  console.log('\n── 1. Sin credenciales no se firma nada ──');

  await (async () => {
    const handler = await cargaPago({});                  // sin REDSYS_*
    const { valor: res } = await capturandoConsola(() => handler(peticion({ items: carrito })));
    compruebo('sin REDSYS_SECRET_KEY responde 500 y no firma', () => {
      igual(res.statusCode, 500, 'código');
      cierto(!JSON.parse(res.body).Ds_Signature, 'no debe venir ninguna firma');
      return 'falla cerrado';
    });
  })();

  console.log('\n── 2. Sin cuenta o sin dirección no se cobra ──');

  await (async () => {
    const handler = await cargaPago(ENTORNO_OK);

    const sin = await handler(peticion({ items: carrito, sinSesion: true }));
    compruebo('sin sesión: 401 y ni una firma', () => {
      igual(sin.statusCode, 401, 'código');
      igual(JSON.parse(sin.body).motivo, 'sin-sesion', 'motivo');
      cierto(!JSON.parse(sin.body).Ds_Signature, 'no debe firmarse nada');
    });

    const otroSecreto = signJWT(
      { sub: 'x', email: EMAIL_CLIENTE, exp: Math.floor(Date.now() / 1000) + 3600 },
      'otro-secreto-cualquiera-de-32-caracteres');
    const falso = await handler(peticion({ items: carrito, token: otroSecreto }));
    compruebo('un token firmado con otro secreto no cuela', () => igual(falso.statusCode, 401, 'código'));

    const desconocido = signJWT(
      { sub: 'x', email: 'nadie@ejemplo.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const huerfano = await handler(peticion({ items: carrito, token: desconocido }));
    compruebo('token válido de una cuenta que no existe: 401', () => igual(huerfano.statusCode, 401, 'código'));
  })();

  await (async () => {
    // Las cuentas de antes de que la dirección fuese obligatoria llegan así.
    // `null` y no `undefined`: undefined dispararía el valor por defecto del
    // parámetro y sembraría una dirección buena, que es justo lo contrario.
    const handler = await cargaPago(ENTORNO_OK, null);
    const r = await handler(peticion({ items: carrito }));
    compruebo('con cuenta pero SIN dirección: 422 y no se firma', () => {
      igual(r.statusCode, 422, 'código');
      igual(JSON.parse(r.body).motivo, 'sin-direccion', 'motivo');
      cierto(!JSON.parse(r.body).Ds_Signature, 'no debe firmarse nada');
    });

    const mediaDireccion = await cargaPago(ENTORNO_OK, { ...DIRECCION_OK, cp: '' });
    const r2 = await mediaDireccion(peticion({ items: carrito }));
    compruebo('una dirección a medias tampoco vale', () => igual(r2.statusCode, 422, 'código'));
  })();

  console.log('\n── 3. La petición de pago ──');

  const handlerPago = await cargaPago(ENTORNO_OK);
  const res = await handlerPago(peticion({ items: carrito }));
  const cuerpo = JSON.parse(res.body);
  const parametros = JSON.parse(Buffer.from(cuerpo.Ds_MerchantParameters, 'base64').toString('utf8'));

  compruebo('responde 200 con los tres campos del formulario', () => {
    igual(res.statusCode, 200, 'código');
    cierto(cuerpo.Ds_MerchantParameters, 'falta Ds_MerchantParameters');
    cierto(cuerpo.Ds_Signature, 'falta Ds_Signature');
    igual(cuerpo.Ds_SignatureVersion, 'HMAC_SHA256_V1', 'versión de firma');
  });

  compruebo('apunta al entorno de PRUEBAS, no al real', () => {
    igual(cuerpo.redsysUrl, 'https://sis-t.redsys.es:25443/sis/realizarPago', 'URL');
  });

  compruebo('el nº de pedido cumple el formato de Redsys', () => {
    const orden = parametros.Ds_Merchant_Order;
    cierto(orden.length >= 4 && orden.length <= 12, `longitud ${orden.length}, debe ser 4-12`);
    cierto(/^\d{4}/.test(orden), `los 4 primeros deben ser numéricos: "${orden}"`);
    cierto(/^[0-9A-Za-z]+$/.test(orden), `solo alfanumérico: "${orden}"`);
    return orden;
  });

  compruebo('el importe es el del CATÁLOGO, en céntimos enteros', () => {
    igual(parametros.Ds_Merchant_Amount, String(totalEsperado), 'importe');
    return `${totalEsperado} céntimos`;
  });

  compruebo('comercio, terminal, moneda y tipo de operación', () => {
    igual(parametros.Ds_Merchant_MerchantCode, COMERCIO, 'comercio');
    igual(parametros.Ds_Merchant_Terminal, TERMINAL, 'terminal');
    igual(parametros.Ds_Merchant_Currency, '978', 'moneda');
    igual(parametros.Ds_Merchant_TransactionType, '0', 'tipo de operación');
  });

  compruebo('las tres URLs de vuelta y notificación van puestas', () => {
    cierto(/redsys-notify$/.test(parametros.Ds_Merchant_MerchantURL), 'MerchantURL');
    cierto(/result=ok$/.test(parametros.Ds_Merchant_UrlOK), 'UrlOK');
    cierto(/result=ko$/.test(parametros.Ds_Merchant_UrlKO), 'UrlKO');
    cierto(!/your-site|example\.com|localhost/.test(parametros.Ds_Merchant_MerchantURL),
      `MerchantURL con marcador de posición: ${parametros.Ds_Merchant_MerchantURL}`);
  });

  compruebo('la firma coincide con una implementación independiente', () => {
    const esperada = firma(
      cuerpo.Ds_MerchantParameters,
      claveDelPedido(CLAVE_SANDBOX, parametros.Ds_Merchant_Order)
    );
    igual(cuerpo.Ds_Signature, esperada, 'firma');
    return 'si esto falla, la pasarela daría SIS0042';
  });

  const ordenes = new Set();
  for (let i = 0; i < 40; i++) {
    const r = await handlerPago(peticion({ items: carrito }));
    ordenes.add(JSON.parse(Buffer.from(JSON.parse(r.body).Ds_MerchantParameters, 'base64').toString()).Ds_Merchant_Order);
  }
  compruebo('40 pedidos seguidos dan 40 números distintos', () => {
    igual(ordenes.size, 40, 'números únicos');
  });

  console.log('\n── 4. El navegador no pone el precio ──');

  await (async () => {
    const { valor: r } = await capturandoConsola(() =>
      handlerPago(peticion({ items: carrito, amount: 0.01 })));
    compruebo('un importe manipulado se rechaza con 409', () => {
      igual(r.statusCode, 409, 'código');
      igual(JSON.parse(r.body).totalCorrecto, totalEsperado / 100, 'total correcto devuelto');
    });
  })();

  await (async () => {
    const r = await handlerPago(peticion({ items: carrito, amount: totalEsperado / 100 }));
    compruebo('el importe correcto sí pasa', () => igual(r.statusCode, 200, 'código'));
  })();

  await (async () => {
    const agotado = NUTRETIUM_PRODUCTS.find((p) => p.stock === 0);
    if (!agotado) return;
    const { valor: r } = await capturandoConsola(() =>
      handlerPago(peticion({ items: [{ id: agotado.id, code: agotado.code, qty: 1 }] })));
    compruebo('un producto agotado no llega a firmarse', () => {
      igual(r.statusCode, 400, 'código');
      return agotado.name;
    });
  })();

  console.log('\n── 5. La notificación del banco ──');

  // Una notificación de Redsys tal cual la manda: formulario urlencoded con los
  // parámetros en Base64 y la firma en Base64 URL-safe.
  function notificacionDeRedsys(orden, respuesta, importeCents, { romperFirma = false } = {}) {
    const params = {
      Ds_Date: '22/08/2026',
      Ds_Hour: '12:00',
      Ds_Amount: String(importeCents),
      Ds_Currency: '978',
      Ds_Order: orden,
      Ds_MerchantCode: COMERCIO,
      Ds_Terminal: TERMINAL,
      Ds_Response: respuesta,
      Ds_MerchantData: '',
      Ds_SecurePayment: '1',
      Ds_TransactionType: '0',
      Ds_Card_Country: '724',
      Ds_AuthorisationCode: '123456',
    };
    const base64 = Buffer.from(JSON.stringify(params)).toString('base64');
    let firmada = aBase64Url(firma(base64, claveDelPedido(CLAVE_SANDBOX, orden)));
    if (romperFirma) firmada = aBase64Url(firma(base64, claveDelPedido(CLAVE_SANDBOX, '9999XXXXXXXX')));
    return {
      httpMethod: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        Ds_SignatureVersion: 'HMAC_SHA256_V1',
        Ds_MerchantParameters: base64,
        Ds_Signature: firmada,
      }).toString(),
    };
  }

  const handlerAviso = cargaFuncion('redsys-notify', ENTORNO_OK);
  const orden = parametros.Ds_Merchant_Order;

  await (async () => {
    const { valor: r, lineas } = await capturandoConsola(() =>
      handlerAviso(notificacionDeRedsys(orden, '0000', totalEsperado)));
    compruebo('pago autorizado (0000) → 200 y el pedido queda PAID', () => {
      igual(r.statusCode, 200, 'código');
      cierto(lineas.some((l) => l.includes('"status":"PAID"')), `no se registró PAID: ${lineas.join(' | ')}`);
    });
  })();

  await (async () => {
    const { valor: r, lineas } = await capturandoConsola(() =>
      handlerAviso(notificacionDeRedsys(orden, '0180', totalEsperado)));
    compruebo('pago denegado (0180) → 200 pero FAILED, nunca PAID', () => {
      igual(r.statusCode, 200, 'código');
      cierto(lineas.some((l) => l.includes('"status":"FAILED"')), 'debía quedar FAILED');
      cierto(!lineas.some((l) => l.includes('"status":"PAID"')), 'NO debía quedar PAID');
    });
  })();

  await (async () => {
    const { valor: r } = await capturandoConsola(() =>
      handlerAviso(notificacionDeRedsys(orden, '0099', totalEsperado)));
    compruebo('el límite 0099 sigue contando como autorizado', () => igual(r.statusCode, 200, 'código'));
  })();

  await (async () => {
    const { valor: r, lineas } = await capturandoConsola(() =>
      handlerAviso(notificacionDeRedsys(orden, '0000', totalEsperado, { romperFirma: true })));
    compruebo('firma inválida → 403 y NO se marca como pagado', () => {
      igual(r.statusCode, 403, 'código');
      cierto(!lineas.some((l) => l.includes('PAID')), 'no debe marcarse nada');
      return 'esto es lo que impide que cualquiera se dé un pedido por pagado';
    });
  })();

  await (async () => {
    // Parámetros cambiados después de firmar: el caso clásico de manipulación.
    const buena = notificacionDeRedsys(orden, '0000', totalEsperado);
    const campos = new URLSearchParams(buena.body);
    const manipulados = JSON.parse(Buffer.from(campos.get('Ds_MerchantParameters'), 'base64').toString());
    manipulados.Ds_Amount = '1';
    campos.set('Ds_MerchantParameters', Buffer.from(JSON.stringify(manipulados)).toString('base64'));
    const { valor: r } = await capturandoConsola(() =>
      handlerAviso({ ...buena, body: campos.toString() }));
    compruebo('importe cambiado tras la firma → 403', () => igual(r.statusCode, 403, 'código'));
  })();

  await (async () => {
    const handlerSinClave = cargaFuncion('redsys-notify', {});
    const { valor: r } = await capturandoConsola(() =>
      handlerSinClave(notificacionDeRedsys(orden, '0000', totalEsperado)));
    compruebo('sin REDSYS_SECRET_KEY la notificación no se da por buena', () => {
      cierto(r.statusCode >= 500, `esperaba error de servidor y llegó ${r.statusCode}`);
    });
  })();

  await (async () => {
    const handlerAviso2 = cargaFuncion('redsys-notify', ENTORNO_OK);
    const { valor: r } = await capturandoConsola(() => handlerAviso2({
      httpMethod: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'Ds_SignatureVersion=HMAC_SHA256_V1',
    }));
    compruebo('notificación sin parámetros → 400', () => igual(r.statusCode, 400, 'código'));
  })();

  // ── Resumen ──
  console.log(`\n${pasadas} correctas, ${falladas} fallidas.`);
  if (falladas) {
    console.log('\nNO lances las pruebas contra la pasarela hasta arreglar esto.');
    process.exit(1);
  }
  console.log('\nLa integración está bien por dentro. Lo que queda solo se puede');
  console.log('probar contra el banco: ver PRUEBAS_REDSYS.md § 5.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
