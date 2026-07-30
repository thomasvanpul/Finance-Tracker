import { useState, useCallback } from "react";

const LS_PREFIX = "ft-w-";

export interface WidgetDef {
  id: string;
  label: string;
}

export function useWidgetVisibility(pageId: string, widgetDefs: WidgetDef[]) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const defaults = Object.fromEntries(widgetDefs.map(w => [w.id, true]));
    try {
      const stored = localStorage.getItem(LS_PREFIX + pageId);
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch {}
    return defaults;
  });

  const isVisible = (id: string): boolean => visible[id] !== false;

  const toggle = useCallback((id: string) => {
    setVisible(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_PREFIX + pageId, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pageId]);

  const resetAll = useCallback(() => {
    const defaults = Object.fromEntries(widgetDefs.map(w => [w.id, true]));
    setVisible(defaults);
    try { localStorage.removeItem(LS_PREFIX + pageId); } catch {}
  }, [pageId, widgetDefs]);

  const hiddenCount = Object.values(visible).filter(v => !v).length;

  return { isVisible, toggle, resetAll, visible, hiddenCount };
}
