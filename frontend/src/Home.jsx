import { MapPin, Plus } from 'lucide-react'
import { PawHeartIcon, PawPrintIcon } from './Icons'
import NearbyFeed from './NearbyFeed'

// Se muestran mientras no haya publicaciones con foto
const FALLBACK_PETS = [
  { id: 'f1', name: 'Cachorrito marrón', image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&q=80&w=800' },
  { id: 'f2', name: 'Gatito rayado', image: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&q=80&w=800' },
  { id: 'f3', name: 'Perrito mestizo doradito', image: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&q=80&w=800' },
]
const POSES = ['-rotate-3 translate-y-2 z-10', 'rotate-1 -translate-y-1 z-20', 'rotate-3 translate-y-3 z-30']

const Accent = ({ className = '' }) => <div className={`h-1.5 w-20 rounded-full bg-[#BCD2C6] sm:w-24 ${className}`} />

/** Vista de inicio: encabezado con tarjetas, feed "vistos por tu zona" y llamada a publicar. */
export default function Home({ feed, mode, setMode, coords, registerLocation, locLoading, locNotice, onPublish }) {
  // Tarjetas del encabezado: últimas publicaciones activas con foto (o ejemplos si aún no hay)
  const withPhoto = feed.posts
    .filter((p) => p.images.length && p.status === 'active')
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: p.content.slice(0, 60), image: p.images[0].url, tag: p.type === 'adoption' || p.type === 'found' ? 'En adopción' : null }))
  const pets = withPhoto.length ? withPhoto : FALLBACK_PETS.map((p) => ({ ...p, tag: 'En adopción' }))

  return (
    <main className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Columna izquierda */}
      <section className="flex flex-col space-y-10 lg:col-span-7">
        <div>
          <div className="flex items-center gap-3">
            <PawHeartIcon className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />
            <h1 className="text-2xl font-black uppercase tracking-wide sm:text-3xl md:text-4xl">Rescata a tu próxima mascota</h1>
          </div>
          <Accent className="ml-14 mt-2 sm:ml-16" />
        </div>

        <ul className="flex min-h-[320px] items-center justify-center -space-x-8 px-2 py-4 sm:min-h-[380px] sm:justify-start sm:-space-x-12 sm:px-6">
          {pets.map((pet, i) => (
            <li
              key={pet.id}
              className={`relative h-64 w-40 overflow-hidden rounded-3xl border-2 border-white/60 bg-[#E9F0EC] shadow-xl transition-transform duration-300 hover:scale-105 sm:h-80 sm:w-52 md:h-88 md:w-56 ${POSES[i]}`}
            >
              <img src={pet.image} alt={pet.name} loading="lazy" className="h-full w-full object-cover" />
              {pet.tag && (
                <span className="absolute bottom-4 left-3 inline-flex items-center gap-1.5 rounded-full bg-[#133E37]/95 px-3 py-1.5 text-xs font-medium text-white shadow-md sm:left-4 sm:text-sm">
                  <PawPrintIcon className="h-3.5 w-3.5" /> {pet.tag}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div id="zona">
          <div className="flex items-center gap-3">
            <MapPin className="h-7 w-7 fill-[#BCD2C6] text-[#BCD2C6]" aria-hidden="true" />
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">Animalitos vistos por tu zona</h2>
          </div>
          <Accent className="ml-10 mt-2" />
          <NearbyFeed
            feed={feed}
            mode={mode}
            setMode={setMode}
            coords={coords}
            registerLocation={registerLocation}
            locLoading={locLoading}
            locNotice={locNotice}
          />
        </div>
      </section>

      {/* Columna derecha */}
      <aside className="flex flex-col items-center space-y-8 pt-4 sm:space-y-12 lg:sticky lg:top-6 lg:col-span-5 lg:items-end lg:pt-0">
        <button
          onClick={onPublish}
          className="group flex items-center gap-2 text-right text-base font-semibold underline decoration-2 underline-offset-4 transition-colors hover:text-[#1d574d] sm:text-lg"
        >
          ¿Encontraste un animalito callejero o abandonado?
          <PawPrintIcon className="h-6 w-6 shrink-0 text-[#BACFC3] transition-transform group-hover:rotate-12" />
        </button>

        <div className="flex w-full max-w-md flex-col items-center space-y-4 text-center">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">Publícalo aquí</h2>
            <p className="mt-1 text-lg font-medium opacity-80 sm:text-xl">Para que encuentre familia</p>
          </div>
          <button
            onClick={onPublish}
            aria-label="Publicar mascota"
            className="group flex h-44 w-full items-center justify-center rounded-3xl border-2 border-dashed border-[#A3C2B2] bg-[#E9F0EC]/70 shadow-sm transition-all duration-300 hover:bg-[#E0EBE5] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#BCD2C6] sm:h-52"
          >
            <Plus className="h-16 w-16 stroke-3 transition-transform group-hover:scale-110 sm:h-20 sm:w-20" />
          </button>
        </div>
      </aside>
    </main>
  )
}
