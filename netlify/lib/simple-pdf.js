'use strict';

/* Helvetica se declara con /WinAnsiEncoding, así que el stream se escribe en
   latin1 y los acentos sobreviven. Lo único que hay que traducir a mano es el
   tramo 0x80-0x9F, donde CP1252 y Latin-1 no coinciden. */
const CP1252 = {
  '€': '\x80', '‚': '\x82', 'ƒ': '\x83', '„': '\x84', '…': '\x85',
  '†': '\x86', '‡': '\x87', 'ˆ': '\x88', '‰': '\x89', 'Š': '\x8A',
  '‹': '\x8B', 'Œ': '\x8C', 'Ž': '\x8E', '‘': '\x91', '’': '\x92',
  '“': '\x93', '”': '\x94', '•': '\x95', '–': '\x96', '—': '\x97',
  '˜': '\x98', '™': '\x99', 'š': '\x9A', '›': '\x9B', 'œ': '\x9C',
  'ž': '\x9E', 'Ÿ': '\x9F'
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const BODY_SIZE = 10;
const BODY_LEADING = 16;
const BODY_TOP = 790;
const BODY_MAX_LINES = 48;
const FOOTER_SIZE = 6.5;
const FOOTER_LEADING = 7.5;
const FOOTER_BOTTOM = 34;

function latin(value) {
  let out = '';
  for (const char of String(value == null ? '' : value)) {
    const code = char.codePointAt(0);
    // ASCII imprimible y el tramo alto de Latin-1, que CP1252 respeta tal cual.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out += char;
    else out += CP1252[char] || '?';
  }
  return out;
}

function escapePdf(value) {
  return latin(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Anchura media de Helvetica ~0,5 em; basta para no desbordar el margen. */
function maxChars(fontSize) {
  return Math.floor((PAGE_WIDTH - MARGIN * 2) / (fontSize * 0.5));
}

function wrap(text, limit) {
  const lines = [];
  for (const paragraph of String(text == null ? '' : text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!current) { current = word; continue; }
      if (current.length + 1 + word.length <= limit) { current += ` ${word}`; continue; }
      lines.push(current); current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function textBlock({ lines, size, leading, top }) {
  if (!lines.length) return [];
  const commands = ['BT', `/F1 ${size} Tf`, `${MARGIN} ${top} Td`, `(${escapePdf(lines[0])}) Tj`];
  for (const line of lines.slice(1)) commands.push(`0 -${leading} Td`, `(${escapePdf(line)}) Tj`);
  commands.push('ET');
  return commands;
}

function createPdf({ title = 'Documento', lines = [], footer = '' } = {}) {
  const visible = [title, ...lines].slice(0, BODY_MAX_LINES);
  const bodyLimit = maxChars(BODY_SIZE);
  const commands = [
    'BT', `/F1 15 Tf`, `${MARGIN} ${BODY_TOP} Td`, `(${escapePdf(visible[0])}) Tj`, `/F1 ${BODY_SIZE} Tf`
  ];
  for (const line of visible.slice(1)) commands.push(`0 -${BODY_LEADING} Td`, `(${escapePdf(String(line).slice(0, bodyLimit))}) Tj`);
  commands.push('ET');

  /* El faldón se ancla al pie de la página en su propio objeto de texto, así que
     no compite con el límite de líneas del cuerpo ni se pierde en el truncado. */
  const footerLines = footer ? wrap(footer, maxChars(FOOTER_SIZE)) : [];
  commands.push(...textBlock({
    lines: footerLines,
    size: FOOTER_SIZE,
    leading: FOOTER_LEADING,
    top: FOOTER_BOTTOM + (footerLines.length - 1) * FOOTER_LEADING
  }));

  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%NTM\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = length;
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'latin1');
    chunks.push(chunk); length += chunk.length;
  });
  const xref = length;
  const table = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `), 'trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xref), '%%EOF'].join('\n');
  chunks.push(Buffer.from(table, 'latin1'));
  return Buffer.concat(chunks);
}

module.exports = { createPdf, escapePdf, wrap };
