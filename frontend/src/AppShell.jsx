import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Home as HomeIcon, LogOut, Plus, Search, Trophy, User, X } from 'lucide-react'
import * as api from './api'
import { AppContext } from './AppContext'
import { PawHeartIcon, PawPrintIcon } from './Icons'
import Home from './Home'
import SearchView from './SearchView'
import AchievementsView from './AchievementsView'
import ProfileView from './ProfileView'
import PostView from './PostView'
import PublishModal from './PublishModal'
import NotificationsMenu from './NotificationsMenu'
import { useFeed } from './useFeed'
import { useNotifications } from './useNotifications'
import { describeNotification } from './notificationText'
import { navigate, useHashRoute } from './useHashRoute'
import { getPosition } from './lib'

const navCls = (active) =>
  `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${active ? 'bg-[#133E37] text-white' : 'hover:bg-[#E9F0EC]'}`

/**
 * Estructura de la app autenticada: encabezado (navegación + buscador), vistas por ruta (#/…),
 * ubicación registrada del usuario, modal de publicar y avisos.
 */
export default function AppShell({ user, onLogout, onUserChange }) {
  const route = useHashRoute()
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [query, setQuery] = useState(route.name === 'search' ? route.q : '')
  const [searchNonce, setSearchNonce] = useState(0) // repetir la misma búsqueda recarga los resultados

  // ---- Ubicación registrada (privada, guardada en la cuenta) ----
  const registered = user.registeredLocation
  const [mode, setMode] = useState(registered ? 'near' : 'all')
  const [locLoading, setLocLoading] = useState(false)
  const [locNotice, setLocNotice] = useState('')
  const lat = registered?.latitude
  const lng = registered?.longitude
  // useMemo: el objeto solo cambia si cambian las coordenadas (así el feed no se recarga en cada render)
  const coords = useMemo(() => (lat === undefined ? null : { lat, lng }), [lat, lng])
  const feed = useFeed({ mode, coords })

  /** Pide permiso al navegador, guarda la ubicación en la cuenta y actualiza al usuario. */
  const registerLocation = useCallback(async () => {
    setLocLoading(true)
    try {
      const c = await getPosition({ fresh: true })
      const { user: updated } = await api.setMyLocation({ latitude: c.lat, longitude: c.lng })
      onUserChange(updated)
      setLocNotice('')
      return c
    } finally {
      setLocLoading(false)
    }
  }, [onUserChange])

  // Primer inicio de sesión (sin ubicación registrada): pide el permiso del navegador y la guarda.
  const asked = useRef(false)
  useEffect(() => {
    if (registered || asked.current) return
    asked.current = true
    registerLocation().then(() => setMode('near')).catch((e) => setLocNotice(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Avisos ----
  const toastTimer = useRef(null)
  const notify = useCallback((message, action) => {
    clearTimeout(toastTimer.current)
    setToast({ message, ...action })
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // El buscador del encabezado refleja la búsqueda actual
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (route.name === 'search') setQuery(route.q)
  }, [route])

  function submitSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    const target = `#/buscar?q=${encodeURIComponent(q)}`
    if (window.location.hash === target) setSearchNonce((n) => n + 1)
    else navigate(target)
  }

  // Notificaciones en tiempo real (WebSocket): al llegar una nueva se muestra un aviso con enlace
  const listeners = useRef(new Set())
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])
  const notif = useNotifications({
    onIncoming: (n) => {
      notify(describeNotification(n).title, n.post ? { href: `#/post/${n.post.id}`, label: 'Ver' } : undefined)
      listeners.current.forEach((fn) => fn(n))
    },
  })

  const ctx = useMemo(() => ({ user, coords, notify, subscribe }), [user, coords, notify, subscribe])
  const openPublish = () => setModalOpen(true)

  let view
  switch (route.name) {
    case 'search': view = <SearchView key={`${route.q}|${route.radius}|${searchNonce}`} q={route.q} radius={route.radius} />; break
    case 'achievements': view = <AchievementsView />; break
    case 'profile': view = <ProfileView username={route.username} />; break
    case 'post': view = <PostView id={route.id} />; break
    default:
      view = (
        <Home
          feed={feed}
          mode={mode}
          setMode={setMode}
          coords={coords}
          registerLocation={registerLocation}
          locLoading={locLoading}
          locNotice={locNotice}
          onPublish={openPublish}
        />
      )
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-[#FAFAF8] text-[#133E37] selection:bg-[#B7D5C6]">
        <div className="sticky top-0 z-40 border-b border-[#BCD2C6]/50 bg-[#FAFAF8]/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-sm sm:px-10 sm:py-3 md:px-14 lg:px-16">
        <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:gap-x-4">
          <a href="#/" className="flex items-center gap-2 font-black" aria-label="RescuePets, ir al inicio">
            <PawHeartIcon className="h-8 w-8" /> <span className="hidden sm:inline">RescuePets</span>
          </a>

          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            <a href="#/" className={navCls(route.name === 'home')} aria-current={route.name === 'home' ? 'page' : undefined}>Inicio</a>
            <a href="#/logros" className={navCls(route.name === 'achievements')} aria-current={route.name === 'achievements' ? 'page' : undefined}>
              <Trophy className="h-4 w-4" aria-hidden="true" /> Logros
            </a>
          </nav>

          <form role="search" onSubmit={submitSearch} className="order-3 flex min-w-0 basis-full items-center rounded-full border border-[#BCD2C6] bg-white pl-3 focus-within:border-[#133E37] sm:order-none sm:basis-auto sm:flex-1 sm:max-w-md">
            <Search className="h-4 w-4 shrink-0 text-[#133E37]/60" aria-hidden="true" />
            <input
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Buscar perro, gato, @usuario…"
              aria-label="Buscar"
              className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base focus:outline-none sm:py-2 sm:text-sm"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="p-1 text-[#133E37]/50 hover:text-[#133E37]">
                <X className="h-4 w-4" />
              </button>
            )}
            <button type="submit" className="m-1 rounded-full bg-[#133E37] px-3.5 py-1.5 font-semibold text-white active:scale-95 sm:py-1">Buscar</button>
          </form>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsMenu notif={notif} />
            <button onClick={openPublish} className="hidden items-center gap-1.5 rounded-full bg-[#133E37] px-3 py-1.5 font-semibold text-white hover:bg-[#0f322c] sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden="true" /> Publicar
            </button>
            <a href={`#/u/${user.username}`} className="hidden max-w-[16rem] truncate font-medium hover:underline md:inline" title={user.identifier}>@{user.username}</a>
            <button onClick={onLogout} aria-label="Cerrar sesión" className="hidden items-center gap-1.5 rounded-full border border-[#BCD2C6] px-3 py-1.5 font-semibold transition-colors hover:bg-[#E9F0EC] md:inline-flex">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Salir
            </button>
          </div>
        </header>
        </div>

        <div key={route.name} className="rp-fade flex flex-1 flex-col px-4 pb-28 pt-5 sm:px-10 sm:pt-8 md:px-14 md:pb-16 lg:px-16">
          {view}
        </div>

        {/* Decoración inferior */}
        <div className="pointer-events-none absolute bottom-8 right-12 hidden items-end opacity-60 md:flex" aria-hidden="true">
          <svg className="h-12 w-28 text-[#BCD2C6] sm:h-16 sm:w-36" viewBox="0 0 160 60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M 10 40 Q 60 55, 90 35 T 130 35" />
            <path d="M 125 32 C 125 32, 120 27, 120 23 C 120 20, 123 18, 126 20 C 127 21, 128 22, 128 22 C 128 22, 129 21, 130 20 C 133 18, 136 20, 136 23 C 136 27, 131 32, 131 32 Z" />
          </svg>
          <PawPrintIcon className="-ml-3 mb-1 h-8 w-8 rotate-12 text-[#BCD2C6] sm:h-10 sm:w-10" />
        </div>

        {modalOpen && (
          <PublishModal
            registered={coords}
            onClose={() => setModalOpen(false)}
            onPublished={(post) => {
              // Muestra el feed completo con la publicación nueva arriba
              if (mode === 'near') setMode('all')
              feed.prepend(post)
              if (route.name !== 'home') navigate('#/')
              notify('¡Publicado! Gracias por ayudar a este animalito.')
            }}
          />
        )}

        <BottomNav route={route} user={user} onPublish={openPublish} onLogout={onLogout} />
        <ScrollTop />

        {toast && (
          <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-[#133E37] px-5 py-3 text-sm text-white shadow-xl md:bottom-6">
            <span>{toast.message}</span>
            {toast.href && <a href={toast.href} onClick={() => setToast(null)} className="font-bold underline">{toast.label ?? 'Ver'}</a>}
            <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </AppContext.Provider>
  )
}

const tabCls = (active) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:scale-95 ${active ? 'text-[#133E37]' : 'text-[#133E37]/60'}`

/** Barra de navegación inferior (solo móvil): alcanzable con el pulgar. */
function BottomNav({ route, user, onPublish, onLogout }) {
  const profile = route.name === 'profile' && route.username === user.username
  return (
    <nav aria-label="Navegación móvil" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#BCD2C6] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(19,62,55,0.08)] md:hidden">
      <div className="mx-auto flex max-w-md items-end px-2">
        <a href="#/" className={tabCls(route.name === 'home')} aria-current={route.name === 'home' ? 'page' : undefined}>
          <HomeIcon className="h-5 w-5" aria-hidden="true" /> Inicio
        </a>
        <a href="#/logros" className={tabCls(route.name === 'achievements')} aria-current={route.name === 'achievements' ? 'page' : undefined}>
          <Trophy className="h-5 w-5" aria-hidden="true" /> Logros
        </a>
        <div className="flex flex-1 justify-center">
          <button onClick={onPublish} aria-label="Publicar mascota" className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[#133E37] text-white shadow-lg active:scale-95">
            <Plus className="h-7 w-7" aria-hidden="true" />
          </button>
        </div>
        <a href={`#/u/${user.username}`} className={tabCls(profile)} aria-current={profile ? 'page' : undefined}>
          <User className="h-5 w-5" aria-hidden="true" /> Perfil
        </a>
        <button onClick={onLogout} className={tabCls(false)}>
          <LogOut className="h-5 w-5" aria-hidden="true" /> Salir
        </button>
      </div>
    </nav>
  )
}

/** Botón flotante para volver arriba tras desplazarse. */
function ScrollTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 800)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!show) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 rounded-full border border-[#BCD2C6] bg-white p-3 text-[#133E37] shadow-lg active:scale-95 md:bottom-6 md:right-6"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}
