const { publicUrl } = require('../../config/env');

const imageDTO = (m) => ({ id: m.id, url: publicUrl + m.url, width: m.width, height: m.height });

const rescuerDTO = (r) => ({ id: r.rescuer_id, username: r.username, displayName: r.display_name });

// Rescate aprobado (entra en Logros)
function rescueDTO(r, postOwnerId, viewerId) {
  return {
    id: r.id,
    note: r.note,
    createdAt: r.decided_at ?? r.created_at, // cuándo se aprobó
    requestedAt: r.created_at,
    rescuer: rescuerDTO(r),
    images: r.media.map(imageDTO),
    // Pueden deshacer el rescate el autor de la publicación y quien la rescató
    canUndo: viewerId === postOwnerId || viewerId === r.rescuer_id,
  };
}

// Solicitud pendiente de aprobación. El detalle (nota y fotos) solo lo ven el autor y quien la envió.
function rescueRequestDTO(r, postOwnerId, viewerId) {
  const canDecide = viewerId === postOwnerId;
  const mine = viewerId === r.rescuer_id;
  return {
    id: r.id,
    status: 'pending',
    createdAt: r.created_at,
    rescuer: rescuerDTO(r),
    canDecide,
    mine,
    ...((canDecide || mine) && { note: r.note, images: r.media.map(imageDTO) }),
  };
}

// Convierte filas de la BD en el JSON que consume el frontend (camelCase, URLs absolutas).
function toDTO(row, media, viewerId, { liked = false, rescue = null } = {}) {
  const approved = rescue && rescue.status === 'approved' ? rescue : null;
  const pending = rescue && rescue.status === 'pending' ? rescue : null;
  return {
    id: row.id,
    content: row.content,
    type: row.post_type,
    species: row.pet_species,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: { id: row.user_id, username: row.username, displayName: row.display_name },
    location: row.location_id
      ? {
          id: row.location_id, placeName: row.place_name, address: row.address, city: row.city,
          country: row.country, latitude: row.latitude, longitude: row.longitude,
        }
      : null,
    images: media.map(imageDTO),
    counts: { likes: row.like_count, comments: row.comment_count, shares: row.share_count },
    mine: row.user_id === viewerId,
    viewer: { liked },
    rescue: approved ? rescueDTO(approved, row.user_id, viewerId) : null,
    rescueRequest: pending ? rescueRequestDTO(pending, row.user_id, viewerId) : null,
  };
}

// Serializa varias filas con consultas de media/rescates en lote (sin N+1).
function toDTOs(rows, mediaRows, viewerId, likedIds = new Set(), rescues = []) {
  const byPost = new Map();
  for (const m of mediaRows) {
    if (!byPost.has(m.post_id)) byPost.set(m.post_id, []);
    byPost.get(m.post_id).push(m);
  }
  const rescueByPost = new Map(rescues.map((r) => [r.post_id, r]));
  return rows.map((r) => toDTO(r, byPost.get(r.id) ?? [], viewerId, {
    liked: likedIds.has(r.id),
    rescue: rescueByPost.get(r.id) ?? null,
  }));
}

const encodeCursor = (row) => Buffer.from(`${row.created_at}:${row.id}`).toString('base64url');

function decodeCursor(raw) {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const m = /^(\d{1,16}):(\d{1,16})$/.exec(Buffer.from(raw, 'base64url').toString());
  return m ? { createdAt: Number(m[1]), id: Number(m[2]) } : null;
}

module.exports = { toDTO, toDTOs, encodeCursor, decodeCursor };
