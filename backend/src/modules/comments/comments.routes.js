const { Router } = require('express');
const service = require('./comments.service');
const { requireAuth } = require('../auth');
const { parseId, requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
const writeLimiter = userLimiter(60, 60 * 60 * 1000, 'Demasiados comentarios. Intenta de nuevo más tarde.');
const postId = (req) => parseId(req.params.id, 'Publicación');

router.get('/posts/:id/comments', requireAuth, (req, res) => res.json(service.list(postId(req), req.query, req.user)));

// { content, parentId? }  (parentId = id de un comentario de nivel superior para responderle)
router.post('/posts/:id/comments', requireAuth, writeLimiter, requireJson, requireObjectBody, (req, res) =>
  res.status(201).json(service.create(postId(req), req.user, req.body)));

router.delete('/comments/:id', requireAuth, writeLimiter, (req, res) =>
  res.json(service.remove(parseId(req.params.id, 'Comentario'), req.user)));

module.exports = router;
