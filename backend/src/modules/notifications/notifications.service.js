const repo = require('./notifications.repository');
const gateway = require('../../realtime/gateway');
const push = require('../push/push.service');
const { publicUrl } = require('../../config/env');
const { distanceKm, boundingBox } = require('../../shared/geo');
const { AppError } = require('../../shared/errors');

const PAGE_DEFAULT = 15;
const PAGE_MAX = 40;
const RADII = [5, 10, 25, 50];
const NEARBY_TYPES = ['found', 'lost', 'adoption']; // "general" no es un animal que rescatar
const NEARBY_MAX_RECIPIENTS = 200;

/*
 * Tipos (la interfaz arma el texto a partir de type + actor + post + data):
 *  rescue_requested  -> al autor: alguien quiere rescatar su publicación (debe aprobar o rechazar)
 *  rescue_approved   -> al rescatista: el autor aprobó (ya es un logro)
 *  rescue_rejected   -> al rescatista: el autor rechazó (data.reason)
 *  rescue_cancelled  -> al autor: el rescatista retiró su solicitud
 *  rescue_undone     -> a la otra parte: se deshizo un rescate aprobado
 *  rescue_expired    -> a ambos: la solicitud caducó sin respuesta
 *  nearby_pet        -> animalito publicado cerca de tu ubicación registrada (data.distanceKm...)
 *  comment / reply   -> comentaron tu publicación / respondieron tu comentario (data.snippet)
 */

function toDTO(r) {
  return {
    id: r.id,
    type: r.type,
    read: r.read_at !== null,
    createdAt: r.created_at,
    actor: r.actor_id ? { id: r.actor_id, username: r.actor_username, displayName: r.actor_display_name } : null,
    post: r.post_id
      ? {
          id: r.post_id,
          snippet: r.post_content.length > 90 ? `${r.post_content.slice(0, 90)}…` : r.post_content,
          thumbnail: r.thumb ? publicUrl + r.thumb : null,
          status: r.post_status,
        }
      : null,
    data: r.data ? JSON.parse(r.data) : null,
  };
}

const counts = (userId) => {
  const g = repo.unreadByGroup(userId);
  return { unread: repo.unreadCount(userId), nearby: g.nearby ?? 0, activity: g.activity ?? 0 };
};

/**
 * Crea una notificación y la envía en tiempo real (WebSocket) si el usuario está conectado.
 * Nunca lanza: una notificación fallida no debe romper la acción que la originó.
 */
function create({ userId, type, actorId = null, postId = null, data = null }) {
  if (actorId && actorId === userId) return null; // no te notificas a ti mismo
  try {
    const id = repo.insert({ userId, type, actorId, postId, data }, Date.now());
    if (!id) return null;
    const notification = toDTO(repo.findById(id));
    const c = counts(userId);
    gateway.publish(userId, { type: 'notification', notification, counts: c });
    push.notifyUser(userId, notification, c.unread); // al dispositivo, aunque el sitio esté cerrado
    return notification;
  } catch (e) {
    console.error('[notifications] no se pudo crear:', e.message);
    return null;
  }
}

/**
 * Avisa a quienes tienen su ubicación registrada cerca de un animal recién publicado:
 * "puedes rescatar o ayudar a este animal". Respeta el radio y la preferencia de cada usuario.
 */
function notifyNearby({ postId, authorId, type, species, location }) {
  if (!NEARBY_TYPES.includes(type) || !location || location.latitude == null) return 0;
  try {
    const box = boundingBox(location.latitude, location.longitude, Math.max(...RADII));
    const recipients = repo.findNearbyUsers(box, authorId, 1000)
      .map((u) => ({ ...u, km: distanceKm(location.latitude, location.longitude, u.lat, u.lng) }))
      .filter((u) => u.km <= u.radius)
      .sort((a, b) => a.km - b.km)
      .slice(0, NEARBY_MAX_RECIPIENTS);
    let sent = 0;
    for (const u of recipients) {
      const n = create({
        userId: u.id, type: 'nearby_pet', actorId: authorId, postId,
        data: { distanceKm: Math.round(u.km * 10) / 10, postType: type, species, placeName: location.placeName ?? null },
      });
      if (n) sent++;
    }
    return sent;
  } catch (e) {
    console.error('[notifications] aviso de cercanía falló:', e.message);
    return 0;
  }
}

// ---------- Lectura ----------
function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const m = /^(\d{1,16}):(\d{1,16})$/.exec(Buffer.from(raw, 'base64url').toString());
  return m ? { createdAt: Number(m[1]), id: Number(m[2]) } : null;
}

function list(userId, query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || PAGE_DEFAULT, 1), PAGE_MAX);
  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeCursor(query.cursor);
    if (!cursor) throw new AppError(400, 'Cursor no válido.');
  }
  const group = query.group;
  if (group !== undefined && !['nearby', 'activity'].includes(group)) throw new AppError(400, 'Grupo no válido (nearby o activity).');

  const rows = repo.list(userId, { cursor, limit: limit + 1, group });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    notifications: page.map(toDTO),
    nextCursor: hasMore ? Buffer.from(`${last.created_at}:${last.id}`).toString('base64url') : null,
    counts: counts(userId),
  };
}

function markRead(userId, id) {
  if (!repo.exists(id, userId)) throw new AppError(404, 'Notificación no encontrada.');
  repo.markRead(userId, id, Date.now());
  return counts(userId);
}

function markAllRead(userId, group) {
  if (group !== undefined && !['nearby', 'activity'].includes(group)) throw new AppError(400, 'Grupo no válido.');
  repo.markAllRead(userId, Date.now(), group);
  return counts(userId);
}

// ---------- Preferencias ----------
const toSettings = (r) => ({ nearby: !!r.notify_nearby, radiusKm: r.notify_radius_km });
const getSettings = (userId) => toSettings(repo.getSettings(userId));

function updateSettings(userId, body) {
  const errors = {};
  const patch = {};
  if (body.nearby !== undefined) {
    if (typeof body.nearby !== 'boolean') errors.nearby = 'Debe ser verdadero o falso.';
    else patch.nearby = body.nearby;
  }
  if (body.radiusKm !== undefined) {
    if (!RADII.includes(body.radiusKm)) errors.radiusKm = `Elige un radio de ${RADII.join(', ')} km.`;
    else patch.radiusKm = body.radiusKm;
  }
  if (!Object.keys(errors).length && !Object.keys(patch).length) errors._ = 'No hay cambios que guardar.';
  if (Object.keys(errors).length) throw new AppError(400, 'Datos no válidos.', errors);
  repo.setSettings(userId, patch);
  return getSettings(userId);
}

const purgeOld = (readDays = 30, anyDays = 120) => {
  const day = 24 * 60 * 60 * 1000;
  return repo.purgeOld(Date.now() - readDays * day, Date.now() - anyDays * day);
};

module.exports = { create, notifyNearby, list, markRead, markAllRead, counts, getSettings, updateSettings, purgeOld, RADII };
