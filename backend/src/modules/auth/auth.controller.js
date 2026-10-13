const service = require('./auth.service');
const { COOKIE_NAME } = require('./auth.middleware');
const { isProd } = require('../../config/env');

const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/' };

async function register(req, res) {
  await service.register(req.body ?? {});
  res.status(201).json({ message: 'Cuenta creada. Ya puedes iniciar sesión.' });
}

async function login(req, res) {
  const { user, token } = await service.login(req.body ?? {});
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: service.SESSION_MS });
  res.json({ user });
}

const me = (req, res) => res.json({ user: req.user });

function logout(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (typeof token === 'string') service.logout(token);
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ message: 'Sesión cerrada.' });
}

module.exports = { register, login, me, logout };
