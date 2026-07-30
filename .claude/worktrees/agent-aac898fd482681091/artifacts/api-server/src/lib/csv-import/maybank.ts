import { parse } from "csv-parse/sync";
import type { NormalizedTransaction } from "./revolut";

// Maybank2u statement exports are not as standardized as Revolut's — depending on
// account type, the download can have a few metadata lines before the real table,
// and amounts may be a single signed column or split Debit/Credit columns.
// This parser is intentionally lenient: it scans for the header row itself, then
// adapts to whichever amount column(s) it finds.
//
// If your specific export doesn't parse cleanly, check the `errors` array — most
// issues are just a header name we haven't seen before (e.g. "Trans Date" vs "Date").
// Update HEADER_ALIASES below to add new column-name variants without touching the
// parsing logic.

const DATE_KEYS = ["date", "transaction date", "trans date", "posting date"];
const DESCRIPTION_KEYS = ["description", "transaction description", "details", "particulars"];
const AMOUNT_KEYS = ["amount", "transaction amount"];
const DEBIT_KEYS = ["debit", "withdrawal", "debit amount"];
const CREDIT_KEYS = ["credit", "deposit", "credit amount"];

function findHeaderRowIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const lower = lines[i].toLowerCase();
    const hasDate = DATE_KEYS.some((k) => lower.includes(k));
    const hasAmount =
      AMOUNT_KEYS.some((k) => lower.includes(k)) ||
      (DEBIT_KEYS.some((k) => lower.includes(k)) && CREDIT_KEYS.some((k) => lower.includes(k)));
    if (hasDate && hasAmount) return i;
  }
  return -1;
}

function matchKey(record: Record<string, string>, candidates: string[]): string | undefined {
  const keys = Object.keys(record);
  for (const candidate of candidates) {
    const found = keys.find((k) => k.trim().toLowerCase() === candidate);
    if (found) return found;
  }
  return undefined;
}

function parseDate(raw: string): string | null {
  // Handles DD/MM/YYYY, DD-MM-YYYY, and YYYY-MM-DD.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function parseMaybankCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
  const errors: string[] = [];
  const lines = fileContent.split(/\r?\n/);
  const headerIndex = findHeaderRowIndex(lines);

  if (headerIndex === -1) {
    return {
      rows: [],
      errors: [
        "Could not find a header row with recognizable Date/Amount columns. " +
          "Check that this is a transaction export (not a summary/PDF export) and consider " +
          "adding your column names to HEADER_ALIASES in maybank.ts.",
      ],
    };
  }

  const tableCsv = lines.slice(headerIndex).join("\n");
  let records: Record<string, string>[];
  try {
    records = parse(tableCsv, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse CSV table: ${err?.message ?? "unknown error"}`] };
  }

  const rows: NormalizedTransaction[] = [];

  for (const [i, record] of records.entries()) {
    const dateKey = matchKey(record, DATE_KEYS);
    const descKey = matchKey(record, DESCRIPTION_KEYS);
    const amountKey = matchKey(record, AMOUNT_KEYS);
    const debitKey = matchKey(record, DEBIT_KEYS);
    const creditKey = matchKey(record, CREDIT_KEYS);

    if (!dateKey) {
      errors.push(`Row ${i + 2}: no date column found, skipped`);
      continue;
    }

    const date = parseDate(record[dateKey]);
    if (!date) {
      errors.push(`Row ${i + 2}: could not parse date "${record[dateKey]}", skipped`);
      continue;
    }

    let amount: number | null = null;

    if (amountKey && record[amountKey]) {
      const parsed = parseFloat(record[amountKey].replace(/,/g, ""));
      if (!Number.isNaN(parsed)) amount = parsed;
    } else if (debitKey || creditKey) {
      const debit = debitKey && record[debitKey] ? parseFloat(record[debitKey].replace(/,/g, "")) : 0;
      const credit = creditKey && record[creditKey] ? parseFloat(record[creditKey].replace(/,/g, "")) : 0;
      if (!Number.isNaN(debit) && !Number.isNaN(credit)) {
        amount = credit - debit; // credit is income (+), debit is expense (-)
      }
    }

    if (amount === null) {
      errors.push(`Row ${i + 2}: could not determine amount, skipped`);
      continue;
    }

    rows.push({
      date,
      description: descKey ? record[descKey] || "Maybank transaction" : "Maybank transaction",
      amount,
      currency: "MYR",
    });
  }

  return { rows, errors };
}
