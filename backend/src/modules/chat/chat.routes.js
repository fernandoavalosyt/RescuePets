const { Router } = require('express');
const service = require('./chat.service');
const { requireAuth } = require('../auth');
const { requireJson, requireObjectBody, userLimiter } = require('../../shared/http');

const router = Router();
router.use(requireAuth);

// Cada mensaje cuesta una llamada a Gemini: límite por usuario
const askLimiter = userLimiter(40, 60 * 60 * 1000, 'Has hecho muchas preguntas. Intenta de nuevo en un rato.');

// GET /chat/config -> { enabled }
router.get('/config', (req, res) => res.json(service.getConfig()));
// POST /chat { messages: [{ role: 'user'|'model', text }] } -> { reply }
router.post('/', askLimiter, requireJson, requireObjectBody, async (req, res, next) => {
  try { res.json(await service.ask(req.body.messages)); } catch (e) { next(e); }
});

module.exports = router;
