const CACHE_NAME = "relatoriopro-shell-v9";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/css/base.css",
  "/css/onboarding.css",
  "/css/trainings.css",
  "/css/agenda.css",
  "/css/assistant.css",
  "/css/gestao-operacional.css",
  "/css/checklist-trem-forca.css",
  "/js/app.js",
  "/js/pwa.js",
  "/js/core/supabase-adapter.js",
  "/js/core/permissions.js",
  "/js/shared/html.js",
  "/js/modules/operational-crud.js",
  "/js/modules/operational-shift-reports.js",
  "/js/modules/maintenance-125h.js",
  "/Logo%20Irmen.webp",
  "/pwa-icon.svg",
  "/Logo%20Sany.png"
];
const EXTERNAL_MODULES = [
  "https://esm.sh/@supabase/supabase-js@2",
  "https://esm.sh/tus-js-client@4.3.1/lib.esm/browser/index.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.allSettled(EXTERNAL_MODULES.map(async url => {
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("relatoriopro-shell-") && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Somente dependências públicas de frontend do CDN são cacheadas.
  // Supabase Auth, banco, Storage e qualquer resposta privada ficam fora do cache.
  if (url.origin !== self.location.origin) {
    if (url.hostname === "esm.sh") {
      event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          return new Response("Dependência externa não disponível offline.", { status: 503, statusText: "Offline" });
        }
      })());
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("/index.html")) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  const isAppAsset = APP_SHELL.includes(url.pathname) || /\.(?:css|js|svg|webp|png|woff2?)$/i.test(url.pathname);
  if (!isAppAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request).then(response => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    return cached || await network || new Response("", { status: 503, statusText: "Offline" });
  })());
});
