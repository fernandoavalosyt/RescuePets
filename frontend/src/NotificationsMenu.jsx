import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, Settings, X } from 'lucide-react'
import * as api from './api'
import { describeNotification } from './notificationText'
import { navigate } from './useHashRoute'
import { timeAgo } from './lib'

const TABS = [
  { id: 'all', label: 'Todas' },
  { id: 'nearby', label: 'Cerca de ti', badge: 'nearby' },
  { id: 'activity', label: 'Actividad', badge: 'activity' },
]

function SettingsPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getNotificationSettings().then(setData).catch((e) => setError(e.message))
  }, [])

  async function save(patch) {
    setError('')
    const prev = data
    setData({ ...data, settings: { ...data.settings, ...patch } })
    try {
      setData({ ...prev, ...(await api.updateNotificationSettings(patch)) })
    } catch (e) {
      setData(prev)
      setError(e.message)
    }
  }

  if (!data) return <p className="p-4 text-sm text-[#133E37]/60">{error || 'Cargando…'}</p>
  const { nearby, radiusKm } = data.settings
  return (
    <div className="space-y-3 p-4 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="font-semibold">Avisarme de animalitos cerca</span>
          <span className="block text-xs text-[#133E37]/60">Usa tu ubicación registrada.</span>
        </span>
        <input type="checkbox" checked={nearby} onChange={(e) => save({ nearby: e.target.checked })} className="h-5 w-5 accent-[#133E37]" />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span className="font-semibold">Radio</span>
        <select
          value={radiusKm}
          disabled={!nearby}
          onChange={(e) => save({ radiusKm: Number(e.target.value) })}
          className="rounded-full border border-[#BCD2C6] bg-white px-3 py-1 disabled:opacity-50"
        >
          {data.radii.map((r) => <option key={r} value={r}>{r} km</option>)}
        </select>
      </label>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  )
}

function Item({ n, onOpen }) {
  const { title, body } = describeNotification(n)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E9F0EC] ${n.read ? '' : 'bg-[#F1F7F3]'}`}
      >
        {n.post?.thumbnail
          ? <img src={n.post.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
          : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#E9F0EC]"><Bell className="h-5 w-5" aria-hidden="true" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug">{title}</span>
          {body && <span className="block truncate text-xs text-[#133E37]/70">{body}</span>}
          {n.post && n.type !== 'comment' && n.type !== 'reply' && <span className="block truncate text-xs text-[#133E37]/50">{n.post.snippet}</span>}
          <span className="block text-xs text-[#133E37]/50">{timeAgo(n.createdAt)}</span>
        </span>
        {!n.read && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Sin leer" />}
      </button>
    </li>
  )
}

/** Campana con contador + panel desplegable (todas · cerca de ti · actividad). `notif` viene de useNotifications. */
export default function NotificationsMenu({ notif }) {
  const [open, setOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const box = useRef(null)
  const { counts, group, items, loading, error, hasMore } = notif

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  function toggle() {
    if (!open) { notif.open(); setShowSettings(false) }
    setOpen((v) => !v)
  }

  function openItem(n) {
    if (!n.read) notif.markRead(n.id)
    setOpen(false)
    if (n.post) navigate(`#/post/${n.post.id}`)
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={counts.unread ? `Notificaciones: ${counts.unread} sin leer` : 'Notificaciones'}
        className="relative rounded-full border border-[#BCD2C6] bg-white p-2.5 transition-colors hover:bg-[#E9F0EC] active:scale-95 sm:p-2"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {counts.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">
            {counts.unread > 99 ? '99+' : counts.unread}
          </span>
        )}
      </button>

      {open && (
        <>
        {/* Móvil: hoja inferior con fondo oscuro (no se sale de la pantalla). Escritorio: menú bajo la campana. */}
        <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
        <div role="dialog" aria-label="Notificaciones" className="rp-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-[#BCD2C6] bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:max-h-none sm:w-96 sm:rounded-3xl sm:pb-0">
          <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#BCD2C6] sm:hidden" aria-hidden="true" />
          <div className="flex shrink-0 items-center justify-between border-b border-[#BCD2C6]/60 px-4 py-3">
            <h2 className="text-base font-black">Notificaciones</h2>
            <span className="flex items-center gap-1">
              <button type="button" onClick={notif.markAll} disabled={!counts.unread} title="Marcar como leídas" aria-label="Marcar como leídas" className="rounded-full p-1.5 hover:bg-[#E9F0EC] disabled:opacity-40">
                <CheckCheck className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setShowSettings((v) => !v)} aria-pressed={showSettings} title="Preferencias" aria-label="Preferencias de avisos" className="rounded-full p-1.5 hover:bg-[#E9F0EC]">
                <Settings className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-1.5 hover:bg-[#E9F0EC] sm:hidden">
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>

          {showSettings ? <SettingsPanel /> : (
            <>
              <div role="tablist" aria-label="Tipo de notificación" className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={group === t.id}
                    onClick={() => notif.changeGroup(t.id)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${group === t.id ? 'bg-[#133E37] text-white' : 'hover:bg-[#E9F0EC]'}`}
                  >
                    {t.label}{t.badge && counts[t.badge] > 0 ? ` (${counts[t.badge]})` : ''}
                  </button>
                ))}
              </div>
              {group === 'nearby' && <p className="px-4 pt-2 text-xs text-[#133E37]/70">Puedes rescatar o ayudar a estos animales.</p>}

              <ul className="mt-1 min-h-0 flex-1 divide-y sm:max-h-[26rem] divide-[#BCD2C6]/40 overflow-y-auto overscroll-contain">
                {items.map((n) => <Item key={n.id} n={n} onOpen={openItem} />)}
              </ul>
              {loading && <p className="p-4 text-center text-sm text-[#133E37]/60">Cargando…</p>}
              {error && <p className="p-4 text-center text-sm text-red-600" role="alert">{error}</p>}
              {!loading && !error && !items.length && (
                <p className="p-6 text-center text-sm text-[#133E37]/60">
                  {group === 'nearby' ? 'No hay animalitos reportados cerca de ti por ahora.' : 'No tienes notificaciones.'}
                </p>
              )}
              {hasMore && !loading && (
                <button type="button" onClick={notif.loadMore} className="block w-full border-t border-[#BCD2C6]/40 py-2.5 text-sm font-semibold hover:bg-[#E9F0EC]">Ver más</button>
              )}
            </>
          )}
        </div>
        </>
      )}
    </div>
  )
}
