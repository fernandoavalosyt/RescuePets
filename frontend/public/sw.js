/* Service worker de RescuePets: recibe notificaciones push aunque el sitio esté cerrado. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* sin datos */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Si el usuario está viendo el sitio, ya se entera por el aviso interno (y su sonido): no se duplica.
    if (windows.some((c) => c.visibilityState === 'visible')) return

    if (navigator.setAppBadge && d.unread) navigator.setAppBadge(d.unread).catch(() => {})
    await self.registration.showNotification(d.title || 'RescuePets', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      image: d.image || undefined,
      tag: d.tag || 'rescuepets',
      renotify: true,
      lang: 'es',
      vibrate: [120, 60, 120, 60, 240], // patrón propio de RescuePets (Android)
      data: { url: d.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((c) => new URL(c.url).origin === target.origin)
    if (open) {
      await open.focus()
      open.postMessage({ type: 'navigate', hash: target.hash || '#/' })
    } else {
      await self.clients.openWindow(target.href)
    }
  })())
})
