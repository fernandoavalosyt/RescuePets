const { Router } = require('express');
const auth = require('./admin.auth');
const service = require('./admin.service');
const { requireJson, requireObjectBody, parseId, ipLimiter } = require('../../shared/http');
const { isProd } = require('../../config/env');

const router = Router();
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: isProd, path: '/' };
const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// Acceso: límite estricto por IP + bloqueo tras intentos fallidos
router.post('/login', ipLimiter(10), requireJson, requireObjectBody, wrap(async (req, res) => {
  const { token } = await auth.login(req.body, meta(req));
  res.cookie(auth.COOKIE_NAME, token, { ...cookieOptions, maxAge: auth.SESSION_MS });
  res.json({ admin: { username: auth.username } });
}));
router.post('/logout', (req, res) => {
  const t = req.cookies?.[auth.COOKIE_NAME];
  if (typeof t === 'string') auth.logout(t);
  res.clearCookie(auth.COOKIE_NAME, cookieOptions);
  res.json({ message: 'Sesión cerrada.' });
});

// Todo lo demás es solo para el administrador
router.use(auth.requireAdmin);
router.get('/me', (req, res) => res.json({ admin: { username: auth.username } }));
router.get('/stats', (req, res) => res.json(service.getStats()));
router.get('/sheets', (req, res) => res.json(service.sheetsStatus()));
router.post('/sheets/export', ipLimiter(6, 10 * 60 * 1000, 'Demasiados envíos. Espera unos minutos.'), wrap(async (req, res) => res.json(await service.exportToSheets(req.ip))));
router.get('/audit', (req, res) => res.json(service.listAudit(req.query)));

router.get('/users', (req, res) => res.json(service.listUsers(req.query)));
router.get('/users/export.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(service.exportCsv(req.ip));
});
router.get('/users/:id', (req, res) => res.json(service.getUser(parseId(req.params.id, 'Usuario'))));
router.patch('/users/:id', requireJson, requireObjectBody, (req, res) =>
  res.json({ user: service.updateUser(parseId(req.params.id, 'Usuario'), req.body, req.ip) }));
router.post('/users/:id/status', requireJson, requireObjectBody, (req, res) =>
  res.json({ user: service.setStatus(parseId(req.params.id, 'Usuario'), req.body.status, req.ip) }));
router.post('/users/:id/logout', (req, res) => res.json(service.logoutUser(parseId(req.params.id, 'Usuario'), req.ip)));
router.delete('/users/:id', requireJson, requireObjectBody, wrap(async (req, res) =>
  res.json(await service.deleteUser(parseId(req.params.id, 'Usuario'), req.body, req.ip))));
router.delete('/posts/:id', (req, res) => res.json(service.removePost(parseId(req.params.id, 'Publicación'), req.ip)));

module.exports = router;
