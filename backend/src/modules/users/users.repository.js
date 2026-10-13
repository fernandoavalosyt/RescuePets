const db = require('../../database/connection');

const findById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const findByUsername = (username) =>
  db.prepare(`SELECT u.id, u.username, u.display_name, u.created_at,
                     (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status IN ('active','resolved')) AS post_count
              FROM users u WHERE u.username = ? AND u.status = 'active'`).get(username);

// COALESCE: solo cambia lo que se envía. Elegir username marca username_set = 1.
const updateProfile = (id, { username = null, displayName = null }, now) =>
  db.prepare(`UPDATE users SET
                username     = COALESCE(?, username),
                username_set = CASE WHEN ? IS NULL THEN username_set ELSE 1 END,
                display_name = COALESCE(?, display_name),
                updated_at   = ?
              WHERE id = ?`).run(username, username, displayName, now, id);

const setHomeLocation = (id, lat, lng, now) =>
  db.prepare('UPDATE users SET home_latitude = ?, home_longitude = ?, home_location_at = ?, updated_at = ? WHERE id = ?')
    .run(lat, lng, now, now, id);

const clearHomeLocation = (id, now) =>
  db.prepare('UPDATE users SET home_latitude = NULL, home_longitude = NULL, home_location_at = NULL, updated_at = ? WHERE id = ?')
    .run(now, id);

module.exports = { findById, findByUsername, updateProfile, setHomeLocation, clearHomeLocation };
