const db = require('../../database/connection');
const repo = require('./posts.repository');
const { toDTOs, encodeCursor, decodeCursor } = require('./posts.serializer');
const { validatePostInput, POST_TYPES, SPECIES } = require('./posts.validators');
const media = require('../media');
const { AppError, notFound } = require('../../shared/errors');

const FEED_STATUSES = ['active', 'resolved'];                    // aparecen en el feed y en las búsquedas
const VIEWABLE_STATUSES = [...FEED_STATUSES, 'rescued'];            // cualquiera puede abrirlas (incluye logros)
const OWN_STATUSES = ['active', 'hidden', 'resolved', 'rescued']; // lo que ve el autor (excluye borradas)
const PAGE_DEFAULT = 10;
const PAGE_MAX = 30;
const str = (v) => (typeof v === 'string' && v ? v : undefined);

/** Filas -> DTOs con imágenes, "me gusta" del espectador y rescate (consultas en lote, sin N+1). */
function hydrate(rows, viewerId) {
  const ids = rows.map((r) => r.id);
  return toDTOs(rows, repo.listMedia(ids), viewerId, new Set(repo.likedIds(viewerId, ids)), repo.rescuesFor(ids));
}

/** DTO de una publicación por id (para respuestas tras escribir). */
const getDto = (id, viewerId) => hydrate([repo.findById(id)], viewerId)[0];

/** Zona: ?lat&lng&radiusKm (def. 25, máx. 200) -> caja delimitadora. */
function parseNear(query) {
  if (query.lat === undefined && query.lng === undefined) return undefined;
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radius = query.radiusKm === undefined ? 25 : Number(query.radiusKm);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180) || !(radius > 0 && radius <= 200) || query.lat === '' || query.lng === '') {
    throw new AppError(400, 'Zona no válida: usa lat, lng y radiusKm (1-200).');
  }
  const dLat = radius / 111.32;
  const dLng = radius / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

function queryPage(query, filters, viewerId) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || PAGE_DEFAULT, 1), PAGE_MAX);

  let cursor;
  if (query.cursor !== undefined) {
    cursor = decodeCursor(query.cursor);
    if (!cursor) throw new AppError(400, 'Cursor no válido.');
  }
  const type = str(query.type);
  if (type && !POST_TYPES.includes(type)) throw new AppError(400, 'Tipo no válido.');
  const species = str(query.species);
  if (species && !SPECIES.includes(species)) throw new AppError(400, 'Especie no válida.');

  // limit + 1 para saber si hay otra página sin hacer un COUNT
  const rows = repo.list({ ...filters, cursor, limit: limit + 1, type, species, near: parseNear(query) });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    posts: hydrate(pageRows, viewerId),
    nextCursor: hasMore ? encodeCursor(pageRows.at(-1)) : null,
  };
}

/** Feed global (activas y resueltas). Filtros: user, type, species, zona, cursor, limit. `extra` (p. ej. match de búsqueda) lo pasa otro módulo. */
const listFeed = (query, viewer, extra = {}) =>
  queryPage(query, { statuses: FEED_STATUSES, username: str(query.user)?.slice(0, 30), ...extra }, viewer.id);

/** Publicaciones del usuario autenticado, incluidas las ocultas. Filtro extra: status. */
function listMine(query, viewer) {
  const status = str(query.status);
  if (status && !OWN_STATUSES.includes(status)) throw new AppError(400, 'Estado no válido.');
  return queryPage(query, { statuses: status ? [status] : OWN_STATUSES, userId: viewer.id }, viewer.id);
}

/** Devuelve la fila si el usuario puede verla (pública, o suya y no borrada); si no, 404. */
function assertVisible(id, viewer) {
  const row = repo.findById(id);
  const visible = row && (VIEWABLE_STATUSES.includes(row.status) || (row.user_id === viewer.id && row.status !== 'deleted'));
  if (!visible) throw notFound('Publicación');
  return row;
}

function get(id, viewer) {
  assertVisible(id, viewer);
  return getDto(id, viewer.id);
}

// Carga una publicación y exige que sea del usuario (404 si no existe/borrada, 403 si es de otro).
function ownPost(id, viewer) {
  const row = repo.findById(id);
  if (!row || row.status === 'deleted') throw notFound('Publicación');
  if (row.user_id !== viewer.id) throw new AppError(403, 'No puedes modificar esta publicación.');
  return row;
}

function update(id, viewer, body) {
  const row = ownPost(id, viewer);
  if (row.status === 'rescued') throw new AppError(409, 'Esta publicación ya fue rescatada. Deshaz el rescate si quieres editarla.');
  if (repo.findRescueByPost(id)?.status === 'pending') {
    throw new AppError(409, 'Hay una solicitud de rescate pendiente. Apruébala o recházala antes de editar la publicación.');
  }
  const v = validatePostInput(body, { partial: true });
  if (v.errors) throw new AppError(400, 'Datos no válidos.', v.errors);

  const { location, ...fields } = v.data;
  db.transaction(() => {
    const now = Date.now();
    let orphan = null;
    if (location === null && row.location_id) {
      fields.locationId = null;
      orphan = row.location_id;
    } else if (location) {
      if (row.location_id) repo.updateLocation(row.location_id, location);
      else fields.locationId = repo.insertLocation(location, now);
    }
    repo.updatePost(id, fields, now);
    if (orphan) repo.deleteLocation(orphan);
  });
  return getDto(id, viewer.id);
}

// Borrado lógico: la fila y los archivos se conservan (permite moderación/recuperación).
function remove(id, viewer) {
  ownPost(id, viewer);
  repo.softDelete(id, Date.now());
}

async function addImages(id, viewer, files) {
  ownPost(id, viewer);
  if (!files?.length) throw new AppError(400, 'Adjunta al menos una imagen en el campo "images".');
  const tooMany = () => new AppError(400, `Una publicación admite máximo ${media.MAX_FILES} imágenes.`);
  if (repo.countMedia(id) + files.length > media.MAX_FILES) throw tooMany();

  const saved = [];
  try {
    for (const f of files) saved.push(await media.saveImage(f.buffer));
    db.transaction(() => {
      if (repo.countMedia(id) + saved.length > media.MAX_FILES) throw tooMany(); // revalida bajo transacción
      const now = Date.now();
      let pos = repo.nextPosition(id);
      for (const img of saved) repo.insertMedia(id, img, pos++, now);
    });
  } catch (e) {
    await media.removeFiles(saved.map((s) => s.url));
    throw e;
  }
  return getDto(id, viewer.id);
}

async function removeImage(id, mediaId, viewer) {
  ownPost(id, viewer);
  const m = repo.findMedia(id, mediaId);
  if (!m) throw notFound('Imagen');
  repo.deleteMedia(mediaId);
  await media.removeFiles([m.url]);
  return getDto(id, viewer.id);
}

module.exports = { getDto, hydrate, assertVisible, listFeed, listMine, get, update, remove, addImages, removeImage };
