import { useCallback, useEffect, useState } from 'react'
import { Activity, FileText, HeartHandshake, ShieldBan, Smartphone, UserPlus, Users, Wifi } from 'lucide-react'
import * as api from '../api'

function Card({ icon: Icon, label, value, hint, tone = 'bg-white' }) {
  return (
    <div className={`rounded-2xl border border-[#BCD2C6] p-4 shadow-sm ${tone}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#133E37]/60">
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </div>
      <p className="mt-2 text-3xl font-black tabular-nums">{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-[#133E37]/60">{hint}</p>}
    </div>
  )
}

// Últimos 14 días (rellena con 0 los días sin registros)
function SignupChart({ signups }) {
  const byDay = Object.fromEntries(signups.map((s) => [s.day, s.n]))
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000)
    const key = d.toISOString().slice(0, 10)
    return { key, n: byDay[key] ?? 0, label: d.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }
  })
  const max = Math.max(1, ...days.map((d) => d.n))
  return (
    <figure className="rounded-2xl border border-[#BCD2C6] bg-white p-4 shadow-sm">
      <figcaption className="mb-3 text-sm font-bold">Registros por día (últimos 14 días, UTC)</figcaption>
      <div className="flex h-32 items-end gap-1 sm:gap-1.5" role="img" aria-label={`Registros por día: ${days.map((d) => `${d.label} ${d.n}`).join(', ')}`}>
        {days.map((d) => (
          <div key={d.key} className="flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${d.n}`}>
            <span className="mb-1 text-center text-[10px] font-semibold tabular-nums text-[#133E37]/70">{d.n || ''}</span>
            <div className="w-full rounded-t-md bg-[#133E37]" style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.15 }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-[#133E37]/50"><span>{days[0].label}</span><span>{days[13].label}</span></div>
    </figure>
  )
}

export default function AdminOverview() {
  const [s, setS] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api.adminStats().then((d) => { setS(d); setError('') }).catch((e) => setError(e.message)), [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const t = setInterval(load, 30_000) // se actualiza solo
    return () => clearInterval(t)
  }, [load])

  if (error && !s) return <p className="text-sm text-red-600" role="alert">{error}</p>
  if (!s) return <p className="text-sm text-[#133E37]/60">Cargando…</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card icon={Users} label="Usuarios" value={s.users.total} hint={`${s.users.active} activos`} />
        <Card icon={Wifi} label="En línea ahora" value={s.online} hint="Con la app abierta" tone="bg-emerald-50" />
        <Card icon={Activity} label="Activos 24 h" value={s.users.seen24h} hint={`${s.users.seen7d} en 7 días`} />
        <Card icon={UserPlus} label="Nuevos" value={s.users.new24h} hint={`${s.users.new7d} en 7 días`} />
        <Card icon={FileText} label="Publicaciones" value={s.posts.total} hint={`${s.posts.today} hoy`} />
        <Card icon={HeartHandshake} label="Rescates" value={s.rescues.approved} hint={`${s.rescues.pending} pendientes`} />
        <Card icon={ShieldBan} label="Bloqueados" value={s.users.banned} tone={s.users.banned ? 'bg-red-50' : 'bg-white'} />
        <Card icon={Smartphone} label="Avisos push" value={s.pushDevices} hint="Dispositivos suscritos" />
      </div>
      <SignupChart signups={s.signups} />
      <p className="text-xs text-[#133E37]/50">
        {s.users.neverLoggedIn} cuenta(s) sin inicio de sesión registrado · {s.comments} comentarios · actualizado {new Date(s.generatedAt).toLocaleTimeString('es')}
      </p>
    </div>
  )
}
