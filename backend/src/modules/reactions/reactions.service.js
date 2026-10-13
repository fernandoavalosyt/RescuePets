const db = require('../../database/connection');
const posts = require('../posts');

const likeCount = (postId) => db.prepare('SELECT like_count FROM posts WHERE id = ?').get(postId).like_count;

// Idempotentes: dar "me gusta" dos veces no duplica (PK post_id+user_id); el trigger mantiene like_count.
function like(postId, viewer) {
  posts.service.assertVisible(postId, viewer);
  db.prepare("INSERT OR IGNORE INTO post_reactions (post_id, user_id, type, created_at) VALUES (?, ?, 'like', ?)")
    .run(postId, viewer.id, Date.now());
  return { liked: true, likes: likeCount(postId) };
}

function unlike(postId, viewer) {
  posts.service.assertVisible(postId, viewer);
  db.prepare('DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?').run(postId, viewer.id);
  return { liked: false, likes: likeCount(postId) };
}

module.exports = { like, unlike };
