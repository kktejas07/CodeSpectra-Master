/* CodeSpectra FCM service worker — handles background push notifications.
 * Config is fetched lazily from /api/firebase-config (served from MongoDB
 * secrets) so no credentials are baked into this file. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

let initPromise = null
let messaging = null

function initMessaging() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const res = await fetch('/api/firebase-config')
        const cfg = await res.json()
        if (!cfg || !cfg.apiKey || !cfg.messagingSenderId) {
          throw new Error('firebase config unavailable')
        }
        firebase.initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain || '',
          projectId: cfg.projectId || '',
          storageBucket: cfg.storageBucket || '',
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId || '',
        })
        messaging = firebase.messaging()
        messaging.onBackgroundMessage((payload) => {
          const title = (payload.notification && payload.notification.title) || 'CodeSpectra'
          const body = (payload.notification && payload.notification.body) || ''
          const options = {
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            data: payload.data || {},
          }
          return self.registration.showNotification(title, options)
        })
      } catch (e) {
        console.error('[SW] messaging init failed', e)
      }
    })()
  }
  return initPromise
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_MESSAGING') {
    event.waitUntil(initMessaging())
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const link = data.link || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.navigate(link).then(() => client.focus())
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link)
      }
      return undefined
    })
  )
})
