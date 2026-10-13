const repo = require('./search.repository');
const { buildMatch } = require('./search.query');
const posts = require('../posts');
const { AppError } = require('../../shared/errors');

const USER_LIMIT = 8;
const SCOPES = ['all', 'posts', 'users'];

/**
 * Buscador unificado.
 *  - Publicaciones: texto, lugar, especie y tipo ("perro", "gatito", "conejo", "parque", "perdido"...).
 *    Acepta los mismos filtros que el feed: type, species, lat/lng/radiusKm (distancia), cursor, limit.
 *  - Usuarios: por username o nombre. Con "@nombre" busca solo usuarios.
 * Los usuarios solo se devuelven en la primera página (sin cursor).
 */
function search(query, viewer) {
  const raw = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const onlyUsers = raw.startsWith('@');
  const term = raw.replace(/^@+/, '').trim();
  if (term.length < 2) throw new AppError(400, 'Escribe al menos 2 caracteres para buscar.');

  const scope = query.scope === undefined ? (onlyUsers ? 'users' : 'all') : query.scope;
  if (!SCOPES.includes(scope)) throw new AppError(400, 'Ámbito no válido (all, posts o users).');

  const result = { query: raw, users: [], posts: [], nextCursor: null };

  if (scope !== 'posts' && query.cursor === undefined) {
    result.users = repo.findUsers(term, USER_LIMIT).map((u) => ({
      id: u.id, username: u.username, displayName: u.display_name, postCount: u.post_count,
    }));
  }
  if (scope !== 'users') {
    const { match } = buildMatch(term);
    if (match) Object.assign(result, posts.service.listFeed(query, viewer, { match }));
  }
  return result;
}

module.exports = { search };
