/* CodeSpectra FCM service worker — handles background push notifications.
 * Config is fetched lazily from /api/firebase-config (served from MongoDB
 * secrets) so no credentials are baked into this file. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

// Optional deploy-time injected config ({ apiKey, authDomain, projectId,
// storageBucket, messagingSenderId, appId }). When present, FCM is wired up
// SYNCHRONOUSLY during initial script evaluation so Chrome does not warn about
// 'push'/'pushsubscriptionchange' handlers being registered late. When absent
// we fall back to lazy fetching from /api/firebase-config.
const embeddedConfig =
  (typeof self.__CS_FCM_CONFIG__ !== 'undefined' && self.__CS_FCM_CONFIG__)
    ? self.__CS_FCM_CONFIG__
    : null

let initPromise = null
let messaging = null

function registerBackgroundHandler() {
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
}

function initMessaging() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const cfg = embeddedConfig || await fetch('/api/firebase-config').then(r => r.json())
        if (!cfg || !cfg.apiKey || !cfg.messagingSenderId) {
          throw new Error('firebase config unavailable')
        }
        // The async fallback path may run after embedded config already
        // initialised the app; never double-initialise.
        if (!firebase.apps || firebase.apps.length === 0) {
          firebase.initializeApp({
            apiKey: cfg.apiKey,
            authDomain: cfg.authDomain || '',
            projectId: cfg.projectId || '',
            storageBucket: cfg.storageBucket || '',
            messagingSenderId: cfg.messagingSenderId,
            appId: cfg.appId || '',
          })
        }
        if (!messaging) {
          messaging = firebase.messaging()
          registerBackgroundHandler()
        }
      } catch (e) {
        console.error('[SW] messaging init failed', e)
      }
    })()
  }
  return initPromise
}

// Synchronous top-level wiring — this is what silences Chrome's late-handler
// warnings and guarantees background pushes work once the SW is active.
if (embeddedConfig) {
  initMessaging()
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
