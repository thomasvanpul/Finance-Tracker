import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// Colour only. The emoji field is gone: nothing in the app ever
// rendered a category emoji — DEFAULT_EMOJIS was emptied by the
// no-emoji lock and the only reader was the settings row that set it —
// so the control was writing a value the product never displayed while
// its copy promised the change applied everywhere. Emoji strings in
// existing localStorage records are orphaned; they are read as excess
// properties and dropped on the next write, which is safe precisely
// because nothing displayed them.
export interface CategoryMeta {
  color: string; // CSS color string e.g. "#00ff88" or "var(--ft-green)"
}

const STORAGE_KEY = "ft-category-meta";

function load(): Record<string, CategoryMeta> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CategoryMeta>) : {};
  } catch { return {}; }
}

function persist(meta: Record<string, CategoryMeta>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch {}
}

interface CategoryCtx {
  meta: Record<string, CategoryMeta>;
  setCategoryMeta: (category: string, m: CategoryMeta) => void;
  removeCategoryMeta: (category: string) => void;
  getColor: (category: string) => string;
}

const CategoryContext = createContext<CategoryCtx | null>(null);

const DEFAULT_COLORS: Record<string, string> = {
  food: "#f59e0b",
  groceries: "#10b981",
  dining: "#f59e0b",
  transport: "#3b82f6",
  shopping: "#8b5cf6",
  entertainment: "#ec4899",
  health: "#ef4444",
  utilities: "#6b7280",
  travel: "#06b6d4",
  income: "#00ff88",
  salary: "#00ff88",
  transfer: "#94a3b8",
};

// A future icon set replaces category glyphs with themeable SVG, same
// shape as components/currency-mark.tsx. Until then a category has a
// colour and nothing else — see the note on CategoryMeta.

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Record<string, CategoryMeta>>(() => load());

  const setCategoryMeta = useCallback((category: string, m: CategoryMeta) => {
    setMeta(prev => {
      const next = { ...prev, [category.toLowerCase()]: m };
      persist(next);
      return next;
    });
  }, []);

  const removeCategoryMeta = useCallback((category: string) => {
    setMeta(prev => {
      const next = { ...prev };
      delete next[category.toLowerCase()];
      persist(next);
      return next;
    });
  }, []);

  const getColor = useCallback((category: string): string => {
    const key = category.toLowerCase();
    return meta[key]?.color ?? DEFAULT_COLORS[key] ?? "var(--ft-muted)";
  }, [meta]);

  return (
    <CategoryContext.Provider value={{ meta, setCategoryMeta, removeCategoryMeta, getColor }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategoryMeta() {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error("useCategoryMeta must be used within CategoryProvider");
  return ctx;
}
