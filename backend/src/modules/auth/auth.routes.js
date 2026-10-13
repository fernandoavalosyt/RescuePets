const { Router } = require('express');
const controller = require('./auth.controller');
const { requireAuth } = require('./auth.middleware');
const { requireJson, ipLimiter } = require('../../shared/http');

const router = Router();

router.post('/register', ipLimiter(10), requireJson, controller.register);
router.post('/login', ipLimiter(20), requireJson, controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);

module.exports = router;
