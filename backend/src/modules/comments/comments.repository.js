const db = require('../../database/connection');

const SELECT = `
  SELECT c.id, c.post_id, c.parent_id, c.content, c.created_at, c.user_id,
         u.username, u.display_name, p.user_id AS post_owner_id
  FROM comments c
  JOIN users u ON u.id = c.user_id
  JOIN posts p ON p.id = c.post_id`;

const findById = (id) => db.prepare(`${SELECT} WHERE c.id = ? AND c.status = 'active'`).get(id);

/** Orden cronológico (más antiguos primero), paginado por cursor (created_at, id). */
function list(postId, { cursor, limit }) {
  const params = [postId];
  let after = '';
  if (cursor) {
    after = 'AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?))';
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  return db.prepare(`${SELECT} WHERE c.post_id = ? AND c.status = 'active' ${after}
                     ORDER BY c.created_at, c.id LIMIT ?`).all(...params, limit);
}

const insert = ({ postId, userId, parentId, content }, now) =>
  db.prepare('INSERT INTO comments (post_id, user_id, parent_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(postId, userId, parentId, content, now).lastInsertRowid;

// Borrado real: ON DELETE CASCADE elimina las respuestas y los triggers ajustan comment_count.
const remove = (id) => db.prepare('DELETE FROM comments WHERE id = ?').run(id);

const commentCount = (postId) => db.prepare('SELECT comment_count FROM posts WHERE id = ?').get(postId).comment_count;

module.exports = { findById, list, insert, remove, commentCount };
