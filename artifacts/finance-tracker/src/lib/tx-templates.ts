export interface TxTemplate {
  id: string;
  name: string;
  type: string;
  category: string;
  description: string;
  currency: string;
  notes?: string;
}

const STORAGE_KEY = "ft-tx-templates";

export function loadTemplates(): TxTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TxTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplate(t: TxTemplate): void {
  const existing = loadTemplates();
  const idx = existing.findIndex((e) => e.id === t.id);
  const updated = idx >= 0
    ? existing.map((e) => (e.id === t.id ? t : e))
    : [...existing, t];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function deleteTemplate(id: string): void {
  const updated = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
