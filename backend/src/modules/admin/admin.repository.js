const db = require('../../database/connection');

const SORTS = { created: 'u.created_at', seen: 'u.last_seen_at', login: 'u.last_login_at', username: 'u.username', posts: 'post_count', logins: 'u.login_count' };
const like = (s) => `%${s.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

const USER_COLS = `u.id, u.username, u.display_name, u.email, u.phone, u.status, u.created_at, u.last_login_at, u.last_seen_at, u.login_count,
  (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.status != 'deleted') AS post_count`;

function filters({ q, status, onlineSince }) {
  const where = [];
  const params = [];
  if (q) {
    where.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')");
    const p = like(q);
    params.push(p, p, p, p);
  }
  if (status) { where.push('u.status = ?'); params.push(status); }
  if (onlineSince) { where.push('u.last_seen_at >= ?'); params.push(onlineSince); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function listUsers({ q, status, onlineSince, sort, dir, limit, offset }) {
  const f = filters({ q, status, onlineSince });
  const col = SORTS[sort] ?? SORTS.created;
  const order = dir === 'asc' ? 'ASC' : 'DESC';
  const rows = db.prepare(`SELECT ${USER_COLS} FROM users u ${f.sql}
                           ORDER BY (${col} IS NULL), ${col} ${order}, u.id DESC LIMIT ? OFFSET ?`).all(...f.params, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${f.sql}`).get(...f.params).n;
  return { rows, total };
}

const allUsers = () => db.prepare(`SELECT ${USER_COLS} FROM users u ORDER BY u.id`).all();
const findUser = (id) => db.prepare(`SELECT ${USER_COLS}, u.home_latitude IS NOT NULL AS has_location, u.updated_at, u.username_set FROM users u WHERE u.id = ?`).get(id);

const loginEvents = (id) => db.prepare('SELECT created_at, ip, user_agent FROM login_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').all(id);
const activeSessions = (id, now) => db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at >= ?').get(id, now).n;
const pushDevices = (id) => db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(id).n;
const userCounts = (id) => ({
  comments: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?').get(id).n,
  likes: db.prepare('SELECT COUNT(*) AS n FROM post_reactions WHERE user_id = ?').get(id).n,
  rescues: db.prepare("SELECT COUNT(*) AS n FROM rescues WHERE rescuer_id = ? AND status = 'approved'").get(id).n,
});
const recentPosts = (id) => db.prepare(`SELECT id, content, status, post_type, created_at FROM posts WHERE user_id = ? AND status != 'deleted'
                                         ORDER BY created_at DESC, id DESC LIMIT 8`).all(id);

const revokeSessions = (id) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id).changes;
const setStatus = (id, status, now) => db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);

/** Archivos que dejará de usar un usuario al eliminarlo (se borran después de la transacción). */
function deleteUser(id) {
  return db.transaction(() => {
    const urls = [];
    for (const p of db.prepare('SELECT id, location_id FROM posts WHERE user_id = ?').all(id)) {
      urls.push(...db.prepare('SELECT url FROM post_media WHERE post_id = ?').all(p.id).map((m) => m.url));
      urls.push(...db.prepare('SELECT rm.url FROM rescue_media rm JOIN rescues r ON r.id = rm.rescue_id WHERE r.post_id = ?').all(p.id).map((m) => m.url));
      db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
      if (p.location_id) db.prepare('DELETE FROM locations WHERE id = ?').run(p.location_id);
    }
    urls.push(...db.prepare('SELECT rm.url FROM rescue_media rm JOIN rescues r ON r.id = rm.rescue_id WHERE r.rescuer_id = ?').all(id).map((m) => m.url));
    db.prepare('DELETE FROM users WHERE id = ?').run(id); // cascada: sesiones, comentarios, reacciones, rescates, avisos, push, accesos
    return urls;
  });
}

const recentlySeenIds = (since) => db.prepare('SELECT id FROM users WHERE last_seen_at >= ?').all(since).map((r) => r.id);
const findPost = (id) => db.prepare('SELECT id, user_id, status, content FROM posts WHERE id = ?').get(id);

function stats(now) {
  const day = 24 * 60 * 60 * 1000;
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;
  const signups = db.prepare(`SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users
                              WHERE created_at >= ? GROUP BY day ORDER BY day`).all(now - 14 * day);
  return {
    users: {
      total: one('SELECT COUNT(*) AS n FROM users'),
      active: one("SELECT COUNT(*) AS n FROM users WHERE status = 'active'"),
      banned: one("SELECT COUNT(*) AS n FROM users WHERE status = 'banned'"),
      new24h: one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - day),
      new7d: one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 7 * day),
      seen24h: one('SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?', now - day),
      seen7d: one('SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?', now - 7 * day),
      neverLoggedIn: one('SELECT COUNT(*) AS n FROM users WHERE last_login_at IS NULL'),
    },
    posts: {
      total: one("SELECT COUNT(*) AS n FROM posts WHERE status != 'deleted'"),
      today: one("SELECT COUNT(*) AS n FROM posts WHERE status != 'deleted' AND created_at >= ?", now - day),
      rescued: one("SELECT COUNT(*) AS n FROM posts WHERE status = 'resolved' OR status = 'rescued'"),
    },
    rescues: {
      pending: one("SELECT COUNT(*) AS n FROM rescues WHERE status = 'pending'"),
      approved: one("SELECT COUNT(*) AS n FROM rescues WHERE status = 'approved'"),
    },
    comments: one('SELECT COUNT(*) AS n FROM comments'),
    pushDevices: one('SELECT COUNT(*) AS n FROM push_subscriptions'),
    signups,
  };
}

// ---- sesiones de administrador y auditoría ----
const createSession = (tokenHash, now, expiresAt, ip, ua) =>
  db.prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)').run(tokenHash, now, expiresAt, ip, ua);
const findSession = (tokenHash) => db.prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash);
const deleteSession = (tokenHash) => db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
const purgeSessions = (now) => db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(now);

const addAudit = (e, now) =>
  db.prepare('INSERT INTO admin_audit (action, target_id, target_name, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(e.action, e.targetId ?? null, e.targetName ?? null, e.detail ?? null, e.ip ?? null, now);
const listAudit = (limit, offset) => ({
  rows: db.prepare('SELECT id, action, target_id, target_name, detail, ip, created_at FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?').all(limit, offset),
  total: db.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n,
});
const trimAudit = (keep) => db.prepare('DELETE FROM admin_audit WHERE id NOT IN (SELECT id FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT ?)').run(keep);

module.exports = {
  listUsers, allUsers, findUser, loginEvents, activeSessions, pushDevices, userCounts, recentPosts,
  revokeSessions, setStatus, deleteUser, findPost, recentlySeenIds, stats,
  createSession, findSession, deleteSession, purgeSessions, addAudit, listAudit, trimAudit,
};
