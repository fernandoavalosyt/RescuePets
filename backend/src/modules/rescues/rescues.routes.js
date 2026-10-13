const { Router } = require('express');
const service = require('./rescues.service');
const { requireAuth } = require('../auth');
const { parseUpload } = require('../media');
const { parseId, requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
const requestLimiter = userLimiter(10, 24 * 60 * 60 * 1000, 'Has enviado demasiadas solicitudes de rescate hoy. Intenta mañana.');
const decideLimiter = userLimiter(60, 60 * 60 * 1000, 'Demasiadas acciones. Intenta de nuevo más tarde.');
const postId = (req) => parseId(req.params.id, 'Publicación');

// 1) Rescatista: solicita el rescate. multipart: note (10-1000), confirm="true", images (1-3 fotos de verificación)
router.post('/posts/:id/rescue', requireAuth, requestLimiter, parseUpload, async (req, res) => {
  res.status(201).json({ post: await service.request(postId(req), req.user, req.body ?? {}, req.files) });
});

// 2) Autor: aprueba o rechaza ({ reason? }). Aprobar = entra en Logros.
router.post('/posts/:id/rescue/approve', requireAuth, decideLimiter, async (req, res) => {
  res.json({ post: service.approve(postId(req), req.user) });
});
router.post('/posts/:id/rescue/reject', requireAuth, decideLimiter, requireJson, requireObjectBody, async (req, res) => {
  res.json({ post: await service.reject(postId(req), req.user, req.body) });
});

// Rescatista: retira su solicitud pendiente · Autor o rescatista: deshace un rescate aprobado
router.delete('/posts/:id/rescue', requireAuth, decideLimiter, async (req, res) => {
  res.json({ post: await service.undo(postId(req), req.user) });
});

router.get('/achievements', requireAuth, (req, res) => res.json(service.listAchievements(req.query, req.user)));
router.get('/achievements/stats', requireAuth, (req, res) => res.json(service.stats(req.user)));

module.exports = router;
