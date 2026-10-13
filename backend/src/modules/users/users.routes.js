const { Router } = require('express');
const service = require('./users.service');
const { requireAuth } = require('../auth');
const { requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
router.use(requireAuth);

const profileLimiter = userLimiter(10, 60 * 60 * 1000, 'Demasiados cambios de perfil. Intenta más tarde.');

// Elegir/cambiar username y nombre visible: { username?, displayName? }
router.patch('/me', profileLimiter, requireJson, requireObjectBody, (req, res) => {
  res.json({ user: service.updateMe(req.user, req.body) });
});

// Ubicación registrada (privada): { latitude, longitude }
router.put('/me/location', profileLimiter, requireJson, requireObjectBody, (req, res) => {
  res.json({ user: service.setLocation(req.user, req.body) });
});
router.delete('/me/location', profileLimiter, (req, res) => res.json({ user: service.clearLocation(req.user) }));

router.get('/:username', (req, res) => res.json({ user: service.getProfile(req.params.username) }));

module.exports = router;
