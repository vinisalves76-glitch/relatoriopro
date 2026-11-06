/* RelatorioPro PWA — instalação assistida e cache do app shell.
   O navegador exige uma ação explícita do usuário para abrir o prompt nativo. */
(() => {
  const installButtons = [...document.querySelectorAll("[data-pwa-install]")];
  let deferredInstallPrompt = null;

  const isRunningAsApp = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  const showInstall = visible => {
    installButtons.forEach(button => { button.hidden = !visible; });
  };

  const manualInstructions = () => {
    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) {
      window.alert('Para instalar no iPhone/iPad: abra este site no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.');
    } else if (/android/i.test(ua)) {
      window.alert('Para instalar no Android: abra este site no Chrome, toque no menu (⋮) e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.');
    } else {
      window.alert('Para instalar no computador: abra no Chrome ou Edge e use o ícone Instalar na barra de endereço ou a opção “Instalar RelatorioPro” no menu do navegador.');
    }
  };

  const syncInstallVisibility = () => showInstall(!isRunningAsApp());

  // Exibe a opção de instalação assim que o site é carregado, sem depender do login.
  syncInstallVisibility();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallVisibility();
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (isRunningAsApp()) {
      showInstall(false);
      return;
    }

    if (!deferredInstallPrompt) {
      manualInstructions();
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") showInstall(false);
      else syncInstallVisibility();
    } catch (error) {
      console.warn("[RelatorioPro PWA] Falha ao abrir o prompt nativo:", error);
      manualInstructions();
      syncInstallVisibility();
    }
  }));

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    showInstall(false);
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(registration => registration.update().catch(() => {}))
        .catch(error => console.error("[RelatorioPro PWA] Falha ao registrar Service Worker:", error));
    }, { once: true });
  }
})();