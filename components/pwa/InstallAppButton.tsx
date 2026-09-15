"use client";

import { useEffect, useRef, useState } from "react";
import { Download, MonitorDown, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function InstallAppButton() {
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const detectTimer = window.setTimeout(() => setInstalled(window.matchMedia("(display-mode: standalone)").matches), 0);
    const receivePrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPromptEvent;
      setAvailable(true);
    };
    const finishInstall = () => {
      promptRef.current = null;
      setAvailable(false);
      setInstalled(true);
      setHelpOpen(false);
    };
    window.addEventListener("beforeinstallprompt", receivePrompt);
    window.addEventListener("appinstalled", finishInstall);
    return () => {
      window.clearTimeout(detectTimer);
      window.removeEventListener("beforeinstallprompt", receivePrompt);
      window.removeEventListener("appinstalled", finishInstall);
    };
  }, []);

  async function install() {
    const prompt = promptRef.current;
    if (!prompt) { setHelpOpen(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    promptRef.current = null;
    setAvailable(false);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (installed) return null;

  return (
    <>
      <button className={`topbar-text-action install-app-button${available ? " available" : ""}`} onClick={() => void install()} title="Instalar no computador"><Download size={15} /> Instalar</button>
      {helpOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Instalar aplicação">
          <section className="install-help-modal">
            <header><div><span>APLICAÇÃO PARA O COMPUTADOR</span><h2><MonitorDown size={20} /> Instalar TactiDraw</h2></div><button onClick={() => setHelpOpen(false)} title="Fechar"><X size={19} /></button></header>
            <div>
              <p>Depois de a aplicação estar publicada na Vercel, abre o endereço no Chrome ou Edge.</p>
              <ol>
                <li>Procura o ícone de instalação no lado direito da barra de endereço.</li>
                <li>Em alternativa, abre o menu do browser e escolhe <strong>Instalar TactiDraw</strong> ou <strong>Aplicações → Instalar este site como aplicação</strong>.</li>
                <li>Confirma <strong>Instalar</strong> e ativa a opção para criar o atalho no ambiente de trabalho.</li>
              </ol>
              <small>Em localhost também pode ser instalada, mas só funcionará enquanto o servidor local estiver ligado. Para uso normal, instala a versão da Vercel.</small>
            </div>
            <footer><button onClick={() => setHelpOpen(false)}>Entendi</button></footer>
          </section>
        </div>
      )}
    </>
  );
}
