/* RelatorioPro PWA — instalação e cache do app shell. Dados privados nunca são armazenados pelo Service Worker. */
(() => {
  const installButtons = [...document.querySelectorAll("[data-pwa-install]")];
  let installPrompt = null;
  const showInstall = visible => installButtons.forEach(button => { button.hidden = !visible; });
  showInstall(false);

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    showInstall(true);
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    showInstall(false);
  }));

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    showInstall(false);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .catch(error => console.error("[RelatorioPro PWA] Falha ao registrar Service Worker:", error));
    }, { once: true });
  }
})();
