const db = require('../../database/connection');
const posts = require('../posts');
const media = require('../media');
const notifications = require('../notifications');
const { clean } = require('../../shared/text');
const { AppError, notFound } = require('../../shared/errors');

const MAX_RESCUE_IMAGES = 3;
const PAGE_DEFAULT = 10;
const PAGE_MAX = 30;
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // una solicitud sin respuesta caduca a los 7 días

const repo = () => posts.repository;
const notify = (args) => notifications.service.create(args);

function validateRescue(body, files) {
  const errors = {};
  const note = clean(body.note);
  if (note.length < 10) errors.note = 'Describe el rescate (mínimo 10 caracteres).';
  else if (note.length > 1000) errors.note = 'Máximo 1000 caracteres.';
  if (body.confirm !== 'true' && body.confirm !== true) errors.confirm = 'Debes confirmar que este es el animal de la publicación.';
  if (!files.length) errors.images = 'Sube al menos una foto del animal contigo para verificar el rescate.';
  else if (files.length > MAX_RESCUE_IMAGES) errors.images = `Máximo ${MAX_RESCUE_IMAGES} fotos.`;
  return Object.keys(errors).length ? { errors } : { note };
}

/**
 * PASO 1 — El rescatista solicita el rescate con foto y descripción. La publicación NO cambia de estado:
 * queda con una solicitud pendiente y el AUTOR debe aprobarla o rechazarla (así se evitan los fraudes).
 * Solo puede haber una solicitud abierta por publicación.
 */
async function request(postId, viewer, body, files = []) {
  const post = posts.service.assertVisible(postId, viewer);
  if (post.user_id === viewer.id) {
    throw new AppError(403, 'No puedes rescatar tu propia publicación. Usa "Marcar como resuelto".');
  }
  if (post.status !== 'active') throw new AppError(409, 'Esta publicación ya no está disponible para rescatar.');
  if (repo().findRescueByPost(postId)) throw new AppError(409, 'Esta publicación ya tiene una solicitud de rescate en revisión.');
  if (repo().hasRejectedRescue(postId, viewer.id)) {
    throw new AppError(409, 'El autor rechazó tu solicitud anterior para esta publicación.');
  }

  const v = validateRescue(body, files);
  if (v.errors) throw new AppError(400, 'Datos no válidos.', v.errors);

  const saved = [];
  try {
    for (const f of files) saved.push(await media.saveImage(f.buffer, 'rescues'));
    db.transaction(() => {
      const now = Date.now();
      const rescueId = repo().insertRescue({ postId, rescuerId: viewer.id, note: v.note }, now);
      saved.forEach((img, i) => repo().insertRescueMedia(rescueId, img, i, now));
    });
  } catch (e) {
    await media.removeFiles(saved.map((s) => s.url));
    // El índice único parcial garantiza una sola solicitud abierta aunque dos lleguen a la vez
    if (String(e.message).includes('UNIQUE')) throw new AppError(409, 'Alguien más acaba de solicitar el rescate de este animalito.');
    throw e;
  }
  notify({ userId: post.user_id, type: 'rescue_requested', actorId: viewer.id, postId });
  return posts.service.getDto(postId, viewer.id);
}

// Carga la solicitud pendiente de una publicación que pertenece al usuario (autor).
function pendingOfMyPost(postId, viewer) {
  const post = repo().findById(postId);
  if (!post || post.status === 'deleted') throw notFound('Publicación');
  if (post.user_id !== viewer.id) throw new AppError(403, 'Solo el autor de la publicación puede aprobar o rechazar el rescate.');
  const open = repo().findRescueByPost(postId);
  if (!open || open.status !== 'pending') throw new AppError(409, 'No hay una solicitud de rescate pendiente en esta publicación.');
  return { post, rescue: open };
}

/** PASO 2a — El autor aprueba: la publicación pasa a "rescued" (sale del feed y entra en Logros). */
function approve(postId, viewer) {
  const { rescue } = pendingOfMyPost(postId, viewer);
  db.transaction(() => {
    const now = Date.now();
    if (!repo().decideRescue(rescue.id, 'approved', null, now)) throw new AppError(409, 'La solicitud ya fue resuelta.');
    if (!repo().transitionStatus(postId, 'active', 'rescued', now)) {
      throw new AppError(409, 'La publicación ya no está activa (ocúltala o actívala antes de aprobar).');
    }
  });
  notify({ userId: rescue.rescuer_id, type: 'rescue_approved', actorId: viewer.id, postId });
  return posts.service.getDto(postId, viewer.id);
}

/** PASO 2b — El autor rechaza (con motivo opcional): la publicación sigue activa y se borran las fotos de la solicitud. */
async function reject(postId, viewer, body = {}) {
  const reason = clean(body.reason ?? '').slice(0, 300) || null;
  if (typeof body.reason === 'string' && clean(body.reason).length > 300) {
    throw new AppError(400, 'Datos no válidos.', { reason: 'Máximo 300 caracteres.' });
  }
  const { rescue } = pendingOfMyPost(postId, viewer);
  const urls = repo().rescueMediaUrls(rescue.id);
  db.transaction(() => {
    if (!repo().decideRescue(rescue.id, 'rejected', reason, Date.now())) throw new AppError(409, 'La solicitud ya fue resuelta.');
    repo().deleteRescueMedia(rescue.id);
  });
  await media.removeFiles(urls);
  notify({ userId: rescue.rescuer_id, type: 'rescue_rejected', actorId: viewer.id, postId, data: { reason } });
  return posts.service.getDto(postId, viewer.id);
}

/**
 * Retira una solicitud pendiente (solo quien la envió) o deshace un rescate ya aprobado
 * (el autor de la publicación o quien la rescató). La publicación vuelve al feed.
 */
async function undo(postId, viewer) {
  const post = repo().findById(postId);
  const open = post && post.status !== 'deleted' ? repo().findRescueByPost(postId) : null;
  if (!open) throw notFound('Rescate');

  if (open.status === 'pending') {
    if (open.rescuer_id !== viewer.id) throw new AppError(403, 'Como autor, aprueba o rechaza la solicitud.');
  } else if (post.user_id !== viewer.id && open.rescuer_id !== viewer.id) {
    throw new AppError(403, 'Solo el autor de la publicación o quien la rescató puede deshacer el rescate.');
  }

  const urls = repo().rescueMediaUrls(open.id);
  db.transaction(() => {
    repo().deleteRescue(open.id);
    if (open.status === 'approved') repo().transitionStatus(postId, 'rescued', 'active', Date.now());
  });
  await media.removeFiles(urls);

  if (open.status === 'pending') {
    notify({ userId: post.user_id, type: 'rescue_cancelled', actorId: viewer.id, postId });
  } else {
    const other = viewer.id === post.user_id ? open.rescuer_id : post.user_id;
    notify({ userId: other, type: 'rescue_undone', actorId: viewer.id, postId });
  }
  return posts.service.getDto(postId, viewer.id);
}

/** Caduca las solicitudes pendientes sin respuesta (las invoca el job de mantenimiento). Devuelve cuántas. */
async function expirePending(olderThanMs = PENDING_TTL_MS) {
  let total = 0;
  for (;;) {
    const batch = repo().findExpiredPending(Date.now() - olderThanMs, 50);
    if (!batch.length) break;
    for (const r of batch) {
      const urls = repo().rescueMediaUrls(r.id);
      repo().deleteRescue(r.id);
      await media.removeFiles(urls);
      const post = repo().findById(r.post_id);
      notify({ userId: r.rescuer_id, type: 'rescue_expired', postId: r.post_id, data: { role: 'rescuer' } });
      if (post) notify({ userId: post.user_id, type: 'rescue_expired', postId: r.post_id, data: { role: 'author' } });
      total++;
    }
  }
  return total;
}

/** Logros: rescates aprobados (?mine=1 -> los que yo rescaté). Paginado por cursor. */
function listAchievements(query, viewer) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || PAGE_DEFAULT, 1), PAGE_MAX);
  let cursor;
  if (query.cursor !== undefined) {
    cursor = posts.serializer.decodeCursor(query.cursor);
    if (!cursor) throw new AppError(400, 'Cursor no válido.');
  }
  const rows = repo().listRescued({ cursor, limit: limit + 1, rescuerId: query.mine === '1' ? viewer.id : undefined });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    posts: posts.service.hydrate(page, viewer.id),
    nextCursor: hasMore ? posts.serializer.encodeCursor({ created_at: last.rescued_at, id: last.rescue_id }) : null,
  };
}

const stats = (viewer) => repo().rescueStats(viewer.id);

module.exports = { request, approve, reject, undo, expirePending, listAchievements, stats, PENDING_TTL_MS };
