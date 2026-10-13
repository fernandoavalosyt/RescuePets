// En producción el frontend lo sirve el mismo backend: la API está en /api (mismo origen).
// En desarrollo (Vite en :5173) apunta al backend local. VITE_API_URL permite otro dominio.
const BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api')

// WebSocket de notificaciones (mismo host que la API, ruta /ws)
const sameOriginWs = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
export const WS_URL = import.meta.env.VITE_WS_URL
  || (BASE.startsWith('/') ? sameOriginWs : BASE.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws')

let onUnauthorized = () => {}
/** App registra aquí qué hacer cuando la sesión expira (401 fuera de /auth/login). */
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(path, { method = 'GET', json, form, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : ''
  let res
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      method,
      credentials: 'include',
      // Con FormData el navegador pone el Content-Type (con boundary): no se define a mano.
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body: json ? JSON.stringify(json) : form,
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthorized()
    throw Object.assign(new Error(data.error || 'Error de red.'), { status: res.status, fields: data.fields })
  }
  return data
}

// Auth
export const register = (json) => request('/auth/register', { method: 'POST', json })
export const login = (json) => request('/auth/login', { method: 'POST', json })
export const logout = () => request('/auth/logout', { method: 'POST', json: {} })
export const me = () => request('/auth/me')

// Perfil
// Ubicación registrada (privada)
export const setMyLocation = (json) => request('/users/me/location', { method: 'PUT', json })
export const clearMyLocation = () => request('/users/me/location', { method: 'DELETE' })
export const updateProfile = (json) => request('/users/me', { method: 'PATCH', json })

// Publicaciones
export const publish = (form) => request('/publish', { method: 'POST', form })
export const getFeed = (query) => request('/posts', { query })
export const getMine = (query) => request('/posts/mine', { query })
export const getPost = (id) => request(`/posts/${id}`)
export const updatePost = (id, json) => request(`/posts/${id}`, { method: 'PATCH', json })
export const addPostImages = (id, form) => request(`/posts/${id}/images`, { method: 'POST', form })
export const removePostImage = (id, mediaId) => request(`/posts/${id}/images/${mediaId}`, { method: 'DELETE' })
export const deletePost = (id) => request(`/posts/${id}`, { method: 'DELETE' })

// Me gusta
export const likePost = (id) => request(`/posts/${id}/like`, { method: 'PUT' })
export const unlikePost = (id) => request(`/posts/${id}/like`, { method: 'DELETE' })

// Comentarios
export const getComments = (id, query) => request(`/posts/${id}/comments`, { query })
export const addComment = (id, json) => request(`/posts/${id}/comments`, { method: 'POST', json })
export const deleteComment = (id) => request(`/comments/${id}`, { method: 'DELETE' })

// Perfiles públicos
export const getUser = (username) => request(`/users/${encodeURIComponent(username)}`)

// Buscador: ?q, scope, type, species, lat, lng, radiusKm, cursor, limit
export const search = (query) => request('/search', { query })

// Rescates y logros
export const rescuePost = (id, form) => request(`/posts/${id}/rescue`, { method: 'POST', form })
export const approveRescue = (id) => request(`/posts/${id}/rescue/approve`, { method: 'POST' })
export const rejectRescue = (id, reason) => request(`/posts/${id}/rescue/reject`, { method: 'POST', json: { reason } })
export const undoRescue = (id) => request(`/posts/${id}/rescue`, { method: 'DELETE' })
export const getAchievements = (query) => request('/achievements', { query })
export const getAchievementStats = () => request('/achievements/stats')

// Notificaciones
export const getNotifications = (query) => request('/notifications', { query })
export const getUnreadCounts = () => request('/notifications/unread-count')
export const markNotificationRead = (id) => request(`/notifications/${id}/read`, { method: 'POST' })
export const markAllNotificationsRead = (group) => request('/notifications/read-all', { method: 'POST', query: { group } })
export const getNotificationSettings = () => request('/notifications/settings')
export const updateNotificationSettings = (json) => request('/notifications/settings', { method: 'PUT', json })
