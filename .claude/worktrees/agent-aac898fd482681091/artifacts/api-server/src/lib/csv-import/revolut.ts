import { parse } from "csv-parse/sync";

export interface NormalizedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed: negative = expense, positive = income
  currency: string;
}

// Revolut's exported CSV (Profile -> Statement -> Export as CSV) has these columns:
// Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// We only import COMPLETED transactions to avoid pending/reversed noise.
export function parseRevolutCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse CSV: ${err?.message ?? "unknown error"}`] };
  }

  const rows: NormalizedTransaction[] = [];

  for (const [i, record] of records.entries()) {
    const state = record["State"];
    if (state && state.toUpperCase() !== "COMPLETED") continue; // skip pending/reverted

    const dateRaw = record["Completed Date"] || record["Started Date"];
    const amountRaw = record["Amount"];
    const description = record["Description"];
    const currency = record["Currency"];

    if (!dateRaw || !amountRaw || !currency) {
      errors.push(`Row ${i + 2}: missing required field(s), skipped`);
      continue;
    }

    const amount = parseFloat(amountRaw);
    if (Number.isNaN(amount)) {
      errors.push(`Row ${i + 2}: could not parse amount "${amountRaw}", skipped`);
      continue;
    }

    // Revolut dates look like "2026-06-30 14:22:10"
    const date = dateRaw.slice(0, 10);

    rows.push({
      date,
      description: description || "Revolut transaction",
      amount,
      currency: currency.toUpperCase(),
    });
  }

  return { rows, errors };
}
