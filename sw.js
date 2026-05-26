const CACHE = 'licoreria-v3';
const STATIC = [
  '/licoreria-app/',
  '/licoreria-app/index.html',
  '/licoreria-app/manifest.json',
  '/licoreria-app/icon.svg',
];

// Instalar — cachear solo archivos estáticos propios
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {})
  );
  self.skipWaiting();
});

// Activar — borrar cachés viejas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — estrategia: Network First
// Siempre intenta la red primero, caché solo si no hay conexión
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Supabase y APIs externas: siempre red, nunca caché
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('dolarapi.com') ||
    url.hostname.includes('openfoodfacts.org') ||
    url.hostname.includes('jsdelivr.net')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Archivos propios: Network First con fallback a caché
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guardar copia fresca en caché
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
