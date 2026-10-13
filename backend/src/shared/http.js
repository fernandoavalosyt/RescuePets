const rateLimit = require('express-rate-limit');
const { AppError, notFound } = require('./errors');

// Solo se aceptan cuerpos JSON.
function requireJson(req, res, next) {
  if (!req.is('application/json')) return next(new AppError(415, 'Content-Type debe ser application/json.'));
  next();
}

// El body debe ser un objeto (no arreglo/primitivo).
function requireObjectBody(req, res, next) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return next(new AppError(400, 'El cuerpo debe ser un objeto JSON.'));
  next();
}

// Defensa CSRF extra (además de SameSite=Strict): las peticiones que modifican datos
// solo se aceptan si el navegador declara el origen del frontend.
// Es válido el origen configurado (frontend en otro dominio) o el del propio servidor (mismo origen).
// Comparar con el Host es seguro: una web atacante envía su propio Origin, que nunca coincide con nuestro Host.
const isAllowedOrigin = (origin, host, allowed) => {
  if (origin === allowed) return true;
  try { return new URL(origin).host === host; } catch { return false; }
};

const originGuard = (allowed) => (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin, req.get('host'), allowed)) return next(new AppError(403, 'Origen no permitido.'));
  next();
};

const parseId = (raw, what = 'Recurso') => {
  if (!/^\d{1,15}$/.test(raw ?? '')) throw notFound(what);
  return Number(raw);
};

const base = { standardHeaders: true, legacyHeaders: false };

const ipLimiter = (max, windowMs = 15 * 60 * 1000, message = 'Demasiados intentos. Intenta de nuevo más tarde.') =>
  rateLimit({ ...base, windowMs, limit: max, message: { error: message } });

// Límite por usuario autenticado (requiere que requireAuth haya corrido antes).
const userLimiter = (max, windowMs, message) =>
  rateLimit({
    ...base,
    windowMs,
    limit: max,
    keyGenerator: (req) => `user:${req.user.id}`,
    validate: { keyGeneratorIpFallback: false },
    message: { error: message },
  });

module.exports = { requireJson, requireObjectBody, originGuard, isAllowedOrigin, parseId, ipLimiter, userLimiter };
