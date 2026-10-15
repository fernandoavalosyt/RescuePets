import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownUp, Ban, CheckCircle2, Download, LogOut, Search, Trash2, X } from 'lucide-react'
import * as api from '../api'
import { Avatar, OnlineDot, StatusBadge, When, btnDanger, btnGhost, btnPrimary, fmtDate, input } from './adminUi'

const SORTS = [
  ['created', 'Fecha de registro'],
  ['seen', 'Última actividad'],
  ['login', 'Último inicio de sesión'],
  ['logins', 'Más inicios de sesión'],
  ['posts', 'Más publicaciones'],
  ['username', 'Nombre de usuario'],
]
const FILTERS = [['', 'Todos'], ['online', 'En línea'], ['active', 'Activos'], ['banned', 'Bloqueados']]
const POST_STATUS = { active: 'Activa', resolved: 'Rescatada', rescued: 'Rescatada', hidden: 'Oculta' }

/** Confirmación para eliminar: hay que escribir el nombre de usuario exacto. */
function DeleteDialog({ user, onCancel, onDeleted }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await api.adminDeleteUser(user.id, confirm); onDeleted() } catch (err) { setError(err.message); setBusy(false) }
  }
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Eliminar usuario">
      <form onSubmit={submit} className="rp-fade w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-black text-red-700">Eliminar a @{user.username}</h3>
        <p className="text-sm">
          Se borrarán <strong>para siempre</strong> su cuenta, publicaciones, fotos, comentarios, rescates y notificaciones. Esta acción no se puede deshacer.
          Si solo quieres impedir que entre, usa <strong>Bloquear</strong>.
        </p>
        <label className="block text-sm font-semibold">
          Escribe <code className="rounded bg-[#E9F0EC] px-1.5 py-0.5">{user.username}</code> para confirmar
          <input autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${input} mt-1.5`} autoComplete="off" autoCapitalize="none" />
        </label>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnGhost}>Cancelar</button>
          <button type="submit" disabled={busy || confirm.trim().toLowerCase() !== user.username} className={btnDanger}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

/** Panel de detalle: datos, edición, bloqueo, sesiones, historial de accesos y publicaciones. */
function UserDrawer({ id, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const [form, setForm] = useState({ username: '', displayName: '' })
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [askDelete, setAskDelete] = useState(false)

  const load = useCallback(async () => {
    const data = await api.adminUser(id)
    setD(data)
    setForm({ username: data.user.username, displayName: data.user.displayName })
  }, [id])
  useEffect(() => { load().catch((e) => setMsg(e.message)) }, [load])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !askDelete) onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, askDelete])

  async function run(fn, ok) {
    setBusy(true)
    setMsg('')
    setErrors({})
    try { await fn(); await load(); onChanged(); if (ok) setMsg(ok) } catch (e) { setErrors(e.fields || {}); setMsg(e.message) } finally { setBusy(false) }
  }

  const u = d?.user
  const dirty = u && (form.username !== u.username || form.displayName !== u.displayName)

  // En un portal: así ningún contenedor con animación/transformación altera su posición fija
  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label="Detalle de usuario" className="rp-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-[#FAFAF8] shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-[#BCD2C6] bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {u && <Avatar name={u.username} />}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 truncate text-base font-black">{u ? `@${u.username}` : 'Cargando…'} {u && <OnlineDot online={u.online} />}</h2>
            {u && <p className="truncate text-xs text-[#133E37]/60">{u.contact}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-2.5 hover:bg-[#E9F0EC]"><X className="h-5 w-5" /></button>
        </header>

        {u && (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={u.status} />
              <span className="text-xs text-[#133E37]/60">ID {u.id} · registrado {fmtDate(u.createdAt)}</span>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-[#BCD2C6] bg-white p-4">
              <div><dt className="text-xs text-[#133E37]/60">Último inicio de sesión</dt><dd className="font-semibold"><When ms={u.lastLoginAt} /></dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Última actividad</dt><dd className="font-semibold">{u.online ? 'Ahora mismo' : <When ms={u.lastSeenAt} />}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Inicios de sesión</dt><dd className="font-semibold">{u.loginCount}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Sesiones abiertas</dt><dd className="font-semibold">{d.activeSessions}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Publicaciones</dt><dd className="font-semibold">{u.postCount}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Comentarios · Me gusta · Rescates</dt><dd className="font-semibold">{d.counts.comments} · {d.counts.likes} · {d.counts.rescues}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Avisos en dispositivos</dt><dd className="font-semibold">{d.pushDevices}</dd></div>
              <div><dt className="text-xs text-[#133E37]/60">Ubicación registrada</dt><dd className="font-semibold">{u.hasLocation ? 'Sí' : 'No'}</dd></div>
            </dl>

            <form onSubmit={(e) => { e.preventDefault(); run(() => api.adminUpdateUser(id, form), 'Cambios guardados.') }} className="space-y-3 rounded-2xl border border-[#BCD2C6] bg-white p-4">
              <h3 className="font-bold">Editar nombres</h3>
              <label className="block font-semibold">Usuario
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={`${input} mt-1`} maxLength={30} autoCapitalize="none" aria-invalid={!!errors.username} />
                {errors.username && <small className="font-normal text-red-600" role="alert">{errors.username}</small>}
              </label>
              <label className="block font-semibold">Nombre visible
                <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={`${input} mt-1`} maxLength={50} aria-invalid={!!errors.displayName} />
                {errors.displayName && <small className="font-normal text-red-600" role="alert">{errors.displayName}</small>}
              </label>
              <p className="text-xs text-[#133E37]/50">La contraseña no se puede ver ni cambiar desde aquí.</p>
              <button type="submit" disabled={busy || !dirty} className={btnPrimary}>Guardar cambios</button>
            </form>

            {msg && <p className={`rounded-xl px-3 py-2 text-xs ${/guardados|cerrad|bloquead/i.test(msg) && !Object.keys(errors).length ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{msg}</p>}

            <div className="flex flex-wrap gap-2">
              {u.status === 'banned'
                ? <button disabled={busy} onClick={() => run(() => api.adminSetStatus(id, 'active'), 'Usuario desbloqueado.')} className={btnGhost}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Desbloquear</button>
                : <button disabled={busy} onClick={() => run(() => api.adminSetStatus(id, 'banned'), 'Usuario bloqueado: no podrá entrar.')} className={btnGhost}><Ban className="h-4 w-4" aria-hidden="true" /> Bloquear</button>}
              <button disabled={busy || !d.activeSessions} onClick={() => run(() => api.adminLogoutUser(id), 'Sesiones cerradas.')} className={btnGhost}><LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesiones</button>
              <button disabled={busy} onClick={() => setAskDelete(true)} className={`${btnGhost} border-red-300 text-red-700 hover:bg-red-50`}><Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar</button>
            </div>

            <section>
              <h3 className="mb-2 font-bold">Últimos accesos</h3>
              {d.logins.length ? (
                <ul className="divide-y divide-[#BCD2C6]/50 overflow-hidden rounded-2xl border border-[#BCD2C6] bg-white">
                  {d.logins.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-x-3 px-4 py-2.5">
                      <span className="font-medium">{fmtDate(l.at)}</span>
                      <span className="text-xs text-[#133E37]/60">{l.device}{l.ip ? ` · ${l.ip}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-2xl border border-[#BCD2C6] bg-white p-4 text-[#133E37]/60">Sin accesos registrados todavía.</p>}
            </section>

            <section>
              <h3 className="mb-2 font-bold">Publicaciones recientes</h3>
              {d.posts.length ? (
                <ul className="divide-y divide-[#BCD2C6]/50 overflow-hidden rounded-2xl border border-[#BCD2C6] bg-white">
                  {d.posts.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block break-words">{p.snippet}</span>
                        <span className="text-xs text-[#133E37]/50">#{p.id} · {POST_STATUS[p.status] ?? p.status} · {fmtDate(p.createdAt)}</span>
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => { if (window.confirm('¿Eliminar esta publicación?')) run(() => api.adminRemovePost(p.id), 'Publicación eliminada.') }}
                        aria-label={`Eliminar publicación ${p.id}`}
                        className="rounded-full p-2 text-red-600 hover:bg-red-50"
                      ><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-2xl border border-[#BCD2C6] bg-white p-4 text-[#133E37]/60">No tiene publicaciones.</p>}
            </section>
          </div>
        )}
        {!u && msg && <p className="p-4 text-sm text-red-600" role="alert">{msg}</p>}
      </aside>
      {askDelete && u && <DeleteDialog user={u} onCancel={() => setAskDelete(false)} onDeleted={() => { setAskDelete(false); onChanged(); onClose() }} />}
    </>,
    document.body,
  )
}

export default function AdminUsers() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('created')
  const [dir, setDir] = useState('desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let live = true
    api.adminUsers({ q: debouncedQ, status, sort, dir, page, limit: 20 })
      .then((d) => { if (live) { setData(d); setError('') } })
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [debouncedQ, status, sort, dir, page, tick])

  async function exportCsv() {
    try {
      const blob = await api.adminExportCsv()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#133E37]/50" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por usuario, nombre, correo o teléfono" aria-label="Buscar usuarios" className={`${input} pl-9`} maxLength={100} />
        </label>
        <div className="flex gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filtrar por estado" className={`${input} sm:w-auto`}>
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} aria-label="Ordenar por" className={`${input} sm:w-auto`}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={() => setDir(dir === 'desc' ? 'asc' : 'desc')} className={`${btnGhost} px-3`} aria-label={dir === 'desc' ? 'Orden descendente' : 'Orden ascendente'} title={dir === 'desc' ? 'Descendente' : 'Ascendente'}>
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-[#133E37]/70">
        <span>{data ? `${data.total} usuario(s)` : 'Cargando…'}</span>
        <button onClick={exportCsv} className={btnGhost}><Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV</button>
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {data && !data.users.length && <p className="rounded-2xl border border-[#BCD2C6] bg-white p-8 text-center text-sm text-[#133E37]/60">No hay usuarios con ese filtro.</p>}

      {data && data.users.length > 0 && (
        <>
          {/* Tabla en pantallas medianas y grandes */}
          <div className="hidden overflow-x-auto rounded-2xl border border-[#BCD2C6] bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#E9F0EC] text-xs uppercase tracking-wide text-[#133E37]/70">
                <tr>
                  <th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Último acceso</th><th className="px-4 py-3">Última actividad</th>
                  <th className="px-4 py-3 text-right">Accesos</th><th className="px-4 py-3 text-right">Posts</th><th className="px-4 py-3">Registro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#BCD2C6]/40">
                {data.users.map((u) => (
                  <tr key={u.id} onClick={() => setSelected(u.id)} className="cursor-pointer hover:bg-[#F1F7F3]">
                    <td className="px-4 py-3">
                      <button className="flex items-center gap-3 text-left" onClick={() => setSelected(u.id)}>
                        <Avatar name={u.username} />
                        <span className="min-w-0"><span className="flex items-center gap-2 font-semibold">@{u.username} <OnlineDot online={u.online} /></span><span className="block max-w-[12rem] truncate text-xs text-[#133E37]/60">{u.displayName}</span></span>
                      </button>
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-3">{u.contact}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3"><When ms={u.lastLoginAt} /></td>
                    <td className="whitespace-nowrap px-4 py-3">{u.online ? <span className="font-semibold text-emerald-700">En línea</span> : <When ms={u.lastSeenAt} />}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.loginCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.postCount}</td>
                    <td className="whitespace-nowrap px-4 py-3"><When ms={u.createdAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en móvil */}
          <ul className="space-y-2 md:hidden">
            {data.users.map((u) => (
              <li key={u.id}>
                <button onClick={() => setSelected(u.id)} className="flex w-full items-start gap-3 rounded-2xl border border-[#BCD2C6] bg-white p-3 text-left shadow-sm active:scale-[0.99]">
                  <Avatar name={u.username} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold"><span className="truncate">@{u.username}</span> <OnlineDot online={u.online} /><span className="ml-auto"><StatusBadge status={u.status} /></span></span>
                    <span className="block truncate text-xs text-[#133E37]/60">{u.contact}</span>
                    <span className="mt-1 block text-xs">
                      Último acceso: <When ms={u.lastLoginAt} /> · {u.online ? <strong className="text-emerald-700">en línea</strong> : <>visto <When ms={u.lastSeenAt} /></>}
                    </span>
                    <span className="block text-xs text-[#133E37]/50">{u.loginCount} accesos · {u.postCount} publicaciones</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {data.pages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {data.page} de {data.pages}</span>
              <button className={btnGhost} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {selected && <UserDrawer key={selected} id={selected} onClose={() => setSelected(null)} onChanged={() => setTick((n) => n + 1)} />}
    </div>
  )
}
