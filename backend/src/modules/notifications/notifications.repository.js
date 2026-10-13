const db = require('../../database/connection');

const SELECT = `
  SELECT n.id, n.user_id, n.type, n.actor_id, n.post_id, n.data, n.read_at, n.created_at,
         a.username AS actor_username, a.display_name AS actor_display_name,
         p.content AS post_content, p.status AS post_status,
         (SELECT m.url FROM post_media m WHERE m.post_id = p.id ORDER BY m.position LIMIT 1) AS thumb
  FROM notifications n
  LEFT JOIN users a ON a.id = n.actor_id
  LEFT JOIN posts p ON p.id = n.post_id`;

/** Devuelve el id insertado, o null si ya existía (aviso de cercanía duplicado). */
function insert({ userId, type, actorId, postId, data }, now) {
  const r = db.prepare(`INSERT OR IGNORE INTO notifications (user_id, type, actor_id, post_id, data, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, type, actorId, postId, data ? JSON.stringify(data) : null, now);
  return r.changes ? Number(r.lastInsertRowid) : null;
}

const findById = (id) => db.prepare(`${SELECT} WHERE n.id = ?`).get(id);

/** Siempre acotado al usuario dueño (user_id). group: 'nearby' | 'activity' | undefined. */
function list(userId, { cursor, limit, group }) {
  const where = ['n.user_id = ?'];
  const params = [userId];
  if (group === 'nearby') where.push("n.type = 'nearby_pet'");
  if (group === 'activity') where.push("n.type != 'nearby_pet'");
  if (cursor) {
    where.push('(n.created_at < ? OR (n.created_at = ? AND n.id < ?))');
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  return db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY n.created_at DESC, n.id DESC LIMIT ?`).all(...params, limit);
}

const unreadCount = (userId) =>
  db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;

const unreadByGroup = (userId) =>
  db.prepare(`SELECT SUM(type = 'nearby_pet') AS nearby, SUM(type != 'nearby_pet') AS activity
              FROM notifications WHERE user_id = ? AND read_at IS NULL`).get(userId);

const markRead = (userId, id, now) =>
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').run(now, id, userId).changes;

const markAllRead = (userId, now, group) =>
  db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL
              ${group === 'nearby' ? "AND type = 'nearby_pet'" : group === 'activity' ? "AND type != 'nearby_pet'" : ''}`)
    .run(now, userId).changes;

const exists = (id, userId) => !!db.prepare('SELECT 1 FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);

// ---------- Preferencias ----------
const getSettings = (userId) =>
  db.prepare('SELECT notify_nearby, notify_radius_km FROM users WHERE id = ?').get(userId);

const setSettings = (userId, { nearby, radiusKm }) =>
  db.prepare(`UPDATE users SET notify_nearby = COALESCE(?, notify_nearby),
                               notify_radius_km = COALESCE(?, notify_radius_km) WHERE id = ?`)
    .run(nearby === undefined ? null : (nearby ? 1 : 0), radiusKm ?? null, userId);

/** Usuarios con ubicación registrada dentro de la caja, que quieren avisos de cercanía (excluye al autor). */
const findNearbyUsers = (box, excludeUserId, limit) =>
  db.prepare(`SELECT id, home_latitude AS lat, home_longitude AS lng, notify_radius_km AS radius
              FROM users
              WHERE status = 'active' AND notify_nearby = 1 AND id != ?
                AND home_latitude BETWEEN ? AND ? AND home_longitude BETWEEN ? AND ?
              LIMIT ?`).all(excludeUserId, box.minLat, box.maxLat, box.minLng, box.maxLng, limit);

// ---------- Limpieza ----------
const purgeOld = (readBefore, anyBefore) =>
  db.prepare('DELETE FROM notifications WHERE (read_at IS NOT NULL AND created_at < ?) OR created_at < ?').run(readBefore, anyBefore).changes;

module.exports = {
  insert, findById, list, unreadCount, unreadByGroup, markRead, markAllRead, exists,
  getSettings, setSettings, findNearbyUsers, purgeOld,
};
