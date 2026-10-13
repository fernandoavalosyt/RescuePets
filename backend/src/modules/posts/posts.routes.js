const { Router } = require('express');
const controller = require('./posts.controller');
const { requireAuth } = require('../auth');
const { parseUpload } = require('../media');
const { requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
router.use(requireAuth);

const writeLimiter = userLimiter(120, 60 * 60 * 1000, 'Demasiados cambios. Intenta de nuevo más tarde.');

router.get('/', controller.list);                 // feed: ?cursor&limit&user&type&species
router.get('/mine', controller.mine);             // mis publicaciones (incluye ocultas): ?status
router.get('/:id', controller.get);
router.patch('/:id', writeLimiter, requireJson, requireObjectBody, controller.update);
router.delete('/:id', writeLimiter, controller.remove);
router.post('/:id/images', writeLimiter, parseUpload, controller.addImages);
router.delete('/:id/images/:mediaId', writeLimiter, controller.removeImage);

module.exports = router;
