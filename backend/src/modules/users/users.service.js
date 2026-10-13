const repo = require('./users.repository');
const { validateProfile, validateCoordinates } = require('./users.validators');
const { toPublicUser } = require('../auth');
const { AppError, notFound } = require('../../shared/errors');

function updateMe(user, body) {
  const v = validateProfile(body);
  if (v.errors) throw new AppError(400, 'Datos no válidos.', v.errors);

  const current = repo.findById(user.id);
  const data = { ...v.data };
  // Si aún se mostraba el nombre autogenerado, el nuevo username pasa a ser también el nombre visible.
  if (data.username && !data.displayName && current.display_name === current.username) data.displayName = data.username;

  try {
    repo.updateProfile(user.id, data, Date.now());
  } catch (e) {
    if (String(e.message).includes('users.username')) {
      throw new AppError(409, 'Ese nombre de usuario ya está en uso.', { username: 'Ese nombre de usuario ya está en uso.' });
    }
    throw e;
  }
  return toPublicUser(repo.findById(user.id));
}

/** Guarda la ubicación registrada del usuario (la que usa por defecto el feed "cerca de mí" y el modal de publicar). */
function setLocation(user, body) {
  const v = validateCoordinates(body);
  if (v.errors) throw new AppError(400, 'Coordenadas no válidas.', v.errors);
  repo.setHomeLocation(user.id, v.value.latitude, v.value.longitude, Date.now());
  return toPublicUser(repo.findById(user.id));
}

function clearLocation(user) {
  repo.clearHomeLocation(user.id, Date.now());
  return toPublicUser(repo.findById(user.id));
}

function getProfile(username) {
  const u = typeof username === 'string' ? repo.findByUsername(username.toLowerCase().slice(0, 30)) : null;
  if (!u) throw notFound('Usuario');
  return { id: u.id, username: u.username, displayName: u.display_name, createdAt: u.created_at, postCount: u.post_count };
}

module.exports = { updateMe, setLocation, clearLocation, getProfile };
