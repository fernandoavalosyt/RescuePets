const repo = require('./admin.repository');
const gateway = require('../../realtime/gateway');
const media = require('../media');
const posts = require('../posts');
const usersRepo = require('../users/users.repository');
const { validateUsername, validateDisplayName } = require('../users/users.validators');
const { AppError, notFound } = require('../../shared/errors');

const ONLINE_MS = 5 * 60 * 1000;
const STATUSES = ['active', 'banned', 'inactive'];
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

const audit = (action, ip, target, detail) =>
  repo.addAudit({ action, ip, targetId: target?.id, targetName: target?.username, detail }, Date.now());

function toUser(u) {
  const now = Date.now();
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    contact: u.email ?? u.phone,
    contactType: u.email ? 'email' : 'phone',
    status: u.status,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    lastSeenAt: u.last_seen_at,
    loginCount: u.login_count,
    postCount: u.post_count,
    online: gateway.isConnected(u.id) || (u.last_seen_at ?? 0) >= now - ONLINE_MS,
  };
}

const getUserRow = (id) => {
  const u = repo.findUser(id);
  if (!u) throw notFound('Usuario');
  return u;
};

function listUsers(q) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const status = q.status === 'online' ? undefined : (STATUSES.includes(q.status) ? q.status : undefined);
  const { rows, total } = repo.listUsers({
    q: typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '',
    status,
    onlineSince: q.status === 'online' ? Date.now() - ONLINE_MS : undefined,
    sort: q.sort, dir: q.dir, limit, offset: (page - 1) * limit,
  });
  return { users: rows.map(toUser), total, page, pages: Math.max(Math.ceil(total / limit), 1) };
}

function getUser(id) {
  const u = getUserRow(id);
  return {
    user: { ...toUser(u), hasLocation: !!u.has_location, updatedAt: u.updated_at, usernameChosen: !!u.username_set },
    counts: repo.userCounts(id),
    activeSessions: repo.activeSessions(id, Date.now()),
    pushDevices: repo.pushDevices(id),
    logins: repo.loginEvents(id).map((e) => ({ at: e.created_at, ip: e.ip, device: describeAgent(e.user_agent) })),
    posts: repo.recentPosts(id).map((p) => ({ id: p.id, snippet: p.content.length > 100 ? `${p.content.slice(0, 100)}…` : p.content, status: p.status, type: p.post_type, createdAt: p.created_at })),
  };
}

// Resumen legible del user-agent: "Chrome · Android"
function describeAgent(ua = '') {
  if (!ua) return 'Desconocido';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function updateUser(id, body, ip) {
  const u = getUserRow(id);
  const errors = {};
  const data = {};
  if (body.username !== undefined) {
    const r = validateUsername(body.username);
    if (r.error) errors.username = r.error; else data.username = r.value;
  }
  if (body.displayName !== undefined) {
    const r = validateDisplayName(body.displayName);
    if (r.error) errors.displayName = r.error; else data.displayName = r.value;
  }
  if (!Object.keys(errors).length && !Object.keys(data).length) errors._ = 'No hay cambios que guardar.';
  if (Object.keys(errors).length) throw new AppError(400, 'Datos no válidos.', errors);
  try {
    usersRepo.updateProfile(id, data, Date.now());
  } catch (e) {
    if (String(e.message).includes('users.username')) throw new AppError(409, 'Ese nombre de usuario ya está en uso.', { username: 'Ese nombre de usuario ya está en uso.' });
    throw e;
  }
  const changes = [];
  if (data.username && data.username !== u.username) changes.push(`usuario: ${u.username} → ${data.username}`);
  if (data.displayName && data.displayName !== u.display_name) changes.push(`nombre: ${u.display_name} → ${data.displayName}`);
  audit('user_edit', ip, { id, username: data.username ?? u.username }, changes.join('; ') || 'sin cambios');
  return getUser(id).user;
}

function setStatus(id, status, ip) {
  if (!['active', 'banned'].includes(status)) throw new AppError(400, 'Estado no válido (active o banned).');
  const u = getUserRow(id);
  repo.setStatus(id, status, Date.now());
  if (status === 'banned') repo.revokeSessions(id); // la sesión deja de valer al instante
  audit(status === 'banned' ? 'user_ban' : 'user_unban', ip, { id, username: u.username });
  return getUser(id).user;
}

function logoutUser(id, ip) {
  const u = getUserRow(id);
  const n = repo.revokeSessions(id);
  audit('user_logout', ip, { id, username: u.username }, `${n} sesión(es)`);
  return { revoked: n };
}

async function deleteUser(id, body, ip) {
  const u = getUserRow(id);
  // Confirmación explícita: hay que escribir el nombre de usuario exacto
  if (typeof body.confirm !== 'string' || body.confirm.trim().toLowerCase() !== u.username) {
    throw new AppError(400, 'Escribe el nombre de usuario exacto para confirmar.', { confirm: 'No coincide.' });
  }
  const urls = repo.deleteUser(id);
  await media.removeFiles(urls);
  audit('user_delete', ip, { id, username: u.username }, `${u.email ?? u.phone}; ${urls.length} archivo(s)`);
  return { deleted: true };
}

function removePost(id, ip) {
  const p = repo.findPost(id);
  if (!p || p.status === 'deleted') throw notFound('Publicación');
  posts.repository.softDelete(id, Date.now()); // la limpieza periódica la borra definitivamente
  audit('post_remove', ip, { id: p.user_id }, `publicación #${id}: ${p.content.slice(0, 60)}`);
  return { removed: true };
}

// En línea = conectado por WebSocket o con actividad en los últimos 5 minutos (misma regla que la tabla)
const onlineNow = (now) => new Set([...gateway.connectedIds(), ...repo.recentlySeenIds(now - ONLINE_MS)]).size;
const getStats = () => ({ ...repo.stats(Date.now()), online: onlineNow(Date.now()), generatedAt: Date.now() });

function listAudit(q) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 30, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const { rows, total } = repo.listAudit(limit, (page - 1) * limit);
  return {
    entries: rows.map((r) => ({ id: r.id, action: r.action, targetId: r.target_id, target: r.target_name, detail: r.detail, ip: r.ip, at: r.created_at })),
    total, page, pages: Math.max(Math.ceil(total / limit), 1),
  };
}

// CSV de usuarios (sin contraseñas). Se neutralizan celdas que Excel interpretaría como fórmulas.
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function exportCsv(ip) {
  const head = ['id', 'usuario', 'nombre', 'contacto', 'estado', 'registro', 'ultimo_acceso', 'ultima_actividad', 'inicios_de_sesion', 'publicaciones'];
  const lines = repo.allUsers().map((u) => [u.id, u.username, u.display_name, u.email ?? u.phone, u.status, iso(u.created_at), iso(u.last_login_at), iso(u.last_seen_at), u.login_count, u.post_count].map(cell).join(','));
  audit('export_csv', ip, null, `${lines.length} usuario(s)`);
  return `\uFEFF${head.join(',')}\n${lines.join('\n')}\n`;
}

module.exports = { listUsers, getUser, updateUser, setStatus, logoutUser, deleteUser, removePost, getStats, listAudit, exportCsv };
