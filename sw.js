const CACHE_NAME = "relatoriopro-shell-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
  "/css/styles.css",
  "/css/base.css",
  "/css/onboarding.css",
  "/css/trainings.css",
  "/css/agenda.css",
  "/css/assistant.css",
  "/css/gestao-operacional.css",
  "/css/checklist-trem-forca.css",
  "/js/app.js",
  "/js/gestao-operacional.js",
  "/js/checklist-trem-forca.js",
  "/js/core/supabase-adapter.js",
  "/js/core/permissions.js",
  "/js/shared/html.js",
  "/Logo%20Irmen.webp",
  "/Logo%20Sany.png"
];

// Dependências externas do frontend. O cache é uma preparação para reabertura
// offline; chamadas de autenticação, banco e Storage do Supabase nunca são cacheadas.
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

  // Só módulos estáticos do CDN entram no cache. Não armazenar respostas
  // autenticadas, consultas, relatórios ou arquivos privados do Supabase.
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
        } catch (error) {
          return new Response("Dependência externa ainda não armazenada neste aparelho.", { status: 503, statusText: "Offline" });
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
      } catch (error) {
        return (await caches.match("/index.html")) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
