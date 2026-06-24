// Mi Finca — Service Worker
// Permite que la app funcione sin internet (caché de archivos estáticos)

const CACHE_NAME = 'mifinca-v1';
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Firebase SDK (se cachea para uso offline)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
];

// Instalación: cachear todos los archivos estáticos
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Cacheando archivos de Mi Finca...');
      // Cachear archivos locales de forma obligatoria
      return cache.addAll(['./', './index.html', './app.js', './styles.css', './manifest.json'])
        .then(function() {
          // Intentar cachear CDNs (no falla si no hay internet)
          return Promise.allSettled(
            ARCHIVOS_CACHE.slice(5).map(function(url) {
              return cache.add(url).catch(function() {
                console.log('[SW] No se pudo cachear:', url);
              });
            })
          );
        });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activación: limpiar cachés viejos
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: responder desde caché si no hay internet
self.addEventListener('fetch', function(event) {
  // No interceptar peticiones de Firebase (autenticación y base de datos)
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('securetoken.googleapis.com') ||
      url.includes('firebase.googleapis.com')) {
    return; // Dejar pasar directo a la red
  }

  event.respondWith(
    caches.match(event.request).then(function(respuestaCache) {
      if (respuestaCache) {
        // Tenemos en caché: devolver de caché Y actualizar en segundo plano
        fetch(event.request).then(function(respuestaRed) {
          if (respuestaRed && respuestaRed.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, respuestaRed.clone());
            });
          }
        }).catch(function() {}); // Silenciar errores de red
        return respuestaCache;
      }
      // No está en caché: intentar red
      return fetch(event.request).catch(function() {
        // Si falla la red y es una página HTML, devolver index.html
        if (event.request.headers.get('accept') && 
            event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
