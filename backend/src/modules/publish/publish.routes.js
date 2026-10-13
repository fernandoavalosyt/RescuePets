const { Router } = require('express');
const service = require('./publish.service');
const { requireAuth } = require('../auth');
const { parseUpload } = require('../media');
const { userLimiter } = require('../../shared/http');

const router = Router();

const publishLimiter = userLimiter(Number(process.env.PUBLISH_RATE_LIMIT) || 20, 60 * 60 * 1000, 'Has publicado demasiado. Intenta de nuevo más tarde.');

// multipart/form-data: content, type, species, location (JSON string), images (hasta 4)
router.post('/', requireAuth, publishLimiter, parseUpload, async (req, res) => {
  const post = await service.publish(req.user, req.body, req.files);
  res.status(201).json({ post });
});

module.exports = router;
