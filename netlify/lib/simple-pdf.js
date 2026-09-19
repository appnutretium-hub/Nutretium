'use strict';

function latin(value) {
  return String(value == null ? '' : value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
}

function escapePdf(value) {
  return latin(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createPdf({ title = 'Documento', lines = [] } = {}) {
  const visible = [title, ...lines].slice(0, 48);
  const commands = ['BT', '/F1 15 Tf', '50 790 Td', `(${escapePdf(visible[0])}) Tj`, '/F1 10 Tf'];
  for (const line of visible.slice(1)) commands.push('0 -16 Td', `(${escapePdf(line).slice(0, 115)}) Tj`);
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%NTM\n', 'ascii')];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets[index + 1] = length;
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'ascii');
    chunks.push(chunk); length += chunk.length;
  });
  const xref = length;
  const table = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `), 'trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xref), '%%EOF'].join('\n');
  chunks.push(Buffer.from(table, 'ascii'));
  return Buffer.concat(chunks);
}

module.exports = { createPdf, escapePdf };
