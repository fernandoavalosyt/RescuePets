import { useCallback, useEffect, useState } from 'react'
import * as api from './api'

// Web Push necesita service worker + PushManager + Notification (y HTTPS o localhost).
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// La clave pública VAPID viaja en base64url; el navegador la pide como bytes.
function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const getRegistration = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)

async function subscribeThisDevice(publicKey) {
  const reg = await getRegistration()
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
  await api.pushSubscribe(sub.toJSON()) // también reasigna el dispositivo a la cuenta actual
  return sub
}

/** Al cerrar sesión: este dispositivo deja de recibir avisos de la cuenta (otra persona podría usarlo). */
export async function forgetDevice() {
  try {
    if (!supported()) return
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await api.pushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
    navigator.clearAppBadge?.()
  } catch { /* no debe impedir cerrar sesión */ }
}

/**
 * Estado de los avisos en el dispositivo:
 * loading | unsupported | ios-install | server-off | denied | off | on
 */
export function usePush() {
  const [status, setStatus] = useState('loading')
  const [publicKey, setPublicKey] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!supported()) return setStatus(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported')
      let cfg
      try { cfg = await api.pushConfig() } catch { return setStatus('unsupported') }
      if (cancelled) return
      if (!cfg.enabled) return setStatus('server-off')
      setPublicKey(cfg.publicKey)
      if (Notification.permission === 'denied') return setStatus('denied')
      if (Notification.permission === 'granted') {
        // Permiso ya concedido: asegura la suscripción de este dispositivo para la cuenta actual
        try { await subscribeThisDevice(cfg.publicKey); if (!cancelled) setStatus('on') } catch { if (!cancelled) setStatus('off') }
        return
      }
      setStatus('off')
    })()
    return () => { cancelled = true }
  }, [])

  // Al tocar una notificación con el sitio abierto, el service worker pide ir a esa publicación
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMsg = (e) => { if (e.data?.type === 'navigate') window.location.hash = e.data.hash }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  /** Debe llamarse desde un clic: es cuando el navegador permite pedir el permiso. */
  const enable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'off'); return false }
      await subscribeThisDevice(publicKey)
      setStatus('on')
      return true
    } catch (e) {
      setError(e.message || 'No se pudieron activar los avisos.')
      return false
    } finally {
      setBusy(false)
    }
  }, [publicKey])

  const disable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe() }
      setStatus('off')
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, busy, error, enable, disable }
}
