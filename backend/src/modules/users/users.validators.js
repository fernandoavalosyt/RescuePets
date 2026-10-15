const { clean, blank } = require('../../shared/text');

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'soporte', 'rescuepets', 'rescue', 'api', 'me', 'mine',
  'system', 'moderator', 'mod', 'null', 'undefined', 'user', 'users', 'staff', 'help', 'ayuda',
]);

// Reglas: 3-30 caracteres, letras/números/guion bajo, empieza con letra. Se guarda en minúsculas.
function validateUsername(raw) {
  if (typeof raw !== 'string') return { error: 'El nombre de usuario es obligatorio.' };
  const v = raw.trim().toLowerCase();
  if (v.length < 3) return { error: 'Mínimo 3 caracteres.' };
  if (v.length > 30) return { error: 'Máximo 30 caracteres.' };
  if (!/^[a-z]/.test(v)) return { error: 'Debe empezar con una letra.' };
  if (!/^[a-z0-9_]+$/.test(v)) return { error: 'Solo letras, números y guion bajo (_).' };
  if (/__/.test(v) || v.endsWith('_')) return { error: 'No uses guiones bajos seguidos ni al final.' };
  if (RESERVED.has(v) || /^user_[0-9a-f]{10}$/.test(v)) return { error: 'Ese nombre de usuario no está disponible.' };
  return { value: v };
}

function validateDisplayName(raw) {
  if (typeof raw !== 'string') return { error: 'El nombre es obligatorio.' };
  const v = clean(raw).replace(/\s+/g, ' ');
  if (v.length < 2) return { error: 'Mínimo 2 caracteres.' };
  if (v.length > 50) return { error: 'Máximo 50 caracteres.' };
  return { value: v };
}

/** PATCH /users/me: { username?, displayName? } -> { errors } | { data } */
function validateProfile(body) {
  const errors = {};
  const data = {};
  if (!blank(body.username)) {
    const r = validateUsername(body.username);
    if (r.error) errors.username = r.error; else data.username = r.value;
  }
  if (!blank(body.displayName)) {
    const r = validateDisplayName(body.displayName);
    if (r.error) errors.displayName = r.error; else data.displayName = r.value;
  }
  if (!Object.keys(errors).length && !Object.keys(data).length) errors._ = 'No hay cambios que guardar.';
  return Object.keys(errors).length ? { errors } : { data };
}

/** { latitude, longitude } numéricos y en rango -> { value } | { errors } */
function validateCoordinates(body) {
  const { latitude: lat, longitude: lng } = body;
  const errors = {};
  if (typeof lat !== 'number' || !(lat >= -90 && lat <= 90)) errors.latitude = 'Latitud no válida (-90 a 90).';
  if (typeof lng !== 'number' || !(lng >= -180 && lng <= 180)) errors.longitude = 'Longitud no válida (-180 a 180).';
  return Object.keys(errors).length ? { errors } : { value: { latitude: lat, longitude: lng } };
}

module.exports = { validateUsername, validateDisplayName, validateProfile, validateCoordinates };
