// Convierte lo que escribe el usuario en una expresión FTS5 segura (sin operadores ni sintaxis del motor).
const IRREGULAR = { peces: 'pez', luces: 'luz' };

function stem(tok) {
  if (IRREGULAR[tok]) return IRREGULAR[tok];
  if (tok.length >= 6 && tok.endsWith('es')) return tok.slice(0, -2); // ratones -> raton
  if (tok.length >= 4 && tok.endsWith('s')) return tok.slice(0, -1);  // perros -> perro, aves -> ave
  return tok;
}

/**
 * "Perros   en el PARQUE!" -> { tokens: ['perro','en','el','parque'], match: '"perro"* "en"* ...' }
 * Sin acentos, en minúsculas, plurales simples, búsqueda por prefijo y todas las palabras (AND).
 */
function buildMatch(raw) {
  const tokens = (raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length >= 2)
    .slice(0, 6)
    .map((t) => stem(t.slice(0, 30)));
  return { tokens, match: tokens.map((t) => `"${t}"*`).join(' ') };
}

module.exports = { buildMatch };
