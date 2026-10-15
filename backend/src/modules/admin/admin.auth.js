const crypto = require('crypto');
const config = require('../../config/env');
const repo = require('./admin.repository');
const { hashPassword, verifyPassword, sha256, newToken } = require('../../shared/crypto');
const { AppError } = require('../../shared/errors');

const COOKIE_NAME = 'rp_admin';
const SESSION_MS = 4 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const enabled = Boolean(config.admin.password);
if (!enabled) console.log('[admin] Panel desactivado (define ADMIN_PASSWORD para habilitar la cuenta de administrador).');
else if (config.admin.password.length < 12) console.warn('[admin] ADMIN_PASSWORD es corta: usa 12 caracteres o más.');

// La contraseña configurada se convierte a hash scrypt en memoria; nunca se compara en texto plano.
let hashPromise;
const getHash = () => (hashPromise ??= hashPassword(config.admin.password));
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Bloqueo por IP tras intentos fallidos (además del límite de peticiones de la ruta)
const fails = new Map(); // ip -> { n, until }

async function login({ username, password }, meta) {
  if (!enabled) throw new AppError(404, 'No encontrado.');
  const ip = meta.ip || 'unknown';
  const f = fails.get(ip);
  if (f?.until > Date.now()) throw new AppError(423, 'Demasiados intentos. Intenta más tarde.');

  // Siempre se verifica el hash (tiempo parejo) y se compara el usuario en tiempo constante
  const userOk = crypto.timingSafeEqual(digest(String(username ?? '').trim().toLowerCase()), digest(config.admin.username));
  const passOk = typeof password === 'string' && password.length > 0 && password.length <= 128
    && await verifyPassword(password, await getHash());

  if (!userOk || !passOk) {
    const n = (f?.n ?? 0) + 1;
    fails.set(ip, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
    if (fails.size > 1000) fails.clear();
    repo.addAudit({ action: 'login_failed', ip }, Date.now());
    throw new AppError(401, 'Usuario o contraseña incorrectos.');
  }
  fails.delete(ip);
  const token = newToken();
  const now = Date.now();
  repo.createSession(sha256(token), now, now + SESSION_MS, ip, String(meta.userAgent ?? '').slice(0, 200));
  repo.addAudit({ action: 'login', ip }, now);
  return { token };
}

const logout = (token) => repo.deleteSession(sha256(token));

function authenticate(token) {
  if (!enabled || typeof token !== 'string') return false;
  const s = repo.findSession(sha256(token));
  return !!s && s.expires_at >= Date.now();
}

// Solo el administrador entra a las rutas /admin (sesión propia, distinta a la de los usuarios)
function requireAdmin(req, res, next) {
  if (!authenticate(req.cookies?.[COOKIE_NAME])) return next(new AppError(401, 'No autenticado.'));
  next();
}

setInterval(() => { try { repo.purgeSessions(Date.now()); repo.trimAudit(5000); } catch { /* idem */ } }, 10 * 60 * 1000).unref();

module.exports = { enabled, login, logout, authenticate, requireAdmin, COOKIE_NAME, SESSION_MS, username: config.admin.username };
