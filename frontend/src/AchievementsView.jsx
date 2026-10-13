import { useCallback, useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import * as api from './api'
import PostList from './PostList'
import { usePagedPosts } from './useFeed'

const TABS = [
  { id: 'all', label: 'Toda la comunidad' },
  { id: 'mine', label: 'Los que yo rescaté' },
]

function Stat({ value, label }) {
  return (
    <div className="rounded-2xl border border-[#BCD2C6] bg-white px-4 py-3 text-center">
      <p className="text-2xl font-black">{value ?? '–'}</p>
      <p className="text-xs text-[#133E37]/70">{label}</p>
    </div>
  )
}

/** "Logros": otra feed (aparte del inicio) con las publicaciones que ya fueron rescatadas. */
export default function AchievementsView() {
  const [tab, setTab] = useState('all')
  const [stats, setStats] = useState(null)

  const fetchPage = useCallback(
    (after) => api.getAchievements({ limit: 9, cursor: after || undefined, mine: tab === 'mine' ? '1' : undefined }),
    [tab],
  )
  const list = usePagedPosts(fetchPage, { keep: (p) => p.status === 'rescued' })

  // Las cifras se refrescan al abrir la vista y cuando cambia la lista (p. ej. al deshacer un rescate)
  useEffect(() => { api.getAchievementStats().then(setStats).catch(() => {}) }, [list.posts.length])

  return (
    <section className="mx-auto w-full max-w-3xl">
      <h1 className="flex items-center gap-2 text-2xl font-black sm:text-3xl">
        <Trophy className="h-7 w-7 text-amber-500" aria-hidden="true" /> Logros
      </h1>
      <p className="mt-1 text-[#133E37]/70">Animalitos que ya encontraron familia gracias a la comunidad.</p>
      <div className="mt-2 h-1.5 w-20 rounded-full bg-[#BCD2C6]" />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat value={stats?.total} label="rescatados en total" />
        <Stat value={stats?.rescuedByMe} label="rescatados por ti" />
        <Stat value={stats?.myPostsRescued} label="de tus publicaciones" />
      </div>

      <div role="tablist" aria-label="Filtrar logros" className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-[#133E37] bg-[#133E37] text-white' : 'border-[#BCD2C6] hover:bg-[#E9F0EC]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <PostList
          list={list}
          empty={tab === 'mine' ? 'Aún no has rescatado a nadie. Busca un animalito y pulsa "Rescatar".' : 'Todavía no hay rescates. ¡Sé el primero!'}
        />
      </div>
    </section>
  )
}
