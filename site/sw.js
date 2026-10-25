// MAX REPRESENTAÇÃO — SERVICE WORKER
// Mude a versão sempre que publicar uma atualização.
const CACHE_NOME = "max-representacao-v7.3";
const ARQUIVOS_CACHE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NOME)
      .then((cache) => cache.addAll(ARQUIVOS_CACHE))
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Erro no cache:", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só GET e só do mesmo domínio (API e CDNs passam direto)
  if (req.method !== "GET" || url.hostname !== self.location.hostname) return;

  const ehPagina =
    req.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css");

  if (ehPagina) {
    // REDE PRIMEIRO: sempre pega a versão nova; cache só se estiver offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(CACHE_NOME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Imagens/ícones: cache primeiro
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copia = res.clone();
          caches.open(CACHE_NOME).then((c) => c.put(req, copia));
        }
        return res;
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "SKIP_WAITING") self.skipWaiting();
});
