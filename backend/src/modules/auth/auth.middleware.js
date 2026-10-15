const service = require('./auth.service');
const repo = require('./auth.repository');
const { AppError } = require('../../shared/errors');

const COOKIE_NAME = 'rp_session';

// "Visto por última vez": se escribe como mucho una vez por minuto por usuario (no en cada petición).
const lastTouch = new Map();
function touchSeen(userId) {
  const now = Date.now();
  if (now - (lastTouch.get(userId) ?? 0) < 60_000) return;
  lastTouch.set(userId, now);
  if (lastTouch.size > 5000) lastTouch.clear();
  try { repo.touchSeen(userId, now); } catch { /* no debe romper la petición */ }
}

// Protege rutas: deja el usuario autenticado en req.user.
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string') return next(new AppError(401, 'No autenticado.'));
  const user = service.authenticate(token);
  if (!user) return next(new AppError(401, 'Sesión expirada.'));
  req.user = user;
  touchSeen(user.id);
  next();
}

module.exports = { requireAuth, COOKIE_NAME, touchSeen };
