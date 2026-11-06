/* RelatorioPro PWA — exibe a instalação somente quando o navegador disponibiliza o prompt nativo. */
(() => {
  const installButtons = [...document.querySelectorAll("[data-pwa-install]")];
  let deferredInstallPrompt = null;

  const isRunningAsApp = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  // O botão só fica visível quando existe um prompt nativo válido para abrir.
  // Assim, tocar em "Instalar" sempre aciona a confirmação do navegador.
  const syncInstallVisibility = () => {
    const canInstall = Boolean(deferredInstallPrompt) && !isRunningAsApp();
    installButtons.forEach(button => { button.hidden = !canInstall; });
  };

  syncInstallVisibility();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallVisibility();
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (isRunningAsApp() || !deferredInstallPrompt) {
      syncInstallVisibility();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    syncInstallVisibility();

    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (error) {
      console.warn("[RelatorioPro PWA] Falha ao abrir o prompt nativo:", error);
    }
  }));

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    syncInstallVisibility();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(registration => registration.update().catch(() => {}))
        .catch(error => console.error("[RelatorioPro PWA] Falha ao registrar Service Worker:", error));
    }, { once: true });
  }
})();