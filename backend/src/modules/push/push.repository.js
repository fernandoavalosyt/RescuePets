const db = require('../../database/connection');

/** Un endpoint pertenece a un solo usuario: si el dispositivo cambia de cuenta, se reasigna. */
function upsert({ userId, endpoint, p256dh, auth, userAgent }, now) {
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
                auth = excluded.auth, user_agent = excluded.user_agent`)
    .run(userId, endpoint, p256dh, auth, userAgent, now);
}

const listByUser = (userId) =>
  db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId);

const countByUser = (userId) =>
  db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;

/** Deja como máximo `keep` suscripciones por usuario (borra las más antiguas). */
const trim = (userId, keep) =>
  db.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN
              (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`)
    .run(userId, userId, keep);

const removeByEndpoint = (endpoint, userId) =>
  userId === undefined
    ? db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
    : db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);

module.exports = { upsert, listByUser, countByUser, trim, removeByEndpoint };
