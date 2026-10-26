// ============================================
// MAX REPRESENTAÇÃO — SERVICE WORKER v4.9
// PWA: cache da interface pra funcionar offline
// ============================================

const CACHE_NOME = "max-representacao-v4.9";
const ARQUIVOS_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALL — pré-carrega os arquivos no cache
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando...");
  event.waitUntil(
    caches.open(CACHE_NOME)
      .then((cache) => {
        console.log("[SW] Fazendo cache dos arquivos");
        return cache.addAll(ARQUIVOS_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Erro no cache:", err))
  );
});

// ACTIVATE — limpa caches antigos
self.addEventListener("activate", (event) => {
  console.log("[SW] Ativando...");
  event.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.map((nome) => {
          if (nome !== CACHE_NOME) {
            console.log("[SW] Removendo cache antigo:", nome);
            return caches.delete(nome);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH — responde com cache primeiro, depois rede
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // NÃO cacheia chamadas da API
  if (url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/produtos") ||
      url.pathname.startsWith("/variacoes") ||
      url.pathname.startsWith("/pedidos") ||
      url.pathname.startsWith("/clientes") ||
      url.pathname.startsWith("/dashboard") ||
      url.pathname.startsWith("/relatorios") ||
      url.pathname.startsWith("/backup") ||
      url.pathname.startsWith("/ping") ||
      url.pathname.startsWith("/me") ||
      url.pathname.startsWith("/foto/") ||
      url.pathname.startsWith("/etiqueta/") ||
      url.hostname !== self.location.hostname) {
    return;
  }

  // Estratégia cache-first para o resto
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NOME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (event.request.method === "GET" && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NOME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});

// MENSAGEM — permite forçar atualização pelo app
self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
