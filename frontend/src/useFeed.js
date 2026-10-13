import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'

const PAGE = 9

/**
 * Lista de publicaciones paginada por cursor, reutilizable (feed, búsqueda, logros, perfil).
 *  - fetchPage(cursor) -> { posts, nextCursor, ...extra }. Debe ser estable (useCallback): si cambia, se recarga.
 *  - keep(post): tras editar una publicación, si ya no cumple se saca de la lista (p. ej. rescatada sale del feed).
 *  - onFirstPage(data): para leer datos extra de la primera página (p. ej. usuarios de la búsqueda).
 */
export function usePagedPosts(fetchPage, { enabled = true, keep = () => true, onFirstPage } = {}) {
  const [posts, setPosts] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const seq = useRef(0) // descarta respuestas de peticiones viejas
  const first = useRef(onFirstPage)
  useEffect(() => { first.current = onFirstPage })

  const load = useCallback(async (after) => {
    const id = ++seq.current
    setLoading(true)
    setError('')
    try {
      const data = await fetchPage(after)
      if (id !== seq.current) return
      setPosts((prev) => (after ? [...prev, ...data.posts.filter((p) => !prev.some((x) => x.id === p.id))] : data.posts))
      setCursor(data.nextCursor)
      if (!after) first.current?.(data)
    } catch (e) {
      if (id === seq.current) setError(e.message)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(null)
  }, [enabled, load])

  return {
    posts,
    loading,
    error,
    hasMore: !!cursor,
    loadMore: () => load(cursor),
    reload: () => load(null),
    prepend: (post) => setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]),
    replace: (post) => setPosts((prev) => (keep(post) ? prev.map((p) => (p.id === post.id ? post : p)) : prev.filter((p) => p.id !== post.id))),
    removeLocal: (id) => setPosts((prev) => prev.filter((p) => p.id !== id)),
  }
}

/** Feed principal. mode: 'all' | 'near' (requiere coords) | 'mine'. */
export function useFeed({ mode, coords }) {
  const fetchPage = useCallback((after) => {
    const query = { limit: PAGE, cursor: after || undefined }
    if (mode === 'mine') return api.getMine(query)
    if (mode === 'near' && coords) return api.getFeed({ ...query, lat: coords.lat, lng: coords.lng, radiusKm: 25 })
    return api.getFeed(query)
  }, [mode, coords])

  // Los rescatados no pertenecen al feed (salvo en "mis publicaciones", donde se ven con su estado)
  const keep = useCallback((p) => mode === 'mine' || p.status !== 'rescued', [mode])
  return usePagedPosts(fetchPage, { enabled: !(mode === 'near' && !coords), keep })
}
