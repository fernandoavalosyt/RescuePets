import { useEffect, useState } from 'react'
import * as api from '../api'
import { btnGhost, fmtDate } from './adminUi'

const LABELS = {
  login: ['Inicio de sesión de admin', 'bg-emerald-100 text-emerald-800'],
  login_failed: ['Intento de acceso fallido', 'bg-amber-100 text-amber-800'],
  user_edit: ['Usuario editado', 'bg-sky-100 text-sky-800'],
  user_ban: ['Usuario bloqueado', 'bg-red-100 text-red-800'],
  user_unban: ['Usuario desbloqueado', 'bg-emerald-100 text-emerald-800'],
  user_logout: ['Sesiones cerradas', 'bg-stone-200 text-stone-700'],
  user_delete: ['Usuario eliminado', 'bg-red-100 text-red-800'],
  post_remove: ['Publicación eliminada', 'bg-red-100 text-red-800'],
  export_sheets: ['Exportado a Google Sheets', 'bg-emerald-100 text-emerald-800'],
  export_sheets_failed: ['Falló la exportación a Sheets', 'bg-amber-100 text-amber-800'],
  export_csv: ['Exportación CSV', 'bg-violet-100 text-violet-800'],
}

/** Bitácora de todo lo que hace el administrador (quién, qué, cuándo y desde qué IP). */
export default function AdminAudit() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    api.adminAudit({ page }).then((d) => live && setData(d)).catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [page])

  if (error) return <p className="text-sm text-red-600" role="alert">{error}</p>
  if (!data) return <p className="text-sm text-[#133E37]/60">Cargando…</p>

  return (
    <div className="space-y-3">
      {!data.entries.length && <p className="rounded-2xl border border-[#BCD2C6] bg-white p-6 text-center text-sm text-[#133E37]/60">Aún no hay actividad registrada.</p>}
      <ul className="divide-y divide-[#BCD2C6]/50 overflow-hidden rounded-2xl border border-[#BCD2C6] bg-white shadow-sm">
        {data.entries.map((e) => {
          const [label, cls] = LABELS[e.action] ?? [e.action, 'bg-stone-200 text-stone-700']
          return (
            <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className={`w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold sm:w-48 sm:text-center ${cls}`}>{label}</span>
              <span className="min-w-0 flex-1 break-words">
                {e.target && <strong>@{e.target} </strong>}
                <span className="text-[#133E37]/70">{e.detail}</span>
              </span>
              <span className="shrink-0 text-xs text-[#133E37]/50">{fmtDate(e.at)}{e.ip ? ` · ${e.ip}` : ''}</span>
            </li>
          )
        })}
      </ul>
      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {data.page} de {data.pages}</span>
          <button className={btnGhost} disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  )
}
