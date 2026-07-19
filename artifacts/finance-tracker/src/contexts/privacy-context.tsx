import { createContext, useContext, useState, useEffect } from "react";

interface PrivacyContextValue {
  privacy: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  privacy: false,
  togglePrivacy: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(() => {
    try { return localStorage.getItem("ft-privacy") === "1"; } catch { return false; }
  });

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
    <PrivacyContext.Provider value={{ privacy, togglePrivacy }}>
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

export function PrivNum({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { privacy } = usePrivacy();
  return (
    <span
      className={`pnum${className ? ` ${className}` : ""}`}
      style={{ ...style, ...(privacy ? BLUR_STYLE : {}) }}
    >
      {children}
    </span>
  );
}
