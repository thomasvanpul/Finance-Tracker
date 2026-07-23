import { createContext, useContext, useEffect, useState } from "react";

export type FintrackTheme = "void" | "phosphor" | "arctic" | "amber" | "midnight" | "matrix" | "synthwave" | "deep-space" | "mario" | "gilded" | "bloodline";

const THEMES: { id: FintrackTheme; label: string; accent: string; base: string; text: string }[] = [
  { id: "void",       label: "Void",       accent: "#F4A21E", base: "#08090B", text: "#CDD6F4" },
  { id: "phosphor",   label: "Phosphor",   accent: "#7FFF00", base: "#020802", text: "#39FF14" },
  { id: "arctic",     label: "Arctic",     accent: "#0052CC", base: "#F0F4F8", text: "#1A2333" },
  { id: "amber",      label: "Amber",      accent: "#FFD700", base: "#0A0600", text: "#FFB000" },
  { id: "midnight",   label: "Midnight",   accent: "#4D9FFF", base: "#010817", text: "#E8F0FF" },
  { id: "matrix",     label: "Matrix",     accent: "#00FF41", base: "#000300", text: "#00CC33" },
  { id: "synthwave",  label: "Synthwave",  accent: "#FF007A", base: "#0D001A", text: "#E8D5FF" },
  { id: "deep-space", label: "Deep Space", accent: "#7B5EA7", base: "#010108", text: "#C8D0E8" },
  { id: "mario",      label: "Mario",      accent: "#F8C800", base: "#5C94FC", text: "#FCFCFC" },
  { id: "gilded",     label: "Gilded",     accent: "#C8941E", base: "#080600", text: "#F0E6C8" },
  { id: "bloodline",  label: "Bloodline",  accent: "#CC1A2F", base: "#0F0003", text: "#F5C2C7" },
];

interface ThemeContextValue {
  theme: FintrackTheme;
  themes: typeof THEMES;
  setTheme: (t: FintrackTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "void",
  themes: THEMES,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<FintrackTheme>(() => {
    try {
      return (localStorage.getItem("ft-theme") as FintrackTheme) ?? "void";
    } catch {
      return "void";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "void") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem("ft-theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = (t: FintrackTheme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useFintrackTheme() {
  return useContext(ThemeContext);
}
