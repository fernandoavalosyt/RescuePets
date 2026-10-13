const { Router } = require('express');
const service = require('./reactions.service');
const { requireAuth } = require('../auth');
const { parseId, userLimiter } = require('../../shared/http');

const router = Router();
const limiter = userLimiter(300, 60 * 60 * 1000, 'Demasiadas acciones. Intenta de nuevo más tarde.');
const id = (req) => parseId(req.params.id, 'Publicación');

router.put('/posts/:id/like', requireAuth, limiter, (req, res) => res.json(service.like(id(req), req.user)));
router.delete('/posts/:id/like', requireAuth, limiter, (req, res) => res.json(service.unlike(id(req), req.user)));

module.exports = router;
