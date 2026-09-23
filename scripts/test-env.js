// ─────────────────────────────────────────────────────────────────────────────
// scripts/test-env.js — el entorno limpio que esperan las pruebas
//
// Las pruebas se escribieron para ejecutarse en un equipo de trabajo, donde
// ninguna variable de Netlify está puesta: cada una monta el escenario que
// quiere probar (con credenciales o sin ellas, en pruebas o en producción) y
// comprueba qué responde el servidor.
//
// Ejecutadas DENTRO de Netlify eso deja de ser cierto: el contenedor trae las
// variables reales del sitio, y las pruebas empiezan a medir la configuración
// del sitio en lugar del código. Pasaba de verdad, y de tres maneras:
//
//   · `URL=https://nutretium.com` y `COMMERCE_LIVE` hacen que
//     `security-policy.productionLike()` diga «esto es producción», así que
//     `REQUIRE_PRODUCT_COMPLIANCE` y el CSRF de personal se vuelven
//     obligatorios. El checkout contestaba 409 y la sesión interna 403 donde
//     la prueba esperaba 503 y 401 — no por un fallo, sino porque la política
//     de producción se activó a mitad de la prueba.
//
//   · `SITE_ID` y `NETLIFY_API_TOKEN` hacen que `getBlobStore()` devuelva el
//     almacén REAL del sitio publicado. Las pruebas que no piden el almacén en
//     memoria leían datos de producción (77 lecturas en test-enterprise.js):
//     su resultado dependía del contenido de la tienda en ese momento.
//
//   · `RESEND_API_KEY` y `ORDER_EMAIL_FROM` dejan el correo transaccional
//     operativo, así que una prueba que llegue al aviso de pedido enviaría
//     correo de verdad.
//
// Así que antes de nada se vuelve al punto de partida: se borran las variables
// del sitio y cada prueba pone las suyas. El mismo veredicto en el portátil,
// en GitHub Actions y dentro de Netlify.
//
// Se carga como primera línea de cada `scripts/test-*.js`, ANTES de que la
// prueba escriba en `process.env`, para no pisar lo que ella misma configura.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * Variables del sitio que cambian lo que responde el servidor. Se borran; la
 * prueba que necesite alguna la pone ella.
 *
 * No están aquí las que solo describen el despliegue sin decidir nada
 * (`COMMIT_REF`, `BRANCH`…): no alteran ninguna respuesta.
 */
const DEL_ENTORNO = [
  // ── Qué contexto es. Deciden productionLike(), y con ello el cumplimiento
  //    documental obligatorio, el CSRF de personal, MFA y HSTS.
  'CONTEXT', 'URL', 'DEPLOY_URL', 'DEPLOY_PRIME_URL', 'COMMERCE_LIVE',

  // ── Interruptores de seguridad que productionLike() ya implica, pero que
  //    también pueden venir puestos por su cuenta.
  'REQUIRE_PRODUCT_COMPLIANCE', 'COMPLIANCE_EXEMPT_SKUS',
  'REQUIRE_STAFF_MFA', 'REQUIRE_STAFF_CSRF',
  'REQUIRE_STAFF_COOKIE', 'REQUIRE_STAFF_STEP_UP',

  // ── El TPV. Hay pruebas que comprueban justo que sin estas no se firma nada.
  'REDSYS_SECRET_KEY', 'REDSYS_MERCHANT_CODE', 'REDSYS_TERMINAL', 'REDSYS_ENV',
  'REDSYS_URL_OK', 'REDSYS_URL_KO', 'REDSYS_MERCHANT_URL',

  // ── Sesiones y quién es administrador.
  'JWT_SECRET', 'ADMIN_EMAILS', 'OWNER_EMAILS', 'GITHUB_TOKEN',

  // ── El almacén: sin estas, getBlobStore() no alcanza el sitio publicado.
  'SITE_ID', 'NETLIFY_API_TOKEN', 'NETLIFY_BLOBS_CONTEXT',

  // ── Correo transaccional: que ninguna prueba pueda enviar correo real.
  'RESEND_API_KEY', 'ORDER_EMAIL_FROM', 'ORDER_NOTIFICATION_EMAIL',

  // ── Tienda: mantenimiento y política de envío.
  'MAINTENANCE_MODE',
  'SHIPPING_ENABLED', 'SHIPPING_RATE_CENTS', 'SHIPPING_FREE_FROM_CENTS',
  'SHIPPING_COUNTRY', 'SHIPPING_LABEL',
];

for (const nombre of DEL_ENTORNO) delete process.env[nombre];

module.exports = { DEL_ENTORNO };
