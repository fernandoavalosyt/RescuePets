const db = require('../../database/connection');

const escapeLike = (s) => s.replace(/[\\%_]/g, '\\$&');

/** Usuarios por username o nombre (coincidencia parcial; primero exactos y los que empiezan con el término). */
function findUsers(term, limit) {
  const t = escapeLike(term.toLowerCase());
  return db.prepare(`
    SELECT u.id, u.username, u.display_name,
           (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status IN ('active','resolved','rescued')) AS post_count
    FROM users u
    WHERE u.status = 'active'
      AND (u.username LIKE ? ESCAPE '\\' OR lower(u.display_name) LIKE ? ESCAPE '\\')
    ORDER BY (u.username = ?) DESC, (u.username LIKE ? ESCAPE '\\') DESC, u.username
    LIMIT ?`).all(`%${t}%`, `%${t}%`, term.toLowerCase(), `${t}%`, limit);
}

module.exports = { findUsers };
