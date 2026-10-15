import { useState } from 'react'
import { LayoutDashboard, LogOut, ScrollText, ShieldCheck, Users } from 'lucide-react'
import AdminOverview from './AdminOverview'
import AdminUsers from './AdminUsers'
import AdminAudit from './AdminAudit'

const TABS = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'audit', label: 'Bitácora', icon: ScrollText },
]
const VIEWS = { overview: AdminOverview, users: AdminUsers, audit: AdminAudit }

/** Panel de administración: se muestra en lugar de la app normal cuando entra la cuenta de administrador. */
export default function AdminApp({ admin, onLogout }) {
  const [tab, setTab] = useState(() => {
    try { return TABS.some((t) => t.id === sessionStorage.getItem('rp_admin_tab')) ? sessionStorage.getItem('rp_admin_tab') : 'overview' } catch { return 'overview' }
  })
  const View = VIEWS[tab]
  const choose = (id) => {
    setTab(id)
    try { sessionStorage.setItem('rp_admin_tab', id) } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="min-h-dvh bg-[#FAFAF8] text-[#133E37]">
      <header className="sticky top-0 z-40 bg-[#133E37] px-4 pt-[max(0.5rem,env(safe-area-inset-top))] text-white shadow-md sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3 py-2">
          <ShieldCheck className="h-6 w-6 shrink-0" aria-hidden="true" />
          <h1 className="min-w-0 flex-1 truncate text-base font-black sm:text-lg">RescuePets <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">Admin</span></h1>
          <span className="hidden text-sm text-white/70 sm:inline">@{admin.username}</span>
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1.5 text-sm font-semibold hover:bg-white/10 active:scale-95">
            <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Salir</span><span className="sr-only sm:hidden">Salir</span>
          </button>
        </div>
        <nav aria-label="Secciones" role="tablist" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => choose(id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab === id ? 'bg-[#FAFAF8] text-[#133E37]' : 'text-white/80 hover:bg-white/10'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="rp-fade mx-auto max-w-6xl px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-8" key={tab}>
        <View />
      </main>
    </div>
  )
}
