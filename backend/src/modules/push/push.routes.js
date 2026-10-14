const { Router } = require('express');
const service = require('./push.service');
const { requireAuth } = require('../auth');
const { requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
router.use(requireAuth);
const limiter = userLimiter(60, 60 * 60 * 1000, 'Demasiados cambios. Intenta más tarde.');

// GET /push/config -> { enabled, publicKey }  (clave pública VAPID para suscribir el navegador)
router.get('/config', (req, res) => res.json(service.getConfig()));
// POST /push/subscribe { subscription: { endpoint, keys:{ p256dh, auth } } }
router.post('/subscribe', limiter, requireJson, requireObjectBody, (req, res) =>
  res.status(201).json(service.subscribe(req.user.id, req.body, req.get('user-agent'))));
// POST /push/unsubscribe { endpoint }
router.post('/unsubscribe', limiter, requireJson, requireObjectBody, (req, res) =>
  res.json(service.unsubscribe(req.user.id, req.body.endpoint)));

module.exports = router;
