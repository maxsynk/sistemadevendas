// ============================================
// MAX REPRESENTAÇÃO — SERVICE WORKER do MINI SITE
// Permite o mini site ser instalável como app
// ============================================

const CACHE_NOME = "max-catalogo-v13.0";
const ARQUIVOS_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
];

// INSTALL
self.addEventListener("install", (event) => {
  console.log("[SW Catálogo] Instalando...");
  event.waitUntil(
    caches.open(CACHE_NOME)
      .then((cache) => cache.addAll(ARQUIVOS_CACHE))
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW Catálogo] Erro no cache:", err))
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  console.log("[SW Catálogo] Ativando...");
  event.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.map((nome) => {
          if (nome !== CACHE_NOME && nome.startsWith("max-catalogo")) {
            return caches.delete(nome);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH — cache-first
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Chama a API direto (sem cache)
  if (url.hostname !== self.location.hostname) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === "GET" && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NOME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
