const db = require('../../database/connection');

const findActiveByIdentifier = (type, value) =>
  db.prepare(`SELECT * FROM users WHERE ${type === 'email' ? 'email' : 'phone'} = ? AND status = 'active'`).get(value);

const createUser = ({ username, email, phone, passwordHash, now }) =>
  db.prepare(`INSERT INTO users (username, email, phone, display_name, password_hash, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`).run(username, email, phone, username, passwordHash, now, now);

/** Registra un inicio de sesión (conserva solo los últimos 20 por usuario). */
function recordLogin(userId, ip, userAgent, now) {
  db.prepare('UPDATE users SET last_login_at = ?, last_seen_at = ?, login_count = login_count + 1 WHERE id = ?').run(now, now, userId);
  db.prepare('INSERT INTO login_events (user_id, created_at, ip, user_agent) VALUES (?, ?, ?, ?)').run(userId, now, ip, userAgent);
  db.prepare(`DELETE FROM login_events WHERE user_id = ? AND id NOT IN
              (SELECT id FROM login_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20)`).run(userId, userId);
}
const touchSeen = (userId, now) => db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, userId);

const setAttempts = (id, attempts, lockedUntil) =>
  db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, id);

const createSession = (tokenHash, userId, expiresAt) =>
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);

const findSessionUser = (tokenHash) =>
  db.prepare(`SELECT u.id, u.username, u.username_set, u.home_latitude, u.home_longitude, u.home_location_at, u.display_name, u.email, u.phone, s.expires_at
              FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND u.status = 'active'`).get(tokenHash);

const deleteSession = (tokenHash) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
const purgeExpiredSessions = () => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

module.exports = { recordLogin, touchSeen, findActiveByIdentifier, createUser, setAttempts, createSession, findSessionUser, deleteSession, purgeExpiredSessions };
