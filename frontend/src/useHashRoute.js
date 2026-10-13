import { useEffect, useMemo, useState } from 'react'

// Rutas con "#" (no requieren configurar el servidor ni librerías):
//   #/  inicio · #/logros · #/buscar?q=perro&radio=25 · #/u/usuario · #/post/12
function parse(hash) {
  const [path, qs = ''] = hash.replace(/^#/, '').split('?')
  const seg = path.split('/').filter(Boolean)
  const params = new URLSearchParams(qs)
  if (seg[0] === 'logros') return { name: 'achievements' }
  if (seg[0] === 'buscar') return { name: 'search', q: params.get('q') ?? '', radius: params.get('radio') ?? '' }
  if (seg[0] === 'u' && seg[1]) return { name: 'profile', username: decodeURIComponent(seg[1]) }
  if (seg[0] === 'post' && /^\d{1,15}$/.test(seg[1] ?? '')) return { name: 'post', id: Number(seg[1]) }
  return { name: 'home' }
}

export const navigate = (to) => { window.location.hash = to }

export function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => { setHash(window.location.hash); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return useMemo(() => parse(hash), [hash])
}
