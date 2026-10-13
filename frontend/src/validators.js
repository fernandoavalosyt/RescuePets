// Espejo de las reglas del backend (el backend siempre revalida).
const EMAIL_RE = /^[a-z0-9.!#$%&*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

export function validateIdentifier(raw) {
  const v = raw.trim()
  if (!v) return 'El usuario es obligatorio.'
  if (v.length > 254) return 'El usuario es demasiado largo.'
  if (v.includes('@')) {
    const local = v.split('@')[0]
    if (local.length > 64 || v.includes('..') || local.startsWith('.') || local.endsWith('.') || !EMAIL_RE.test(v)) {
      return 'Correo electrónico no válido.'
    }
    return ''
  }
  if (!/^\+?[\d\s\-().]+$/.test(v)) return 'Usa un correo válido o un teléfono (solo números, con + opcional).'
  const digits = v.replace(/\D/g, '').length
  if (digits < 8 || digits > 15) return 'El teléfono debe tener entre 8 y 15 dígitos.'
  return ''
}

export function validatePassword(p) {
  if (!p) return 'La contraseña es obligatoria.'
  if (p.length < 10) return 'Mínimo 10 caracteres.'
  if (p.length > 128) return 'Máximo 128 caracteres.'
  if (/\s/.test(p)) return 'No puede contener espacios.'
  if (!/[a-z]/.test(p)) return 'Debe incluir una minúscula.'
  if (!/[A-Z]/.test(p)) return 'Debe incluir una mayúscula.'
  if (!/\d/.test(p)) return 'Debe incluir un número.'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Debe incluir un símbolo.'
  if (/(.)\1{3,}/.test(p)) return 'Demasiados caracteres repetidos.'
  return ''
}

// Espejo de las reglas del backend para el nombre de usuario ('' = válido).
const RESERVED = ['admin', 'administrator', 'root', 'support', 'soporte', 'rescuepets', 'rescue', 'api', 'me', 'mine', 'system', 'moderator', 'mod', 'null', 'undefined', 'user', 'users', 'staff', 'help', 'ayuda']

export function validateUsername(raw) {
  const v = raw.trim().toLowerCase()
  if (v.length < 3) return 'Mínimo 3 caracteres.'
  if (v.length > 30) return 'Máximo 30 caracteres.'
  if (!/^[a-z]/.test(v)) return 'Debe empezar con una letra.'
  if (!/^[a-z0-9_]+$/.test(v)) return 'Solo letras, números y guion bajo (_).'
  if (v.includes('__') || v.endsWith('_')) return 'No uses guiones bajos seguidos ni al final.'
  if (RESERVED.includes(v)) return 'Ese nombre de usuario no está disponible.'
  return ''
}
