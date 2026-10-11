// YAM's service worker (offline mode, migration 038): lets the app open with
// no signal. It only ever serves the app itself, never data: what was last
// read is kept by the app in IndexedDB, and writes wait in the app's outbox.
//
// - Pages: network first, so a new deploy is picked up as soon as there is
//   signal; the last index.html when there is none.
// - /assets/*: named by content hash and never change, so cache first.
// - Anything else (Supabase, other origins, non-GET): not touched.

const CACHE = 'yam-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Every route is the same single-page app: keep the latest shell.
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy))
          }
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
