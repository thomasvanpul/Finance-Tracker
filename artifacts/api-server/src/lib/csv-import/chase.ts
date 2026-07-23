import { parse } from "csv-parse/sync";
import type { NormalizedTransaction } from "./revolut";

// Chase UK exported CSV columns:
// Date,Description,Amount,Balance
// Chase US exported CSV columns:
// Transaction Date,Post Date,Description,Category,Type,Amount,Memo
export function parseChaseCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse CSV: ${err?.message ?? "unknown error"}`] };
  }

  if (records.length === 0) return { rows: [], errors: ["Empty file"] };

  const headers = Object.keys(records[0]);
  const isUS = headers.some(h => /transaction.?date/i.test(h));
  const rows: NormalizedTransaction[] = [];

  for (const [i, record] of records.entries()) {
    const dateRaw = isUS ? record["Transaction Date"] : record["Date"];
    const description = isUS
      ? (record["Description"] || record["Memo"] || "Chase transaction")
      : (record["Description"] || "Chase transaction");
    const amountRaw = record["Amount"];

    if (!dateRaw || !amountRaw) {
      errors.push(`Row ${i + 2}: missing required field(s), skipped`);
      continue;
    }

    const amount = parseFloat(amountRaw.replace(/[£,]/g, ""));
    if (Number.isNaN(amount)) {
      errors.push(`Row ${i + 2}: could not parse amount "${amountRaw}", skipped`);
      continue;
    }

    // Chase UK: "01/07/2026" (DD/MM/YYYY) or Chase US: "07/01/2026" (MM/DD/YYYY)
    let date: string;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateRaw)) {
      const [p1, p2, yyyy] = dateRaw.split("/");
      // US format: MM/DD/YYYY; UK format: DD/MM/YYYY
      date = isUS
        ? `${yyyy}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`
        : `${yyyy}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
    } else {
      date = dateRaw.slice(0, 10);
    }

    const currency = isUS ? "USD" : "GBP";
    rows.push({ date, description, amount, currency });
  }

  return { rows, errors };
}
