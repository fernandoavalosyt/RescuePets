import { useState } from 'react'
import { LocateFixed } from 'lucide-react'
import PostList from './PostList'

const TABS = [
  { id: 'near', label: 'Cerca de mí' },
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Mis publicaciones' },
]

/**
 * Feed con pestañas. El estado (mode, posts, ubicación registrada) vive en Home.
 * registerLocation(): pide permiso al navegador, guarda la ubicación en la cuenta y la devuelve.
 */
export default function NearbyFeed({ feed, mode, setMode, coords, registerLocation, locLoading, locNotice }) {
  const [geoError, setGeoError] = useState('')

  async function pickMode(id) {
    setGeoError('')
    if (id === 'near' && !coords) {
      try {
        await registerLocation()
      } catch (e) {
        setGeoError(`${e.message} Mostrando todas las publicaciones.`)
        setMode('all')
        return
      }
    }
    setMode(id)
  }

  async function refreshLocation() {
    setGeoError('')
    try {
      await registerLocation()
    } catch (e) {
      setGeoError(e.message)
    }
  }

  const waitingGeo = mode === 'near' && !coords

  return (
    <div className="mt-6">
      {locLoading && (
        <p className="mb-3 rounded-xl bg-[#E9F0EC] px-3 py-2 text-sm" role="status">
          Permite el acceso a tu ubicación en el aviso del navegador para ver animalitos cerca de ti…
        </p>
      )}
      {locNotice && !coords && !locLoading && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          {locNotice}{' '}
          <button onClick={refreshLocation} className="font-semibold underline">Activar ubicación</button>
        </p>
      )}

      <div role="tablist" aria-label="Filtrar publicaciones" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => pickMode(t.id)}
            disabled={locLoading}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              mode === t.id ? 'border-[#133E37] bg-[#133E37] text-white' : 'border-[#BCD2C6] hover:bg-[#E9F0EC]'
            }`}
          >
            {t.id === 'near' && <LocateFixed className="h-4 w-4" />}
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'near' && coords && (
        <p className="mt-2 text-xs text-[#133E37]/60">
          Publicaciones en un radio de 25 km de tu ubicación registrada.{' '}
          <button onClick={refreshLocation} disabled={locLoading} className="font-semibold underline disabled:opacity-50">
            {locLoading ? 'Actualizando…' : 'Actualizar mi ubicación'}
          </button>
        </p>
      )}
      {geoError && <p className="mt-2 text-sm text-amber-700" role="alert">{geoError}</p>}

      <div className="mt-4">
        <PostList
          list={feed}
          empty={waitingGeo ? 'Esperando tu ubicación…' : mode === 'mine' ? 'Aún no has publicado nada.' : mode === 'near' ? 'No hay animalitos reportados cerca. ¡Sé el primero!' : 'Aún no hay publicaciones.'}
        />
      </div>
    </div>
  )
}
