// Texto libre: normaliza saltos de línea, quita caracteres de control (excepto \n) y recorta.
const clean = (v) => (typeof v === 'string'
  ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim()
  : '');

const blank = (v) => v === undefined || v === null || v === '';

module.exports = { clean, blank };
