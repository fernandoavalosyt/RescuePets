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
    if (res.status === 401 && !['/auth/login', '/auth/me', '/admin/login', '/admin/me'].includes(path)) onUnauthorized()
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

// Administrador (sesión propia, distinta a la de los usuarios)
export const adminLogin = (json) => request('/admin/login', { method: 'POST', json })
export const adminLogout = () => request('/admin/logout', { method: 'POST', json: {} })
export const adminMe = () => request('/admin/me')
export const adminStats = () => request('/admin/stats')
export const adminUsers = (query) => request('/admin/users', { query })
export const adminUser = (id) => request(`/admin/users/${id}`)
export const adminUpdateUser = (id, json) => request(`/admin/users/${id}`, { method: 'PATCH', json })
export const adminSetStatus = (id, status) => request(`/admin/users/${id}/status`, { method: 'POST', json: { status } })
export const adminLogoutUser = (id) => request(`/admin/users/${id}/logout`, { method: 'POST', json: {} })
export const adminDeleteUser = (id, confirm) => request(`/admin/users/${id}`, { method: 'DELETE', json: { confirm } })
export const adminRemovePost = (id) => request(`/admin/posts/${id}`, { method: 'DELETE', json: {} })
export const adminAudit = (query) => request('/admin/audit', { query })
export async function adminExportCsv() {
  const res = await fetch(`${BASE}/admin/users/export.csv`, { credentials: 'include' })
  if (!res.ok) throw new Error('No se pudo exportar.')
  return res.blob()
}

// Asistente de chat (Gemini, a través del backend)
export const chatConfig = () => request('/chat/config')
export const chatAsk = (messages) => request('/chat', { method: 'POST', json: { messages } })

// Notificaciones push (dispositivo)
export const pushConfig = () => request('/push/config')
export const pushSubscribe = (subscription) => request('/push/subscribe', { method: 'POST', json: { subscription } })
export const pushUnsubscribe = (endpoint) => request('/push/unsubscribe', { method: 'POST', json: { endpoint } })

// Notificaciones
export const getNotifications = (query) => request('/notifications', { query })
export const getUnreadCounts = () => request('/notifications/unread-count')
export const markNotificationRead = (id) => request(`/notifications/${id}/read`, { method: 'POST' })
export const markAllNotificationsRead = (group) => request('/notifications/read-all', { method: 'POST', query: { group } })
export const getNotificationSettings = () => request('/notifications/settings')
export const updateNotificationSettings = (json) => request('/notifications/settings', { method: 'PUT', json })
