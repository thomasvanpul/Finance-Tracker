export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

// Converts accounting-negative "(42.18)" → -42.18; plain "42.18" or "-42.18" → as-is
export function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  const accounting = trimmed.match(/^\(([0-9,]+(?:\.[0-9]+)?)\)$/);
  if (accounting) {
    const n = parseFloat(accounting[1].replace(/,/g, ""));
    return Number.isNaN(n) ? null : -n;
  }
  const plain = parseFloat(trimmed.replace(/[£$€,]/g, ""));
  return Number.isNaN(plain) ? null : plain;
}
