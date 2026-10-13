const repo = require('./comments.repository');
const notifications = require('../notifications');
const posts = require('../posts');
const db = require('../../database/connection');
const { clean } = require('../../shared/text');
const { AppError, notFound } = require('../../shared/errors');

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

const toDTO = (r, viewerId) => ({
  id: r.id,
  postId: r.post_id,
  parentId: r.parent_id,
  content: r.content,
  createdAt: r.created_at,
  author: { id: r.user_id, username: r.username, displayName: r.display_name },
  mine: r.user_id === viewerId,
});

const encodeCursor = (r) => Buffer.from(`${r.created_at}:${r.id}`).toString('base64url');
function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const m = /^(\d{1,16}):(\d{1,16})$/.exec(Buffer.from(raw, 'base64url').toString());
  return m ? { createdAt: Number(m[1]), id: Number(m[2]) } : null;
}

function list(postId, query, viewer) {
  posts.service.assertVisible(postId, viewer);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || PAGE_DEFAULT, 1), PAGE_MAX);
  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeCursor(query.cursor);
    if (!cursor) throw new AppError(400, 'Cursor no válido.');
  }
  const rows = repo.list(postId, { cursor, limit: limit + 1 });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    comments: page.map((r) => toDTO(r, viewer.id)),
    nextCursor: hasMore ? encodeCursor(page.at(-1)) : null,
    total: repo.commentCount(postId),
  };
}

function create(postId, viewer, body) {
  posts.service.assertVisible(postId, viewer);
  const content = clean(body.content);
  const errors = {};
  if (content.length < 1) errors.content = 'Escribe un comentario.';
  else if (content.length > 1000) errors.content = 'Máximo 1000 caracteres.';

  let parentId = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    if (!Number.isInteger(body.parentId) || body.parentId < 1) errors.parentId = 'Comentario padre no válido.';
    else {
      const parent = repo.findById(body.parentId);
      if (!parent || parent.post_id !== postId) errors.parentId = 'El comentario al que respondes no existe.';
      else if (parent.parent_id) errors.parentId = 'Solo se permite un nivel de respuestas.';
      else parentId = parent.id;
    }
  }
  if (Object.keys(errors).length) throw new AppError(400, 'Datos no válidos.', errors);

  const id = repo.insert({ postId, userId: viewer.id, parentId, content }, Date.now());
  const saved = repo.findById(id);

  // Avisos: al dueño de la publicación y, si es una respuesta, al autor del comentario respondido
  const snippet = content.length > 80 ? `${content.slice(0, 80)}…` : content;
  const parentAuthorId = parentId ? repo.findById(parentId)?.user_id : null;
  notifications.service.create({ userId: saved.post_owner_id, type: 'comment', actorId: viewer.id, postId, data: { snippet } });
  if (parentAuthorId && parentAuthorId !== saved.post_owner_id) {
    notifications.service.create({ userId: parentAuthorId, type: 'reply', actorId: viewer.id, postId, data: { snippet } });
  }
  return { comment: toDTO(saved, viewer.id), commentCount: repo.commentCount(postId) };
}

// Pueden borrar: el autor del comentario o el dueño de la publicación.
function remove(commentId, viewer) {
  const c = repo.findById(commentId);
  if (!c) throw notFound('Comentario');
  posts.service.assertVisible(c.post_id, viewer);
  if (c.user_id !== viewer.id && c.post_owner_id !== viewer.id) throw new AppError(403, 'No puedes borrar este comentario.');
  db.transaction(() => repo.remove(commentId));
  return { commentCount: repo.commentCount(c.post_id) };
}

module.exports = { list, create, remove };
