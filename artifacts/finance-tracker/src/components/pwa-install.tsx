import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setPrompt(null);
    }
  };

  return { canInstall: !!prompt && !installed, install, installed };
}

export function PWAInstallButton() {
  const { canInstall, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("nr-pwa-dismissed") === "1"; } catch { return false; }
  });

  if (!canInstall || dismissed) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 10px",
      background: "rgba(244,162,30,0.1)",
      border: "1px solid rgba(244,162,30,0.3)",
      marginLeft: 8,
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-accent)", letterSpacing: "0.06em" }}>
        INSTALL APP
      </span>
      <button
        onClick={install}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          background: "var(--ft-accent)", color: "#000", border: "none",
          padding: "2px 8px", cursor: "pointer", letterSpacing: "0.06em",
        }}
      >
        ↓ INSTALL
      </button>
      <button
        onClick={() => { setDismissed(true); try { localStorage.setItem("nr-pwa-dismissed", "1"); } catch {} }}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 11, background: "none", border: "none",
          color: "var(--ft-dim)", cursor: "pointer", lineHeight: 1, padding: "0 2px",
        }}
      >
        ×
      </button>
    </div>
  );
}
