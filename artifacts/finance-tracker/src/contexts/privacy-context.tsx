import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

export type MaskMode = "none" | "partial" | "full";

interface PrivacyContextValue {
  privacy: boolean;
  togglePrivacy: () => void;
  blurAmounts: boolean;
  maskMode: MaskMode;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  privacy: false,
  togglePrivacy: () => {},
  blurAmounts: false,
  maskMode: "none",
});

function readBlurAmounts(): boolean {
  try { return localStorage.getItem("nr-blur-amounts") === "true"; } catch { return false; }
}
function readMaskMode(): MaskMode {
  try {
    const v = localStorage.getItem("nr-mask-mode");
    if (v === "partial" || v === "full") return v;
    return "none";
  } catch { return "none"; }
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(() => {
    try { return localStorage.getItem("ft-privacy") === "1"; } catch { return false; }
  });
  const [blurAmounts, setBlurAmounts] = useState<boolean>(readBlurAmounts);
  const [maskMode, setMaskMode] = useState<MaskMode>(readMaskMode);

  const reload = useCallback(() => {
    setBlurAmounts(readBlurAmounts());
    setMaskMode(readMaskMode());
  }, []);

  useEffect(() => {
    window.addEventListener("nr-privacy-update", reload);
    return () => window.removeEventListener("nr-privacy-update", reload);
  }, [reload]);

  useEffect(() => {
    document.body.classList.toggle("privacy-mode", privacy);
  }, [privacy]);

  const togglePrivacy = () => {
    setPrivacy(p => {
      const next = !p;
      try { localStorage.setItem("ft-privacy", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <PrivacyContext.Provider value={{ privacy, togglePrivacy, blurAmounts, maskMode }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}

const BLUR_STYLE = {
  filter: "blur(5px)",
  userSelect: "none" as const,
  pointerEvents: "none" as const,
};

const BLUR_PARTIAL_STYLE = {
  filter: "blur(4px)",
  cursor: "pointer" as const,
  userSelect: "none" as const,
  transition: "filter 0.15s",
};

export function PrivNum({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { privacy, blurAmounts } = usePrivacy();
  const [revealed, setRevealed] = useState(false);
  const reblurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoBlurDelay = (() => {
    try { return parseInt(localStorage.getItem("nr-auto-blur-delay") ?? "0", 10) * 1000; } catch { return 0; }
  })();

  const shouldBlur = privacy || (blurAmounts && !revealed);

  function handleMouseEnter() {
    if (!blurAmounts) return;
    if (reblurTimer.current) clearTimeout(reblurTimer.current);
    setRevealed(true);
  }

  function handleMouseLeave() {
    if (!blurAmounts) return;
    if (autoBlurDelay > 0) {
      reblurTimer.current = setTimeout(() => setRevealed(false), autoBlurDelay);
    } else {
      setRevealed(false);
    }
  }

  const blurStyle = privacy ? BLUR_STYLE : blurAmounts && !revealed ? BLUR_PARTIAL_STYLE : {};

  return (
    <span
      className={`pnum${className ? ` ${className}` : ""}`}
      style={{ ...style, ...blurStyle }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={blurAmounts && !revealed ? "Hover to reveal" : undefined}
    >
      {children}
    </span>
  );
}

export function PrivDesc({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { maskMode } = usePrivacy();
  const [revealed, setRevealed] = useState(false);

  if (maskMode === "none") {
    return <span className={className} style={style}>{children}</span>;
  }

  const shouldBlur = maskMode === "full" && !revealed;
  const shouldPartial = maskMode === "partial";

  if (shouldPartial) {
    const text = typeof children === "string" ? children : "";
    const masked = text.length > 4 ? "•".repeat(text.length - 4) + text.slice(-4) : text;
    return <span className={className} style={style}>{masked}</span>;
  }

  return (
    <span
      className={className}
      style={{
        ...style,
        ...(shouldBlur ? { filter: "blur(4px)", cursor: "pointer", userSelect: "none", transition: "filter 0.15s" } : {}),
      }}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      title={shouldBlur ? "Hover to reveal" : undefined}
    >
      {children}
    </span>
  );
}
