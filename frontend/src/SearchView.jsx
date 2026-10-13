import { useCallback, useEffect, useState } from 'react'
import { Search, User } from 'lucide-react'
import * as api from './api'
import PostList from './PostList'
import { usePagedPosts } from './useFeed'
import { useApp } from './AppContext'
import { navigate } from './useHashRoute'
import { POST_TYPES, SPECIES, addRecentSearch, clearRecentSearches, getRecentSearches } from './lib'

const QUICK = ['Perro', 'Gato', 'Cachorro', 'Gatito', 'Conejo', 'Ave', 'Tortuga', 'Perdido', 'Adopción']
const RADII = [['', 'Cualquier distancia'], ['5', 'Hasta 5 km'], ['25', 'Hasta 25 km'], ['100', 'Hasta 100 km']]

const selectCls = 'rounded-full border border-[#BCD2C6] bg-white px-3 py-1.5 text-sm focus:border-[#133E37] focus:outline-none disabled:opacity-50'

function Suggestions() {
  const [recent, setRecent] = useState(getRecentSearches)
  const go = (t) => navigate(`#/buscar?q=${encodeURIComponent(t)}`)
  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">Prueba buscando</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((t) => (
            <button key={t} onClick={() => go(t)} className="rounded-full border border-[#BCD2C6] px-4 py-1.5 text-sm font-semibold hover:bg-[#E9F0EC]">{t}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#133E37]/60">Busca por animal, lugar o tipo (perro, gato, conejo, parque…) o escribe <strong>@usuario</strong> para buscar personas.</p>
      </div>
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-3 text-sm font-bold uppercase tracking-wider">
            Recientes
            <button onClick={() => { clearRecentSearches(); setRecent([]) }} className="text-xs font-normal normal-case underline">Borrar</button>
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((t) => (
              <button key={t} onClick={() => go(t)} className="rounded-full bg-[#E9F0EC] px-4 py-1.5 text-sm hover:bg-[#dbe8e0]">{t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SearchView({ q, radius: radiusParam }) {
  const { coords } = useApp()
  const [radius, setRadius] = useState(radiusParam)
  const [type, setType] = useState('')
  const [species, setSpecies] = useState('')
  const [users, setUsers] = useState([])

  const term = q.trim()
  const valid = term.replace(/^@+/, '').trim().length >= 2

  const fetchPage = useCallback((after) => api.search({
    q: term,
    cursor: after || undefined,
    limit: 10,
    type: type || undefined,
    species: species || undefined,
    ...(radius && coords ? { lat: coords.lat, lng: coords.lng, radiusKm: radius } : {}),
  }), [term, type, species, radius, coords])

  const list = usePagedPosts(fetchPage, {
    enabled: valid,
    keep: (p) => p.status !== 'rescued',
    onFirstPage: (d) => setUsers(d.users),
  })

  useEffect(() => { if (valid) addRecentSearch(term) }, [term, valid])

  if (!valid) {
    return (
      <section className="mx-auto w-full max-w-3xl">
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-black"><Search className="h-6 w-6" /> Buscar</h1>
        {term && <p className="mb-4 text-sm text-red-600" role="alert">Escribe al menos 2 caracteres.</p>}
        <Suggestions />
      </section>
    )
  }

  const onlyUsers = term.startsWith('@')
  return (
    <section className="mx-auto w-full max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-black"><Search className="h-6 w-6" /> Resultados para “{term}”</h1>

      {!onlyUsers && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtros de búsqueda">
          <select aria-label="Distancia" value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!coords} className={selectCls} title={coords ? '' : 'Activa tu ubicación para filtrar por distancia'}>
            {RADII.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Tipo" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            <option value="">Todos los tipos</option>
            {Object.entries(POST_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Especie" value={species} onChange={(e) => setSpecies(e.target.value)} className={selectCls}>
            <option value="">Todas las especies</option>
            {Object.entries(SPECIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}
      {!coords && !onlyUsers && <p className="mt-1 text-xs text-[#133E37]/60">Registra tu ubicación para buscar por distancia y ver a cuántos km está cada animalito.</p>}

      {users.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">Usuarios</h2>
          <ul className="flex flex-wrap gap-2">
            {users.map((u) => (
              <li key={u.id}>
                <a href={`#/u/${u.username}`} className="inline-flex items-center gap-2 rounded-full border border-[#BCD2C6] bg-white px-4 py-2 text-sm hover:bg-[#E9F0EC]">
                  <User className="h-4 w-4" /> <span className="font-semibold">@{u.username}</span>
                  <span className="text-xs text-[#133E37]/60">{u.postCount} {u.postCount === 1 ? 'publicación' : 'publicaciones'}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!onlyUsers && (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider">Publicaciones</h2>
          <PostList list={list} empty={`No encontramos publicaciones para “${term}”${radius ? ' en ese radio' : ''}.`} />
        </div>
      )}
      {onlyUsers && !users.length && !list.loading && (
        <p className="mt-5 rounded-3xl border border-dashed border-[#A3C2B2] bg-[#E9F0EC]/50 p-6 text-center text-[#133E37]/70">No encontramos usuarios con ese nombre.</p>
      )}
    </section>
  )
}
