const service = require('./auth.service');
const { AppError } = require('../../shared/errors');

const COOKIE_NAME = 'rp_session';

// Protege rutas: deja el usuario autenticado en req.user.
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token !== 'string') return next(new AppError(401, 'No autenticado.'));
  const user = service.authenticate(token);
  if (!user) return next(new AppError(401, 'Sesión expirada.'));
  req.user = user;
  next();
}

module.exports = { requireAuth, COOKIE_NAME };
