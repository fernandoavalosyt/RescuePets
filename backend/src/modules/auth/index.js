module.exports = {
  routes: require('./auth.routes'),
  requireAuth: require('./auth.middleware').requireAuth,
  toPublicUser: require('./auth.service').toPublicUser,
};
