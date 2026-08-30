/**
 * netlify/lib/no-vendibles.js — NUTRETIUM
 *
 * Códigos que NO se publican nunca en la tienda online, con su motivo.
 *
 * Existe porque una baja hecha solo borrando la fila de la hoja volvería en
 * cuanto alguien regenerase el catálogo desde el listado del ERP, que sí trae
 * estos productos (se venden en el mostrador). Con la lista aquí, las tres vías
 * de edición —Excel, panel local y panel online— los rechazan igual.
 *
 * Vive en netlify/lib y no en sources/ por una razón práctica: el panel online
 * corre dentro de una función de Netlify, y el build borra sources/_catalogo de
 * la copia desplegada. Aquí lo tienen los tres. La regla 404 de /netlify/* en
 * netlify.toml impide que se sirva por URL.
 *
 * Para volver a publicar uno: se borra su línea. El panel lo hace por ti al
 * quitar la marca correspondiente, y avisa si intentas dar de alta un vetado.
 */

'use strict';

module.exports = [
  { codigo: "00521", motivo: "Refresco de marca ajena (Aquarius): no se vende online" },
  { codigo: "00520", motivo: "Refresco de marca ajena (Aquarius): no se vende online" },
  { codigo: "00503", motivo: "Refresco de marca ajena (Cacaolat): no se vende online" },
  { codigo: "00501", motivo: "Refresco de marca ajena (Bifrutas): no se vende online" },
  { codigo: "00519", motivo: "Refresco de marca ajena (Chupa Chups): no se vende online" },
  { codigo: "00518", motivo: "Refresco de marca ajena (Chupa Chups): no se vende online" },
  { codigo: "00514", motivo: "Refresco de marca ajena (Coca-cola): no se vende online" },
  { codigo: "00497", motivo: "Refresco de marca ajena (Coca-cola): no se vende online" },
  { codigo: "00515", motivo: "Refresco de marca ajena (Coca-cola): no se vende online" },
  { codigo: "00529", motivo: "Refresco de marca ajena (Dr Pepper): no se vende online" },
  { codigo: "00528", motivo: "Refresco de marca ajena (Dr Pepper): no se vende online" },
  { codigo: "00516", motivo: "Refresco de marca ajena (Fanta): no se vende online" },
  { codigo: "00517", motivo: "Refresco de marca ajena (Fanta): no se vende online" },
  { codigo: "00526", motivo: "Refresco de marca ajena (Kas): no se vende online" },
  { codigo: "00525", motivo: "Refresco de marca ajena (Kas): no se vende online" },
  { codigo: "00510", motivo: "Refresco de marca ajena (Loco Pinta Lenguas): no se vende online" },
  { codigo: "00522", motivo: "Refresco de marca ajena (Nestea): no se vende online" },
  { codigo: "00523", motivo: "Refresco de marca ajena (Seven Up): no se vende online" },
  { codigo: "00524", motivo: "Refresco de marca ajena (Trina): no se vende online" },
  { codigo: "00502", motivo: "Zumo envasado de marca ajena (Don Simon): no se vende online" },
  { codigo: "00506", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00505", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00508", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00513", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00512", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00511", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00509", motivo: "Energetica de marca ajena (Monster): no se vende online" },
  { codigo: "00530", motivo: "Energetica de marca ajena (Red Bull): no se vende online" },
];
