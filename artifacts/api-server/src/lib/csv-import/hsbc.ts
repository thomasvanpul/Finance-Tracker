import { parse } from "csv-parse/sync";
import type { NormalizedTransaction } from "./revolut";

// HSBC UK exported CSV columns (two common formats):
// Format A: Date,Description,Debit(£),Credit(£),Balance(£)
// Format B: Date,Payee,Paid out,Paid in,Balance
export function parseHsbcCsv(fileContent: string): { rows: NormalizedTransaction[]; errors: string[] } {
  const errors: string[] = [];
  let records: Record<string, string>[];

  try {
    records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err: any) {
    return { rows: [], errors: [`Failed to parse CSV: ${err?.message ?? "unknown error"}`] };
  }

  if (records.length === 0) return { rows: [], errors: ["Empty file"] };

  const headers = Object.keys(records[0]);
  const hasDebitCredit = headers.some(h => /debit/i.test(h));
  const hasPaidOut = headers.some(h => /paid.?out/i.test(h));

  const rows: NormalizedTransaction[] = [];

  for (const [i, record] of records.entries()) {
    const dateRaw = record["Date"];
    const description = record["Description"] || record["Payee"] || "HSBC transaction";

    if (!dateRaw) { errors.push(`Row ${i + 2}: missing date, skipped`); continue; }

    // Parse date: "01 Jul 2026" or "01/07/2026"
    let date: string;
    if (/\d{2}\/\d{2}\/\d{4}/.test(dateRaw)) {
      const [dd, mm, yyyy] = dateRaw.split("/");
      date = `${yyyy}-${mm}-${dd}`;
    } else {
      const months: Record<string, string> = {
        Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
        Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12",
      };
      const parts = dateRaw.trim().split(/\s+/);
      if (parts.length !== 3) { errors.push(`Row ${i + 2}: unrecognised date "${dateRaw}", skipped`); continue; }
      const [dd, mon, yyyy] = parts;
      const mm = months[mon];
      if (!mm) { errors.push(`Row ${i + 2}: unrecognised month "${mon}", skipped`); continue; }
      date = `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
    }

    let amount: number;
    if (hasDebitCredit) {
      const debitKey = headers.find(h => /debit/i.test(h))!;
      const creditKey = headers.find(h => /credit/i.test(h))!;
      const debitRaw = record[debitKey]?.replace(/[£,]/g, "").trim();
      const creditRaw = record[creditKey]?.replace(/[£,]/g, "").trim();
      const debit = debitRaw ? parseFloat(debitRaw) : NaN;
      const credit = creditRaw ? parseFloat(creditRaw) : NaN;
      if (!isNaN(debit) && debit > 0) amount = -debit;
      else if (!isNaN(credit) && credit > 0) amount = credit;
      else { errors.push(`Row ${i + 2}: no valid amount, skipped`); continue; }
    } else if (hasPaidOut) {
      const outKey = headers.find(h => /paid.?out/i.test(h))!;
      const inKey = headers.find(h => /paid.?in/i.test(h))!;
      const outRaw = record[outKey]?.replace(/[£,]/g, "").trim();
      const inRaw = record[inKey]?.replace(/[£,]/g, "").trim();
      const out = outRaw ? parseFloat(outRaw) : NaN;
      const inc = inRaw ? parseFloat(inRaw) : NaN;
      if (!isNaN(out) && out > 0) amount = -out;
      else if (!isNaN(inc) && inc > 0) amount = inc;
      else { errors.push(`Row ${i + 2}: no valid amount, skipped`); continue; }
    } else {
      errors.push(`Row ${i + 2}: unrecognised HSBC format, skipped`);
      continue;
    }

    rows.push({ date, description, amount, currency: "GBP" });
  }

  return { rows, errors };
}
