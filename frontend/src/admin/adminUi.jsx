import { timeAgo } from '../lib'

export const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

/** "hace 5 min" con la fecha exacta al pasar el cursor; "Nunca" si no hay dato. */
export function When({ ms, never = 'Nunca' }) {
  if (!ms) return <span className="text-[#133E37]/40">{never}</span>
  return <time dateTime={new Date(ms).toISOString()} title={fmtDate(ms)}>{timeAgo(ms)}</time>
}

const STATUS = {
  active: ['Activo', 'bg-emerald-100 text-emerald-800'],
  banned: ['Bloqueado', 'bg-red-100 text-red-800'],
  inactive: ['Inactivo', 'bg-stone-200 text-stone-700'],
}
export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] ?? [status, 'bg-stone-200 text-stone-700']
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
}

export function OnlineDot({ online }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${online ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-stone-300'}`}
      title={online ? 'En línea' : 'Desconectado'}
      role="img"
      aria-label={online ? 'En línea' : 'Desconectado'}
    />
  )
}

export function Avatar({ name }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#133E37] text-sm font-black uppercase text-white" aria-hidden="true">
      {(name || '?').slice(0, 1)}
    </span>
  )
}

export const btn = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary = `${btn} bg-[#133E37] text-white hover:bg-[#0f322c]`
export const btnGhost = `${btn} border border-[#BCD2C6] bg-white hover:bg-[#E9F0EC]`
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-700`
export const input = 'w-full rounded-xl border border-[#BCD2C6] bg-white px-3 py-2.5 text-base focus:border-[#133E37] focus:outline-none sm:text-sm'
