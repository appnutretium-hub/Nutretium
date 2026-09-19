/**
 * netlify/lib/catalogo.js — NUTRETIUM
 *
 * Autoridad de precios del servidor.
 *
 * Regla: el navegador dice QUÉ productos y CUÁNTAS unidades quiere; el precio
 * y el importe total los pone SIEMPRE este módulo, leyendo products-data.js.
 * Nada de lo que llegue en el cuerpo de la petición (price, amount, name…) se
 * usa para calcular el cobro. Si el navegador manda un precio que no cuadra,
 * la petición se rechaza en lugar de firmarse.
 *
 * products-data.js es el mismo archivo que carga la web, así que catálogo y
 * tienda no pueden desincronizarse: hay una única lista de precios.
 */

'use strict';

const { NUTRETIUM_PRODUCTS } = require('../../products-data.js');

const MAX_LINEAS       = 50;
const MAX_UDS_POR_LINEA = 99;

const PRODUCTOS = new Map();
for (const p of NUTRETIUM_PRODUCTS) PRODUCTOS.set(String(p.id), p);

/** Euros → céntimos enteros. Todo el cálculo va en céntimos: sin errores de coma flotante. */
function aCentimos(euros) {
  return Math.round(Number(euros) * 100);
}

/**
 * Un producto es comprable si el listado oficial le reconoce stock.
 * Mismo criterio que inStock() en app.js, pero aquí es el que manda.
 */
function hayStock(p, unidades) {
  if (p.stock === undefined || p.stock === null) return true;
  return p.stock >= unidades;
}

/**
 * Valora un carrito con los precios del catálogo.
 *
 * Cada línea debe traer `id` y `code`, y los dos tienen que apuntar al mismo
 * producto. El `code` no es redundante: es el seguro contra que el navegador
 * esté usando otra lista de productos (el respaldo de ejemplo de app.js, o un
 * catálogo servido desde Blobs) donde el id 3 no sea el id 3 de aquí. Sin esa
 * comprobación se cobraría el precio de un producto distinto al que se pidió.
 *
 * @param {Array<{id:number|string, code:string, qty:number}>} items lo que mandó el navegador
 * @returns {{ok:boolean, errores:string[], lineas:object[], totalCents:number}}
 */
function valorarCarrito(items) {
  const errores = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, errores: ['El carrito está vacío.'], lineas: [], totalCents: 0 };
  }
  if (items.length > MAX_LINEAS) {
    return { ok: false, errores: [`Un pedido no puede tener más de ${MAX_LINEAS} líneas.`], lineas: [], totalCents: 0 };
  }

  // Las unidades se acumulan por producto: un mismo artículo puede venir en
  // varias líneas (personalizaciones), y el stock se comprueba sobre el total.
  const unidadesPorProducto = new Map();
  const lineas = [];
  let totalCents = 0;

  for (const item of items) {
    const id = String((item && item.id) ?? '');
    const producto = PRODUCTOS.get(id);

    if (!producto) {
      errores.push(`Producto no reconocido (id ${id || 'ausente'}).`);
      continue;
    }
    if (String((item && item.code) ?? '') !== String(producto.code)) {
      errores.push(`El catálogo de la página está desactualizado (id ${id}).`);
      continue;
    }
    if (producto.active === false) {
      errores.push(`${producto.name} ya no está a la venta.`);
      continue;
    }

    const qty = Number(item && item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_UDS_POR_LINEA) {
      errores.push(`Cantidad no válida para ${producto.name}.`);
      continue;
    }

    const precioCents = aCentimos(producto.price);
    if (!Number.isInteger(precioCents) || precioCents <= 0) {
      errores.push(`${producto.name} no tiene precio publicado.`);
      continue;
    }

    const acumulado = (unidadesPorProducto.get(id) || 0) + qty;
    unidadesPorProducto.set(id, acumulado);
    if (!hayStock(producto, acumulado)) {
      errores.push(`No quedan suficientes unidades de ${producto.name} (disponibles: ${producto.stock}).`);
      continue;
    }

    totalCents += precioCents * qty;
    lineas.push({
      id:         producto.id,
      code:       producto.code,
      name:       producto.name,   // nombre del catálogo, no el que mandó el navegador
      category:   producto.category || null,
      qty,
      price:      precioCents / 100,
      totalLinea: (precioCents * qty) / 100,
    });
  }

  if (errores.length === 0 && totalCents <= 0) {
    errores.push('El importe del pedido es cero.');
  }

  return { ok: errores.length === 0, errores, lineas, totalCents };
}

module.exports = { valorarCarrito, aCentimos, PRODUCTOS };

