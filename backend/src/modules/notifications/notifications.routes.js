const { Router } = require('express');
const service = require('./notifications.service');
const { requireAuth } = require('../auth');
const { parseId, requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
router.use(requireAuth);

const readLimiter = userLimiter(600, 60 * 60 * 1000, 'Demasiadas solicitudes. Intenta más tarde.');
const writeLimiter = userLimiter(60, 60 * 60 * 1000, 'Demasiados cambios. Intenta más tarde.');

// GET /notifications?group=nearby|activity&cursor&limit -> { notifications, nextCursor, counts:{unread,nearby,activity} }
router.get('/', readLimiter, (req, res) => res.json(service.list(req.user.id, req.query)));
router.get('/unread-count', readLimiter, (req, res) => res.json(service.counts(req.user.id)));

// Preferencias de avisos por cercanía: { nearby: boolean, radiusKm: 5|10|25|50 }
router.get('/settings', readLimiter, (req, res) => res.json({ settings: service.getSettings(req.user.id), radii: service.RADII }));
router.put('/settings', writeLimiter, requireJson, requireObjectBody, (req, res) =>
  res.json({ settings: service.updateSettings(req.user.id, req.body) }));

router.post('/read-all', writeLimiter, (req, res) =>
  res.json(service.markAllRead(req.user.id, typeof req.query.group === 'string' ? req.query.group : undefined)));
router.post('/:id/read', writeLimiter, (req, res) =>
  res.json(service.markRead(req.user.id, parseId(req.params.id, 'Notificación'))));

module.exports = router;
