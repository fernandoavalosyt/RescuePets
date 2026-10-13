// Validación y normalización de credenciales. Nunca confía en el tipo que llega del cliente.
const EMAIL_RE = /^[a-z0-9.!#$%&*+/=?^_{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456789', '1234567890', 'qwertyuiop',
  'contrasena', 'contraseña', 'contrasena123', 'admin123', 'iloveyou', 'letmein123', 'abc123456',
]);

function validateIdentifier(raw) {
  if (typeof raw !== 'string') return { error: 'El usuario es obligatorio.' };
  const value = raw.trim();
  if (!value) return { error: 'El usuario es obligatorio.' };
  if (value.length > 254) return { error: 'El usuario es demasiado largo.' };
  if (CONTROL_RE.test(value)) return { error: 'El usuario contiene caracteres no permitidos.' };

  if (value.includes('@')) {
    const email = value.toLowerCase();
    const [local] = email.split('@');
    if (local.length > 64 || email.includes('..') || local.startsWith('.') || local.endsWith('.') || !EMAIL_RE.test(email)) {
      return { error: 'Correo electrónico no válido.' };
    }
    return { value: email, type: 'email' };
  }

  // Teléfono: solo dígitos, espacios, guiones, paréntesis, puntos y un "+" inicial.
  if (!/^\+?[\d\s\-().]+$/.test(value)) {
    return { error: 'Usa un correo válido o un teléfono (solo números, con + opcional al inicio).' };
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return { error: 'El teléfono debe tener entre 8 y 15 dígitos.' };
  }
  return { value: (value.startsWith('+') ? '+' : '') + digits, type: 'phone' };
}

function validatePassword(raw, identifier) {
  if (typeof raw !== 'string' || !raw) return 'La contraseña es obligatoria.';
  if (raw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (raw.length > 128) return 'La contraseña no puede superar 128 caracteres.';
  if (CONTROL_RE.test(raw) || /\s/.test(raw)) return 'La contraseña no puede contener espacios ni caracteres de control.';
  if (!/[a-z]/.test(raw)) return 'La contraseña debe incluir una minúscula.';
  if (!/[A-Z]/.test(raw)) return 'La contraseña debe incluir una mayúscula.';
  if (!/\d/.test(raw)) return 'La contraseña debe incluir un número.';
  if (!/[^A-Za-z0-9]/.test(raw)) return 'La contraseña debe incluir un símbolo.';
  if (/(.)\1{3,}/.test(raw)) return 'La contraseña tiene demasiados caracteres repetidos.';
  const lower = raw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'La contraseña es demasiado común.';
  if (identifier) {
    const local = identifier.split('@')[0].replace(/^\+/, '');
    if (local.length >= 4 && lower.includes(local.toLowerCase())) return 'La contraseña no debe contener tu usuario.';
  }
  return null;
}

module.exports = { validateIdentifier, validatePassword };
