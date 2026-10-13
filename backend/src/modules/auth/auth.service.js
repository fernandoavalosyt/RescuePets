const crypto = require('crypto');
const repo = require('./auth.repository');
const { validateIdentifier, validatePassword } = require('./auth.validators');
const { hashPassword, verifyPassword, sha256, newToken } = require('../../shared/crypto');
const { AppError } = require('../../shared/errors');

const SESSION_MS = 2 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos.';

const toPublicUser = (u) => ({
  id: u.id,
  username: u.username,
  usernameSet: !!u.username_set,
  displayName: u.display_name,
  // Privada: solo se devuelve al propio usuario (nunca en perfiles públicos ni publicaciones)
  registeredLocation: u.home_latitude == null
    ? null
    : { latitude: u.home_latitude, longitude: u.home_longitude, updatedAt: u.home_location_at },
  identifier: u.email ?? u.phone,
});

// Hash falso para igualar el tiempo de respuesta cuando el usuario no existe.
let dummyHash;
const getDummy = async () => (dummyHash ??= await hashPassword('dummy-Password-1!'));

async function register({ identifier, password, confirmPassword }) {
  const errors = {};
  const id = validateIdentifier(identifier);
  if (id.error) errors.identifier = id.error;
  const pwErr = validatePassword(password, id.value);
  if (pwErr) errors.password = pwErr;
  else if (password !== confirmPassword) errors.confirmPassword = 'Las contraseñas no coinciden.';
  if (Object.keys(errors).length) throw new AppError(400, 'Datos no válidos.', errors);

  const passwordHash = await hashPassword(password);
  // El username se autogenera (editable en el futuro); se reintenta si colisiona.
  for (let i = 0; i < 5; i++) {
    try {
      repo.createUser({
        username: 'user_' + crypto.randomBytes(5).toString('hex'),
        email: id.type === 'email' ? id.value : null,
        phone: id.type === 'phone' ? id.value : null,
        passwordHash,
        now: Date.now(),
      });
      return;
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes('users.username')) continue;
      if (msg.includes('UNIQUE')) throw new AppError(409, 'No se pudo crear la cuenta con esos datos.');
      throw e;
    }
  }
  throw new Error('No se pudo generar un username único.');
}

async function login({ identifier, password }) {
  const id = validateIdentifier(identifier);
  if (id.error || typeof password !== 'string' || !password || password.length > 128) {
    throw new AppError(400, GENERIC_LOGIN_ERROR);
  }

  const user = repo.findActiveByIdentifier(id.type, id.value);
  if (!user) {
    await verifyPassword(password, await getDummy());
    throw new AppError(401, GENERIC_LOGIN_ERROR);
  }
  if (user.locked_until > Date.now()) {
    throw new AppError(423, 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.');
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    repo.setAttempts(user.id, lock ? 0 : attempts, lock ? Date.now() + LOCK_MS : 0);
    throw new AppError(401, GENERIC_LOGIN_ERROR);
  }

  repo.setAttempts(user.id, 0, 0);
  const token = newToken();
  repo.createSession(sha256(token), user.id, Date.now() + SESSION_MS);
  return { user: toPublicUser(user), token };
}

const logout = (token) => repo.deleteSession(sha256(token));

// Devuelve el usuario de una sesión válida, o null.
function authenticate(token) {
  if (typeof token !== 'string') return null;
  const row = repo.findSessionUser(sha256(token));
  return row && row.expires_at >= Date.now() ? toPublicUser(row) : null;
}

// Limpieza periódica de sesiones vencidas
setInterval(repo.purgeExpiredSessions, 10 * 60 * 1000).unref();

module.exports = { register, login, logout, authenticate, toPublicUser, SESSION_MS };
