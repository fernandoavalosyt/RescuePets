import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, Send, X } from 'lucide-react'
import * as api from './api'
import { PawHeartIcon } from './Icons'

const STORE = 'rp_chat'
const MAX_INPUT = 1000
const WELCOME = '¡Guau! Soy **Patitas**, el asistente de RescuePets. Puedo ayudarte con qué hacer si encuentras un animalito, consejos de cuidado y adopción, o cómo usar la app.'
const SUGGESTIONS = [
  '¿Qué hago si encuentro un perro callejero?',
  '¿Cómo publico un animalito?',
  '¿Cómo funciona el rescate?',
  'Consejos para adoptar un gato',
]

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || '[]')
    return Array.isArray(saved) ? saved.filter((m) => (m.role === 'user' || m.role === 'model') && typeof m.text === 'string') : []
  } catch { return [] }
}

// Texto del asistente -> React (negritas y listas simples). Sin HTML crudo: no hay riesgo de inyección.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
}
function Rich({ text }) {
  const blocks = []
  let list = null
  text.split('\n').forEach((line, i) => {
    const item = /^\s*[-*•]\s+(.*)$/.exec(line) || /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (item) {
      if (!list) { list = []; blocks.push({ list }) }
      list.push(<li key={i}>{inline(item[1])}</li>)
    } else {
      list = null
      if (line.trim()) blocks.push({ p: <p key={i}>{inline(line)}</p> })
    }
  })
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (b.list ? <ul key={i} className="list-disc space-y-1 pl-5">{b.list}</ul> : b.p))}
    </div>
  )
}

/** Chat con el asistente (Gemini, vía backend). Pantalla completa en móvil; panel flotante en pantallas grandes. */
export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState(load)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(null) // null = comprobando
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    api.chatConfig().then((c) => setEnabled(c.enabled)).catch(() => setEnabled(false))
  }, [])

  // Guarda la conversación solo en esta pestaña
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-40))) } catch { /* sin almacenamiento */ }
  }, [messages])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy, error])

  // Escape cierra; en móvil se bloquea el scroll de la página de fondo
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    if (window.matchMedia('(max-width: 639px)').matches) document.body.style.overflow = 'hidden'
    inputRef.current?.focus({ preventScroll: true })
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const send = useCallback(async (raw, base) => {
    const text = raw.trim().slice(0, MAX_INPUT)
    if (!text || busy) return
    const history = [...(base ?? messages), { role: 'user', text }]
    setMessages(history)
    setInput('')
    setError('')
    setBusy(true)
    try {
      // El historial se recorta (últimos 10, respuestas largas acortadas) para ahorrar cuota
      const payload = history.slice(-10).map((m) => ({ role: m.role, text: m.role === 'model' ? m.text.slice(0, 800) : m.text }))
      const { reply } = await api.chatAsk(payload)
      setMessages((prev) => [...prev, { role: 'model', text: reply }])
    } catch (e) {
      setError(e.message || 'No se pudo enviar el mensaje.')
    } finally {
      setBusy(false)
    }
  }, [busy, messages])

  function retry() {
    const last = messages.at(-1)
    if (last?.role === 'user') send(last.text, messages.slice(0, -1))
  }

  function reset() {
    setMessages([])
    setError('')
    setInput('')
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
  }

  const empty = messages.length === 0

  return (
    <>
      <div className="fixed inset-0 z-50 hidden bg-black/20 sm:block" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-label="Asistente RescuePets"
        className="rp-sheet fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-[#FAFAF8] text-[#133E37] sm:inset-auto sm:left-10 sm:top-20 sm:h-[min(36rem,calc(100dvh-6rem))] sm:w-[24rem] sm:rounded-3xl sm:border sm:border-[#BCD2C6] sm:shadow-2xl md:left-14 lg:left-16"
      >
        <header className="flex shrink-0 items-center gap-3 bg-[#133E37] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15"><PawHeartIcon className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black leading-tight">Patitas</h2>
            <p className="truncate text-xs text-white/70">Asistente de RescuePets</p>
          </div>
          {!empty && (
            <button type="button" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación" className="rounded-full p-2.5 hover:bg-white/15 active:scale-95">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar asistente" className="rounded-full p-2.5 hover:bg-white/15 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 text-sm" aria-live="polite">
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm"><Rich text={WELCOME} /></div>

          {empty && enabled !== false && (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} disabled={busy || !enabled}
                  className="rounded-full border border-[#BCD2C6] bg-white px-3 py-2 text-left text-xs font-semibold hover:bg-[#E9F0EC] active:scale-95 disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            m.role === 'user'
              ? <div key={i} className="ml-auto max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-[#133E37] px-3.5 py-2.5 text-white">{m.text}</div>
              : <div key={i} className="max-w-[88%] break-words rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm"><Rich text={m.text} /></div>
          ))}

          {busy && (
            <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-sm bg-white px-3.5 py-3.5 shadow-sm" role="status" aria-label="Escribiendo">
              {[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#133E37]/50" style={{ animationDelay: `${d * 0.15}s` }} />)}
            </div>
          )}

          {enabled === false && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">El asistente no está disponible por ahora. Intenta más tarde.</p>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {error}{' '}
              {messages.at(-1)?.role === 'user' && <button type="button" onClick={retry} className="font-bold underline">Reintentar</button>}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="shrink-0 border-t border-[#BCD2C6]/60 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={MAX_INPUT}
              disabled={enabled === false}
              placeholder="Escribe tu pregunta…"
              aria-label="Mensaje"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-[#BCD2C6] bg-[#FAFAF8] px-3.5 py-2.5 text-base focus:border-[#133E37] focus:outline-none sm:text-sm"
            />
            <button type="submit" disabled={!input.trim() || busy || enabled === false} aria-label="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#133E37] text-white active:scale-95 disabled:opacity-40">
              <Send className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#133E37]/50">Asistente con IA: puede equivocarse. En urgencias, acude a un veterinario.</p>
        </form>
      </section>
    </>
  )
}
