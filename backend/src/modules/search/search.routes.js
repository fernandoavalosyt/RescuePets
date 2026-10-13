const { Router } = require('express');
const service = require('./search.service');
const { requireAuth } = require('../auth');
const { userLimiter } = require('../../shared/http');

const router = Router();
const limiter = userLimiter(120, 60 * 1000, 'Demasiadas búsquedas. Espera un momento.');

// GET /search?q=perro&scope=all|posts|users&type&species&lat&lng&radiusKm&cursor&limit
router.get('/search', requireAuth, limiter, (req, res) => res.json(service.search(req.query, req.user)));

module.exports = router;
