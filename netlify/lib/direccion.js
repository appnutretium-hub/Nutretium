/**
 * netlify/lib/direccion.js — NUTRETIUM
 *
 * La dirección de envío: qué campos tiene, qué se acepta y cuándo está
 * completa. Vive aquí y no dentro de auth.js porque la usan DOS sitios que
 * tienen que decidir exactamente lo mismo:
 *
 *   · netlify/functions/auth.js    — al registrarse y al editar la ficha
 *   · netlify/functions/redsys.js  — al ir a cobrar, que es donde de verdad
 *                                    importa: sin dirección no hay a dónde
 *                                    mandar el pedido
 *
 * Un validador por sitio es la misma trampa que documenta CLAUDE.md con las dos
 * listas de productos: en cuanto se separan, uno deja pasar lo que el otro
 * rechaza, y aquí eso significa cobrar un pedido que no se puede enviar.
 *
 * El navegador NO es fuente de verdad: `admin.html` y la tienda pueden
 * comprobar lo que quieran para avisar antes, pero quien decide es el servidor.
 */

'use strict';

/** Campos, en el orden en que se piden y se pintan. */
const CAMPOS = ['calle', 'piso', 'cp', 'localidad', 'provincia', 'pais'];

/** Los que no pueden faltar. `piso` es opcional: no todo el mundo vive en uno. */
const OBLIGATORIOS = ['calle', 'cp', 'localidad', 'provincia', 'pais'];

const MAX = {
  calle: 120, piso: 40, cp: 10, localidad: 60, provincia: 60, pais: 60,
};

const ETIQUETAS = {
  calle: 'la calle y el número',
  piso: 'el piso o la puerta',
  cp: 'el código postal',
  localidad: 'la localidad',
  provincia: 'la provincia',
  pais: 'el país',
};

/** Solo España de momento: los envíos que anuncia la web son nacionales. */
const CP_ESPANA = /^[0-9]{5}$/;

/** Deja la dirección en su forma canónica, con todos los campos como texto. */
function normaliza(entrada) {
  const dir = {};
  const origen = entrada && typeof entrada === 'object' ? entrada : {};
  CAMPOS.forEach((campo) => { dir[campo] = String(origen[campo] ?? '').trim(); });
  if (!dir.pais) dir.pais = 'España';
  return dir;
}

/**
 * Devuelve el problema como texto, o null si la dirección vale.
 *
 * @param {object} entrada  la dirección tal cual llega
 * @returns {string|null}
 */
function revisa(entrada) {
  const dir = normaliza(entrada);

  for (const campo of OBLIGATORIOS) {
    if (!dir[campo]) return 'Falta ' + ETIQUETAS[campo] + ' de la dirección de envío.';
  }

  for (const campo of CAMPOS) {
    if (dir[campo].length > MAX[campo]) {
      return 'El campo «' + ETIQUETAS[campo] + '» no puede pasar de ' + MAX[campo] + ' caracteres.';
    }
    // Mismo motivo que en el catálogo y en el nombre del cliente: esto se pinta
    // con innerHTML en «Mi perfil» y viaja al correo del pedido.
    if (/[<>]/.test(dir[campo])) {
      return 'La dirección no puede llevar «<» ni «>».';
    }
  }

  if (!CP_ESPANA.test(dir.cp)) {
    return 'El código postal tiene que ser de cinco cifras.';
  }

  return null;
}

/** ¿Se puede enviar un pedido a esta dirección? */
const completa = (entrada) => revisa(entrada) === null;

/** Una línea legible, para el correo del pedido y para «Mi perfil». */
function comoTexto(entrada) {
  const dir = normaliza(entrada);
  const calle = [dir.calle, dir.piso].filter(Boolean).join(', ');
  return [calle, [dir.cp, dir.localidad].filter(Boolean).join(' '), dir.provincia, dir.pais]
    .filter(Boolean).join(' · ');
}

module.exports = { CAMPOS, OBLIGATORIOS, MAX, ETIQUETAS, CP_ESPANA, normaliza, revisa, completa, comoTexto };
