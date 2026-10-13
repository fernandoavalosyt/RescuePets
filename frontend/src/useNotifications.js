import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'

const EMPTY = { unread: 0, nearby: 0, activity: 0 }
const matches = (group, n) => group === 'all' || (group === 'nearby') === (n.type === 'nearby_pet')

/**
 * Notificaciones en tiempo real. Se conecta por WebSocket (con reconexión automática) y, mientras no haya
 * conexión, consulta los contadores cada 60 s. La lista se pide por REST al abrir el menú.
 * onIncoming(notification): se llama cuando llega una notificación nueva (para mostrar un aviso).
 */
export function useNotifications({ onIncoming }) {
  const [counts, setCounts] = useState(EMPTY)
  const [group, setGroup] = useState('all') // all | nearby | activity
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const groupRef = useRef(group)
  const incoming = useRef(onIncoming)
  const seq = useRef(0)
  useEffect(() => { groupRef.current = group; incoming.current = onIncoming })

  const load = useCallback(async (g, after) => {
    const id = ++seq.current
    setLoading(true)
    setError('')
    try {
      const data = await api.getNotifications({ group: g === 'all' ? undefined : g, cursor: after || undefined, limit: 15 })
      if (id !== seq.current) return
      setItems((prev) => (after ? [...prev, ...data.notifications.filter((n) => !prev.some((x) => x.id === n.id))] : data.notifications))
      setCursor(data.nextCursor)
      setCounts(data.counts)
    } catch (e) {
      if (id === seq.current) setError(e.message)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [])

  // WebSocket con reconexión exponencial (1 s … 30 s)
  useEffect(() => {
    let ws
    let timer
    let attempts = 0
    let closed = false

    function connect() {
      ws = new WebSocket(api.WS_URL)
      ws.onopen = () => { attempts = 0; setConnected(true) }
      ws.onmessage = (e) => {
        let m
        try { m = JSON.parse(e.data) } catch { return }
        if (m.type === 'ready' && m.counts) setCounts(m.counts)
        if (m.type === 'notification') {
          setCounts(m.counts)
          const n = m.notification
          setItems((prev) => (matches(groupRef.current, n) ? [n, ...prev.filter((x) => x.id !== n.id)] : prev))
          incoming.current?.(n)
        }
      }
      ws.onclose = (e) => {
        setConnected(false)
        if (closed || e.code === 4401) return // 4401: la sesión expiró
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++))
      }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { closed = true; clearTimeout(timer); ws?.close() }
  }, [])

  // Sin WebSocket: contadores por consulta periódica
  useEffect(() => {
    if (connected) return undefined
    const poll = () => api.getUnreadCounts().then(setCounts).catch(() => {})
    poll()
    const t = setInterval(poll, 60_000)
    return () => clearInterval(t)
  }, [connected])

  const markRead = useCallback(async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    try { setCounts(await api.markNotificationRead(id)) } catch { /* el siguiente conteo lo corrige */ }
  }, [])

  const markAll = useCallback(async () => {
    const g = groupRef.current
    setItems((prev) => prev.map((n) => (matches(g, n) ? { ...n, read: true } : n)))
    try { setCounts(await api.markAllNotificationsRead(g === 'all' ? undefined : g)) } catch { /* idem */ }
  }, [])

  return {
    counts, group, items, loading, error, connected, hasMore: !!cursor,
    changeGroup: (g) => { setGroup(g); load(g, null) },
    open: () => load(groupRef.current, null),
    loadMore: () => load(groupRef.current, cursor),
    markRead, markAll,
  }
}
