/* RelatorioPro PWA — instalação e cache do app shell. Dados privados nunca são armazenados pelo Service Worker. */
(() => {
  const installButtons = [...document.querySelectorAll("[data-pwa-install]")];
  let installPrompt = null;

  const isRunningAsApp = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const showInstall = visible =>
    installButtons.forEach(button => { button.hidden = !visible; });

  const showManualInstructions = () => {
    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isAndroid = /android/i.test(window.navigator.userAgent);

    let instructions;
    if (isIOS) {
      instructions = 'Para instalar no iPhone ou iPad:\n1. Abra este site no Safari.\n2. Toque em Compartilhar.\n3. Selecione “Adicionar à Tela de Início”.\n4. Confirme em “Adicionar”.';
    } else if (isAndroid) {
      instructions = 'Para instalar no Android:\n1. Abra este site no Chrome.\n2. Toque no menu (⋮).\n3. Selecione “Instalar aplicativo” ou “Adicionar à tela inicial”.\n4. Confirme a instalação.';
    } else {
      instructions = 'Para instalar no computador:\n1. Abra este site no Google Chrome ou Microsoft Edge.\n2. Procure o ícone de instalação na barra de endereço ou abra o menu do navegador.\n3. Selecione “Instalar RelatorioPro”.';
    }

    window.alert(instructions);
  };

  // O botão permanece acessível mesmo quando o navegador não oferece
  // beforeinstallprompt; nesse caso, orienta o usuário pela instalação manual.
  showInstall(!isRunningAsApp());

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    showInstall(true);
  });

  installButtons.forEach(button => button.addEventListener("click", async () => {
    if (!installPrompt) {
      showManualInstructions();
      return;
    }

    const promptEvent = installPrompt;
    installPrompt = null;

    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (error) {
      console.warn("[RelatorioPro PWA] Não foi possível abrir a instalação automática:", error);
      showManualInstructions();
    }

    showInstall(!isRunningAsApp());
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
