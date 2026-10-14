const { Router } = require('express');

// Registro central de módulos. Para sumar uno nuevo (likes, comments...) crea
// src/modules/<nombre>/ con su index.js (exporta `routes`) y móntalo aquí.
const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', message: 'Backend server is running correctly' }));
router.use('/auth', require('./auth').routes);
router.use('/publish', require('./publish').routes);
router.use('/users', require('./users').routes);
router.use('/posts', require('./posts').routes);
// Estos módulos definen sus rutas completas (/posts/:id/like, /posts/:id/comments, /comments/:id)
// y protegen cada ruta con requireAuth (no a nivel de router, para no capturar rutas ajenas).
router.use(require('./reactions').routes);
router.use(require('./comments').routes);
router.use(require('./rescues').routes);
router.use(require('./search').routes);
router.use('/notifications', require('./notifications').routes);
router.use('/push', require('./push').routes);

module.exports = router;
