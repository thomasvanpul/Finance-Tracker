export interface CatRule {
  id: string;
  contains: string;
  category: string;
}

const STORAGE_KEY = "ft-cat-rules";

export function loadCatRules(): CatRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CatRule[];
  } catch {
    return [];
  }
}

export function saveCatRules(rules: CatRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function applyAutoCategory(description: string): string | null {
  const rules = loadCatRules();
  const q = description.toLowerCase();
  for (const rule of rules) {
    if (q.includes(rule.contains.toLowerCase())) return rule.category;
  }
  return null;
}
