import { parse } from "csv-parse/sync";
import type { NormalizedTransaction } from "./revolut";

// Monzo exported CSV columns:
// Date,Time,Transaction type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
export function parseMonzoCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse CSV: ${err?.message ?? "unknown error"}`] };
  }

  const rows: NormalizedTransaction[] = [];

  for (const [i, record] of records.entries()) {
    const dateRaw = record["Date"];
    const amountRaw = record["Amount"];
    const currency = record["Currency"];
    const description = record["Name"] || record["Description"] || "Monzo transaction";

    if (!dateRaw || !amountRaw || !currency) {
      errors.push(`Row ${i + 2}: missing required field(s), skipped`);
      continue;
    }

    const amount = parseFloat(amountRaw);
    if (Number.isNaN(amount)) {
      errors.push(`Row ${i + 2}: could not parse amount "${amountRaw}", skipped`);
      continue;
    }

    // Monzo dates: "01/07/2026" (DD/MM/YYYY)
    const parts = dateRaw.split("/");
    if (parts.length !== 3) { errors.push(`Row ${i + 2}: unrecognised date "${dateRaw}", skipped`); continue; }
    const [dd, mm, yyyy] = parts;
    const date = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;

    rows.push({ date, description, amount, currency: currency.toUpperCase() });
  }

  return { rows, errors };
}
