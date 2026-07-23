import { parse } from "csv-parse/sync";
import type { NormalizedTransaction } from "./revolut";

// Wise (TransferWise) exported CSV columns:
// TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance,
// Exchange From,Exchange To,Exchange Rate,Payer Name,Payee Name,Payee Account Number,
// Merchant,Card Last Four Digits,Card Holder Full Name,Attachment,Note,Total fees,Exchange rate
export function parseWiseCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
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
    const description = record["Description"] || record["Merchant"] || record["Payee Name"] || "Wise transfer";

    if (!dateRaw || !amountRaw || !currency) {
      errors.push(`Row ${i + 2}: missing required field(s), skipped`);
      continue;
    }

    const amount = parseFloat(amountRaw);
    if (Number.isNaN(amount)) {
      errors.push(`Row ${i + 2}: could not parse amount "${amountRaw}", skipped`);
      continue;
    }

    // Wise dates: "2026-07-01T10:00:00.000Z" or "2026-07-01"
    const date = dateRaw.slice(0, 10);

    rows.push({ date, description, amount, currency: currency.toUpperCase() });
  }

  return { rows, errors };
}
