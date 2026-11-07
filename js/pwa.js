/* RelatorioPro PWA — mantém a instalação acessível na tela de login. */
(() => {
  const installButtons = [...document.querySelectorAll("[data-pwa-install]")];
  let deferredInstallPrompt = null;

  const isRunningAsApp = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const syncInstallVisibility = () => {
    const visible = !isRunningAsApp();
    installButtons.forEach(button => { button.hidden = !visible; });
  };

  syncInstallVisibility();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallVisibility();
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (isRunningAsApp()) {
      syncInstallVisibility();
      return;
    }

    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (error) {
        console.warn("[RelatorioPro PWA] Falha ao abrir o prompt nativo:", error);
      }
      syncInstallVisibility();
      return;
    }

    const instructions = isIOS()
      ? "Para instalar no iPhone/iPad:\n1. Abra esta página no Safari.\n2. Toque em Compartilhar.\n3. Selecione “Adicionar à Tela de Início”."
      : "A instalação automática não está disponível neste navegador agora.\n\nNo Chrome ou Edge, abra o menu do navegador e escolha “Instalar RelatorioPro” ou “Adicionar à tela inicial”.";
    window.alert(instructions);
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