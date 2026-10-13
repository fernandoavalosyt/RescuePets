const db = require('../../database/connection');
const posts = require('../posts');
const media = require('../media');
const notifications = require('../notifications');
const { AppError } = require('../../shared/errors');

/**
 * Publica un animalito: valida, procesa las fotos y guarda ubicación + publicación + imágenes
 * en una sola transacción. El autor (user_id) siempre es el usuario autenticado.
 */
async function publish(user, body, files = []) {
  const v = posts.validators.validatePostInput(body ?? {});
  if (v.errors) throw new AppError(400, 'Datos no válidos.', v.errors);
  const { content, type, species, location } = v.data;

  const saved = [];
  try {
    for (const f of files) saved.push(await media.saveImage(f.buffer));

    const postId = db.transaction(() => {
      const now = Date.now();
      const repo = posts.repository;
      const id = repo.insertPost({
        userId: user.id,
        locationId: location ? repo.insertLocation(location, now) : null,
        content, type, species,
      }, now);
      saved.forEach((img, i) => repo.insertMedia(id, img, i, now));
      return id;
    });
    // Aviso a quienes tienen su ubicación registrada cerca del animal (no bloquea ni rompe la publicación)
    setImmediate(() => notifications.service.notifyNearby({ postId, authorId: user.id, type, species, location }));
    return posts.service.getDto(postId, user.id);
  } catch (e) {
    await media.removeFiles(saved.map((s) => s.url)); // sin archivos huérfanos
    throw e;
  }
}

module.exports = { publish };
