const db = require('../../database/connection');

const COLUMNS = `p.*, u.username, u.display_name,
         l.place_name, l.address, l.city, l.country, l.latitude, l.longitude`;
const FROM = `FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN locations l ON l.id = p.location_id`;

const marks = (arr) => arr.map(() => '?').join(',');

const findById = (id) => db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ?`).get(id);

/**
 * Listado paginado por cursor (created_at, id). filters.statuses es obligatorio.
 * match: expresión FTS5 ya sanitizada (la construye el módulo search).
 */
function list({ statuses, cursor, limit, username, type, species, userId, near, match }) {
  const where = [`p.status IN (${marks(statuses)})`];
  const params = [...statuses];

  if (match) { where.push('posts_search MATCH ?'); params.push(match); }
  if (cursor) {
    where.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  if (username) { where.push('u.username = ?'); params.push(username); }
  if (userId) { where.push('p.user_id = ?'); params.push(userId); }
  if (type) { where.push('p.post_type = ?'); params.push(type); }
  if (species) { where.push('p.pet_species = ?'); params.push(species); }
  // Zona: caja delimitadora sobre el índice idx_locations_geo
  if (near) {
    where.push('l.latitude BETWEEN ? AND ? AND l.longitude BETWEEN ? AND ?');
    params.push(near.minLat, near.maxLat, near.minLng, near.maxLng);
  }

  return db.prepare(`SELECT ${COLUMNS} ${FROM}
                     ${match ? 'JOIN posts_search ON posts_search.rowid = p.id' : ''}
                     WHERE ${where.join(' AND ')}
                     ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(...params, limit);
}

// ---------- Escritura ----------
const insertLocation = (l, now) =>
  db.prepare(`INSERT INTO locations (place_name, address, city, country, latitude, longitude, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(l.placeName, l.address, l.city, l.country, l.latitude, l.longitude, now).lastInsertRowid;

const updateLocation = (id, l) =>
  db.prepare(`UPDATE locations SET place_name = ?, address = ?, city = ?, country = ?, latitude = ?, longitude = ?
              WHERE id = ?`).run(l.placeName, l.address, l.city, l.country, l.latitude, l.longitude, id);

const deleteLocation = (id) => db.prepare('DELETE FROM locations WHERE id = ?').run(id);

const insertPost = ({ userId, locationId, content, type, species }, now) =>
  db.prepare(`INSERT INTO posts (user_id, location_id, content, post_type, pet_species, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, locationId, content, type, species, now, now).lastInsertRowid;

// Lista blanca de columnas editables: los nombres nunca vienen del cliente.
const COLUMN_MAP = { content: 'content', type: 'post_type', species: 'pet_species', status: 'status', locationId: 'location_id' };

function updatePost(id, fields, now) {
  const keys = Object.keys(fields).filter((k) => k in COLUMN_MAP);
  const set = [...keys.map((k) => `${COLUMN_MAP[k]} = ?`), 'updated_at = ?'].join(', ');
  db.prepare(`UPDATE posts SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), now, id);
}

const softDelete = (id, now) =>
  db.prepare("UPDATE posts SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);

/** Cambio de estado atómico: solo si sigue en `from`. Devuelve true si lo cambió (evita carreras). */
const transitionStatus = (id, from, to, now) =>
  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(to, now, id, from).changes === 1;

// IDs (de la lista dada) con me gusta del usuario
const likedIds = (userId, postIds) =>
  postIds.length
    ? db.prepare(`SELECT post_id FROM post_reactions WHERE user_id = ? AND post_id IN (${marks(postIds)})`)
        .all(userId, ...postIds).map((r) => r.post_id)
    : [];

// ---------- Media de la publicación ----------
const listMedia = (postIds) =>
  postIds.length
    ? db.prepare(`SELECT id, post_id, url, width, height FROM post_media
                  WHERE post_id IN (${marks(postIds)}) ORDER BY post_id, position`).all(...postIds)
    : [];

const countMedia = (postId) => db.prepare('SELECT COUNT(*) AS n FROM post_media WHERE post_id = ?').get(postId).n;

const nextPosition = (postId) =>
  db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM post_media WHERE post_id = ?').get(postId).p;

const insertMedia = (postId, img, position, now) =>
  db.prepare(`INSERT INTO post_media (post_id, url, mime_type, width, height, size_bytes, position, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(postId, img.url, img.mime, img.width, img.height, img.size, position, now);

const findMedia = (postId, mediaId) =>
  db.prepare('SELECT id, url FROM post_media WHERE id = ? AND post_id = ?').get(mediaId, postId);

const deleteMedia = (id) => db.prepare('DELETE FROM post_media WHERE id = ?').run(id);

// ---------- Rescates (parte del agregado "publicación") ----------
// Estados: pending (el autor debe aprobar) -> approved (entra en Logros) | rejected (historial, sin fotos).
// Solo puede haber UN rescate abierto (pending o approved) por publicación (índice único parcial).

/** Rescates abiertos + fotos de verificación de varias publicaciones (2 consultas en total). */
function rescuesFor(postIds) {
  if (!postIds.length) return [];
  const rescues = db.prepare(`SELECT r.id, r.post_id, r.note, r.status, r.created_at, r.decided_at, r.rescuer_id, u.username, u.display_name
                              FROM rescues r JOIN users u ON u.id = r.rescuer_id
                              WHERE r.post_id IN (${marks(postIds)}) AND r.status IN ('pending','approved')`).all(...postIds);
  if (!rescues.length) return [];
  const media = db.prepare(`SELECT id, rescue_id, url, width, height FROM rescue_media
                            WHERE rescue_id IN (${marks(rescues.map((r) => r.id))}) ORDER BY rescue_id, position`)
    .all(...rescues.map((r) => r.id));
  return rescues.map((r) => ({ ...r, media: media.filter((m) => m.rescue_id === r.id) }));
}

const findRescueByPost = (postId) =>
  db.prepare("SELECT * FROM rescues WHERE post_id = ? AND status IN ('pending','approved')").get(postId);

const hasRejectedRescue = (postId, userId) =>
  !!db.prepare("SELECT 1 FROM rescues WHERE post_id = ? AND rescuer_id = ? AND status = 'rejected'").get(postId, userId);

const insertRescue = ({ postId, rescuerId, note }, now) =>
  db.prepare("INSERT INTO rescues (post_id, rescuer_id, note, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .run(postId, rescuerId, note, now).lastInsertRowid;

const insertRescueMedia = (rescueId, img, position, now) =>
  db.prepare(`INSERT INTO rescue_media (rescue_id, url, mime_type, width, height, size_bytes, position, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(rescueId, img.url, img.mime, img.width, img.height, img.size, position, now);

const rescueMediaUrls = (rescueId) =>
  db.prepare('SELECT url FROM rescue_media WHERE rescue_id = ?').all(rescueId).map((m) => m.url);

const deleteRescueMedia = (rescueId) => db.prepare('DELETE FROM rescue_media WHERE rescue_id = ?').run(rescueId);

/** pending -> approved/rejected de forma atómica. Devuelve true si cambió. */
const decideRescue = (rescueId, status, decisionNote, now) =>
  db.prepare("UPDATE rescues SET status = ?, decision_note = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
    .run(status, decisionNote, now, rescueId).changes === 1;

const deleteRescue = (rescueId) => db.prepare('DELETE FROM rescues WHERE id = ?').run(rescueId); // CASCADE: rescue_media

/** Solicitudes pendientes creadas antes de cutoff (para que caduquen). */
const findExpiredPending = (cutoff, limit) =>
  db.prepare("SELECT id, post_id, rescuer_id FROM rescues WHERE status = 'pending' AND created_at < ? ORDER BY created_at LIMIT ?").all(cutoff, limit);

/** Logros: rescates aprobados, los más recientes primero (cursor: fecha de aprobación + id del rescate). */
function listRescued({ cursor, limit, rescuerId }) {
  const where = ["p.status = 'rescued'", "r.status = 'approved'"];
  const params = [];
  if (cursor) {
    where.push('(r.decided_at < ? OR (r.decided_at = ? AND r.id < ?))');
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  if (rescuerId) { where.push('r.rescuer_id = ?'); params.push(rescuerId); }
  return db.prepare(`SELECT ${COLUMNS}, r.decided_at AS rescued_at, r.id AS rescue_id
                     ${FROM} JOIN rescues r ON r.post_id = p.id
                     WHERE ${where.join(' AND ')}
                     ORDER BY r.decided_at DESC, r.id DESC LIMIT ?`).all(...params, limit);
}

function rescueStats(userId) {
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    total: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'rescued'"),
    rescuedByMe: one("SELECT COUNT(*) AS n FROM rescues r JOIN posts p ON p.id = r.post_id WHERE r.rescuer_id = ? AND r.status = 'approved' AND p.status = 'rescued'", userId),
    myPostsRescued: one("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'rescued'", userId),
    pendingForMe: one("SELECT COUNT(*) AS n FROM rescues r JOIN posts p ON p.id = r.post_id WHERE p.user_id = ? AND r.status = 'pending' AND p.status = 'active'", userId),
  };
}

// ---------- Limpieza ----------
const findPurgeable = (cutoff, limit) =>
  db.prepare("SELECT id, location_id FROM posts WHERE status = 'deleted' AND deleted_at < ? ORDER BY deleted_at LIMIT ?").all(cutoff, limit);

/** Elimina definitivamente publicaciones (CASCADE: media, reacciones, comentarios, rescates). Devuelve las URLs de sus imágenes. */
function purge(posts) {
  return db.transaction(() => {
    const urls = [];
    for (const p of posts) {
      urls.push(...db.prepare('SELECT url FROM post_media WHERE post_id = ?').all(p.id).map((m) => m.url));
      urls.push(...db.prepare(`SELECT rm.url FROM rescue_media rm JOIN rescues r ON r.id = rm.rescue_id
                               WHERE r.post_id = ?`).all(p.id).map((m) => m.url));
      db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
      if (p.location_id) db.prepare('DELETE FROM locations WHERE id = ?').run(p.location_id);
    }
    return urls;
  });
}

const mediaUrlExists = (url) =>
  !!db.prepare('SELECT 1 FROM post_media WHERE url = ? UNION ALL SELECT 1 FROM rescue_media WHERE url = ?').get(url, url);

module.exports = {
  findById, list,
  insertLocation, updateLocation, deleteLocation,
  insertPost, updatePost, softDelete, transitionStatus,
  likedIds, findPurgeable, purge, mediaUrlExists,
  listMedia, countMedia, nextPosition, insertMedia, findMedia, deleteMedia,
  rescuesFor, findRescueByPost, hasRejectedRescue, insertRescue, insertRescueMedia, rescueMediaUrls, deleteRescueMedia,
  decideRescue, deleteRescue, findExpiredPending, listRescued, rescueStats,
};
