export const POST_TYPES = {
  found: 'Encontrado',
  lost: 'Perdido',
  adoption: 'En adopción',
  general: 'General',
}

export const SPECIES = { dog: 'Perro', cat: 'Gato', other: 'Otro' }

export const MAX_IMAGES = 4
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** "hace 5 min", "hace 2 h", "hace 3 d" o la fecha si es más antigua. */
export function timeAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return 'justo ahora'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Pide la ubicación al navegador -> { lat, lng }. El navegador muestra su aviso de permiso.
 * fresh=true fuerza una lectura nueva (sin caché). Si el usuario la rechaza, el error trae denied=true.
 */
export function getPosition({ fresh = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Tu navegador no permite obtener la ubicación.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(Object.assign(
        new Error(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.' : 'No se pudo obtener tu ubicación.'),
        { denied: e.code === 1 },
      )),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: fresh ? 0 : 5 * 60 * 1000 },
    )
  })
}

export const MAX_RESCUE_IMAGES = 3

const rad = (d) => (d * Math.PI) / 180
/** Distancia en km entre dos puntos {lat,lng} (fórmula de haversine). */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function formatDistance(km) {
  if (km < 1) return `a ${Math.max(1, Math.round((km * 1000) / 10) * 10)} m de ti`
  return `a ${km < 10 ? km.toFixed(1) : Math.round(km)} km de ti`
}

// Mapa de OpenStreetMap (sin claves ni dependencias)
export const osmLink = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
export const osmEmbed = (lat, lng) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.006}%2C${lat - 0.004}%2C${lng + 0.006}%2C${lat + 0.004}&layer=mapnik&marker=${lat}%2C${lng}`

/** Enlace directo a una publicación (la app usa rutas con #). */
export const postUrl = (id) => `${window.location.origin}${window.location.pathname}#/post/${id}`

// Búsquedas recientes (solo en este navegador)
const RECENT_KEY = 'rp_recent_searches'
export function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? [] } catch { return [] }
}
export function addRecentSearch(term) {
  try {
    const list = [term, ...getRecentSearches().filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch { /* sin almacenamiento disponible: no pasa nada */ }
}
export function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY) } catch { /* idem */ }
}
