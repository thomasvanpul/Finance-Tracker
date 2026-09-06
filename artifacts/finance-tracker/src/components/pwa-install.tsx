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

  // Ephemeral surface (DESIGN.md §6): it floats above the page and leaves
  // on install or dismiss, so it takes .ft-float rather than sitting in the
  // header chrome drawn like a permanent control. Bottom-centre keeps it
  // clear of the toast viewport (bottom-right) and the status bar.
  return (
    <div
      className="ft-float"
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 44,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px 8px 14px",
      }}
    >
      <span className="ft-float-title">Install Numeris</span>
      <span className="ft-float-body">Runs as an app, offline-ready.</span>
      <button
        onClick={install}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          background: "var(--ft-accent)", color: "var(--ft-base)", border: "none",
          padding: "4px 10px", cursor: "pointer", letterSpacing: "0.06em",
        }}
      >
        INSTALL
      </button>
      <button
        onClick={() => { setDismissed(true); try { localStorage.setItem("nr-pwa-dismissed", "1"); } catch {} }}
        aria-label="Dismiss install prompt"
        style={{
          fontFamily: "var(--font-mono)", fontSize: 13, background: "none", border: "none",
          color: "var(--ft-dim)", cursor: "pointer", lineHeight: 1, padding: "0 2px",
        }}
      >
        ×
      </button>
    </div>
  );
}
