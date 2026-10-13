const POST_TYPES = ['found', 'lost', 'adoption', 'general'];
const SPECIES = ['dog', 'cat', 'other'];
const EDITABLE_STATUS = ['active', 'hidden', 'resolved'];

const { clean, blank } = require("../../shared/text");

function optionalText(raw, max, label, errors) {
  if (blank(raw)) return null;
  const v = clean(raw).replace(/\s+/g, ' ');
  if (v.length > max) { errors.location = `${label} no puede superar ${max} caracteres.`; return null; }
  return v || null;
}

// Devuelve { value } con la ubicación normalizada, o { error }.
function parseLocation(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return { error: 'Ubicación no válida.' }; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Ubicación no válida.' };

  const errors = {};
  const loc = {
    placeName: optionalText(raw.placeName, 120, 'El lugar', errors),
    address: optionalText(raw.address, 200, 'La dirección', errors),
    city: optionalText(raw.city, 80, 'La ciudad', errors),
    country: optionalText(raw.country, 80, 'El país', errors),
    latitude: null,
    longitude: null,
  };
  if (errors.location) return { error: errors.location };

  const hasLat = !blank(raw.latitude);
  const hasLng = !blank(raw.longitude);
  if (hasLat !== hasLng) return { error: 'Latitud y longitud deben enviarse juntas.' };
  if (hasLat) {
    const { latitude: lat, longitude: lng } = raw;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) {
      return { error: 'Coordenadas fuera de rango.' };
    }
    loc.latitude = lat;
    loc.longitude = lng;
  }
  if (!loc.placeName && !loc.address && loc.latitude === null) {
    return { error: 'Indica el lugar, la dirección o las coordenadas.' };
  }
  loc.placeName ??= loc.address ?? loc.city ?? 'Ubicación en mapa';
  return { value: loc };
}

/**
 * Crea (partial=false) o edita (partial=true) una publicación.
 * - partial: solo se validan los campos presentes. location=null/""/"null" la elimina.
 * - Devuelve { errors } o { data } (data.location: undefined = sin cambio, null = quitar).
 */
function validatePostInput(body, { partial = false } = {}) {
  const errors = {};
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('content')) {
    const content = clean(body.content);
    if (content.length < 3) errors.content = 'Escribe al menos 3 caracteres.';
    else if (content.length > 2000) errors.content = 'La descripción no puede superar 2000 caracteres.';
    else data.content = content;
  }

  if (!partial || has('type')) {
    const type = blank(body.type) && !partial ? 'found' : body.type;
    if (!POST_TYPES.includes(type)) errors.type = 'Tipo de publicación no válido.';
    else data.type = type;
  }

  if (!partial || has('species')) {
    const species = blank(body.species) ? null : body.species;
    if (species !== null && !SPECIES.includes(species)) errors.species = 'Especie no válida.';
    else data.species = species;
  }

  if (has('location')) {
    if (blank(body.location) || body.location === 'null') {
      data.location = null;
    } else {
      const r = parseLocation(body.location);
      if (r.error) errors.location = r.error;
      else data.location = r.value;
    }
  } else if (!partial) {
    data.location = null;
  }

  if (partial && has('status')) {
    if (!EDITABLE_STATUS.includes(body.status)) errors.status = 'Estado no válido (active, hidden o resolved).';
    else data.status = body.status;
  }

  if (partial && !Object.keys(errors).length && !Object.keys(data).length) errors._ = 'No hay cambios que guardar.';

  return Object.keys(errors).length ? { errors } : { data };
}

module.exports = { validatePostInput, POST_TYPES, SPECIES, EDITABLE_STATUS };
