/**
 * netlify/lib/legal.js — NUTRETIUM
 * Cláusulas informativas de protección de datos facilitadas por ACPD.
 * Textos literales: no reescribir sin pasar por la asesoría.
 *
 *   FALDON_FACTURA    · hoja «Facturas» (versión normal) → pie del PDF de factura
 *   FIRMA_EMAIL_HTML  · hoja «Firma correo electrónico»  → pie de todo email saliente
 */
'use strict';

const RESPONSABLE = 'BAHÍA NORTE CAPITAL S.L. (NUTRETIUM)';
const DOMICILIO = 'CALLE ALBERICIA 1 BAJO, 39012, SANTANDER (CANTABRIA)';
const EMAIL_DERECHOS = 'nutretium@gmail.com';

const FALDON_FACTURA = `PROTECCION DE DATOS: En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), se informa de que los datos personales facilitados serán tratados por: Responsable del tratamiento: ${RESPONSABLE} Finalidad: Gestionar la prestación de los servicios o productos contratados, la relación contractual, las gestiones administrativas y de facturación correspondientes, así como remitir información relacionada con los servicios o productos contratados. Legitimación: La ejecución de la relación contractual (art. 6.1.b RGPD) y el cumplimiento de obligaciones legales aplicables al responsable del tratamiento (art. 6.1.c RGPD). Conservación: Los datos serán conservados mientras se mantenga la relación contractual y, posteriormente, durante los plazos legalmente exigibles. Destinatarios: No se prevén comunicaciones de datos a terceros, salvo obligación legal. Derechos: Puede ejercer sus derechos dirigiéndose a ${EMAIL_DERECHOS} o a los datos de contacto del responsable indicados en el presente documento. También, puede presentar una reclamación ante la Agencia Española de Protección de Datos en www.aepd.es. Mas información: Puede consultar información adicional sobre protección de datos en www.nutretium.com.`;

const AVISO_LEGAL_EMAIL = 'AVISO LEGAL: Este mensaje y sus archivos adjuntos son confidenciales y dirigidos únicamente a su destinatario. Queda prohibida su reproducción, difusión o cualquier otro uso sin autorización. Si ha recibido este correo por error, le rogamos elimínelo e infórmenos.';

const PROTECCION_DATOS_EMAIL = `PROTECCIÓN DE DATOS: En cumplimiento de lo dispuesto en el artículo 13 del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), se informa de que ${RESPONSABLE} trata sus datos personales con fines de atender su solicitud, gestionar la relación comercial o contractual y enviar información solicitada sobre sus productos y/o servicios. La base legal es la ejecución de un contrato o la aplicación de medidas precontractuales. Los datos se conservarán mientras sean necesarios para la prestación del servicio o se mantenga la relación contractual, mientras ninguna de las partes se oponga o para cumplir obligaciones legales. Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad enviando un correo electrónico a ${EMAIL_DERECHOS}, o una carta a ${DOMICILIO}, adjuntando documento identificativo. Si considera que el tratamiento no se ajusta a la normativa vigente, podrá presentar una reclamación ante la Agencia Española de Protección de Datos en www.aepd.es. Puede consultar más información sobre Protección de Datos en www.nutretium.com.`;

const ESTILO_FIRMA = 'margin:0 0 8px;font-size:10px;line-height:1.5;color:#8a8a8a;font-family:Arial,Helvetica,sans-serif';

const FIRMA_EMAIL_HTML = `<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e3e3e3"><p style="${ESTILO_FIRMA}">${AVISO_LEGAL_EMAIL}</p><p style="${ESTILO_FIRMA};margin-bottom:0">${PROTECCION_DATOS_EMAIL}</p></div>`;

/** Inserta la firma antes de `</body>` cuando el HTML es un documento completo. */
function conFirmaLegal(html) {
  const cuerpo = String(html == null ? '' : html);
  if (cuerpo.includes(FIRMA_EMAIL_HTML)) return cuerpo;
  const cierre = cuerpo.lastIndexOf('</body>');
  if (cierre === -1) return `${cuerpo}${FIRMA_EMAIL_HTML}`;
  return `${cuerpo.slice(0, cierre)}${FIRMA_EMAIL_HTML}${cuerpo.slice(cierre)}`;
}

module.exports = { RESPONSABLE, DOMICILIO, EMAIL_DERECHOS, FALDON_FACTURA, FIRMA_EMAIL_HTML, conFirmaLegal };
