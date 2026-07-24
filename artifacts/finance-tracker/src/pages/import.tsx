import { useState, useRef, useMemo } from "react";
import { useListAccounts, useCreateTransaction, useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { applyAutoCategory } from "@/lib/auto-cat";

// ─── types ───────────────────────────────────────────────────────────────────

type ImportStep = 1 | 2 | 3;

interface ParsedRow {
  id: string;
  rawDate: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  selected: boolean;
  isDuplicate?: boolean;
  error?: string;
}

interface ColumnMap {
  date: string;
  description: string;
  amount: string;
  type: string;
  credit: string;
  debit: string;
}

interface ImportHistoryEntry {
  date: string;
  count: number;
  filename?: string;
}

type AmountFormat = "signed" | "separate";

// ─── style atoms ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const card: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  padding: 20,
  marginBottom: 16,
};
const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "4px 10px",
  fontWeight: 400,
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "6px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};

const BTN_PRIMARY: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "8px 16px",
  border: "none",
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  cursor: "pointer",
};

const BTN_GHOST: React.CSSProperties = {
  ...mono,
  fontSize: 10,
  fontWeight: 400,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "8px 16px",
  border: "1px solid var(--ft-border)",
  background: "transparent",
  color: "var(--ft-muted)",
  cursor: "pointer",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "nr-import-history";

function loadHistory(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ImportHistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: ImportHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 3)));
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}

function parseOFX(text: string): ParsedRow[] {
  // Strip OFX header (everything before <OFX>)
  const body = text.replace(/^[\s\S]*?(?=<OFX>)/i, "");

  const rows: ParsedRow[] = [];
  // Match each STMTTRN block
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(body)) !== null) {
    const block = match[1];
    const get = (tag: string): string => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i").exec(block);
      return m ? m[1].trim() : "";
    };

    const rawDate = get("DTPOSTED").slice(0, 8); // YYYYMMDD
    const amtStr = get("TRNAMT") || get("TRNAMT>");
    const amount = parseFloat(amtStr.replace(",", "."));
    const description = get("NAME") || get("MEMO") || "Unknown";

    if (!rawDate || isNaN(amount)) continue;

    // Format date YYYYMMDD → YYYY-MM-DD
    const formattedDate = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;

    const type = amount < 0 ? "expense" : "income";
    const absAmount = Math.abs(amount);

    rows.push({
      id: `ofx-${rows.length}-${rawDate}`,
      rawDate: formattedDate,
      description,
      amount: absAmount,
      type,
      category: applyAutoCategory(description) ?? guessCategory(description),
      selected: true,
    });
  }

  // Fallback: try SGML-style (no closing tags)
  if (rows.length === 0) {
    const lines = body.split(/\r?\n/);
    let cur: Partial<ParsedRow> & { rawDateStr?: string; amountStr?: string } = {};

    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith("<STMTTRN>")) { cur = {}; continue; }
      if (l.startsWith("</STMTTRN>") || (l.startsWith("<") && l.includes("TRNUID") && cur.rawDate)) {
        if (cur.rawDate && cur.amount !== undefined) {
          const desc = cur.description ?? "Unknown";
          const rowType = cur.type ?? "expense";
          rows.push({
            id: `ofx-${rows.length}`,
            rawDate: cur.rawDate,
            description: desc,
            amount: cur.amount,
            type: rowType,
            category: applyAutoCategory(desc) ?? guessCategory(desc),
            selected: true,
          });
        }
        cur = {};
        continue;
      }

      if (l.startsWith("<DTPOSTED>")) {
        const d = l.replace(/<DTPOSTED>/i, "").replace(/\[.*/, "").trim().slice(0, 8);
        cur.rawDate = d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
      } else if (l.startsWith("<TRNAMT>")) {
        const a = parseFloat(l.replace(/<TRNAMT>/i, "").trim());
        cur.amount = Math.abs(a);
        cur.type = a < 0 ? "expense" : "income";
      } else if (l.startsWith("<NAME>")) {
        cur.description = l.replace(/<NAME>/i, "").trim();
      } else if (l.startsWith("<MEMO>") && !cur.description) {
        cur.description = l.replace(/<MEMO>/i, "").trim();
      }
    }
  }

  return rows;
}

function parseQIF(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const entries = text.split(/\^/);

  for (const entry of entries) {
    const lines = entry.trim().split(/\r?\n/);
    let date = "";
    let amount: number | null = null;
    let payee = "";
    let memo = "";

    for (const line of lines) {
      const code = line[0];
      const value = line.slice(1).trim();

      if (code === "D") {
        // Date: M/D/Y or D/M/Y or YYYY-MM-DD
        const parts = value.replace(/-/g, "/").split("/");
        if (parts.length === 3) {
          // Try to detect format
          const [a, b, c] = parts.map(p => parseInt(p, 10));
          if (c > 31) {
            // MM/DD/YYYY
            date = `${c}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;
          } else if (a > 31) {
            // YYYY/MM/DD
            date = `${a}-${String(b).padStart(2,"0")}-${String(c).padStart(2,"0")}`;
          } else {
            // DD/MM/YYYY (UK)
            date = `${c}-${String(b).padStart(2,"0")}-${String(a).padStart(2,"0")}`;
          }
        }
      } else if (code === "T" || code === "U") {
        amount = parseFloat(value.replace(/,/g, ""));
      } else if (code === "P") {
        payee = value;
      } else if (code === "M" && !payee) {
        memo = value;
      }
    }

    if (!date || amount === null) continue;

    const description = payee || memo || "Unknown";
    const type = amount < 0 ? "expense" : "income";

    rows.push({
      id: `qif-${rows.length}-${date}`,
      rawDate: date,
      description,
      amount: Math.abs(amount),
      type,
      category: applyAutoCategory(description) ?? guessCategory(description),
      selected: true,
    });
  }

  return rows;
}

function guessCategory(description: string): string {
  const desc = description.toLowerCase();
  const rules: [string[], string][] = [
    [["tesco", "sainsbury", "aldi", "lidl", "waitrose", "asda", "morrisons", "grocery", "supermarket"], "Groceries"],
    [["uber", "lyft", "bolt", "taxi", "train", "bus", "transport", "tfl", "rail"], "Transport"],
    [["netflix", "spotify", "amazon prime", "disney", "subscription", "hulu"], "Subscriptions"],
    [["restaurant", "cafe", "coffee", "mcdonald", "kfc", "pizza", "nando", "burger", "eat", "food"], "Eating Out"],
    [["electricity", "gas", "water", "broadband", "bt ", "sky ", "utilities"], "Utilities"],
    [["rent", "mortgage", "landlord", "letting"], "Housing"],
    [["gym", "sport", "fitness"], "Fitness"],
    [["amazon", "ebay", "asos", "shopping", "store"], "Shopping"],
    [["salary", "payroll", "wages", "income"], "Salary"],
    [["transfer", "atm", "cash"], "Transfer"],
  ];
  for (const [keywords, cat] of rules) {
    if (keywords.some((k) => desc.includes(k))) return cat;
  }
  return "Other";
}

function parseDate(raw: string): string {
  // Try common date formats
  const clean = raw.trim().replace(/['"]/g, "");
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
  // DD/MM/YYYY
  const dmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // MM/DD/YYYY
  const mdy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  return clean;
}

const EXAMPLE_CSV = `Date,Description,Amount,Type
2025-01-15,Salary,2800.00,income
2025-01-17,Tesco Groceries,-45.30,expense
2025-01-18,Netflix Subscription,-14.99,expense
2025-01-20,Amazon Purchase,-29.99,expense
2025-01-25,Freelance Payment,500.00,income`;

// ─── step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: ImportStep }) {
  const steps = [
    { n: 1 as ImportStep, label: "PASTE / UPLOAD" },
    { n: 2 as ImportStep, label: "MAP COLUMNS" },
    { n: 3 as ImportStep, label: "REVIEW & IMPORT" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {steps.map((step, i) => (
        <div key={step.n} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: current === step.n ? "var(--ft-accent)" :
                         current > step.n ? "var(--ft-surface)" : "var(--ft-base)",
            border: `1px solid ${current === step.n ? "var(--ft-accent)" :
                                  current > step.n ? "var(--ft-green)" : "var(--ft-border)"}`,
          }}>
            <div style={{
              ...mono,
              fontSize: 10,
              fontWeight: 700,
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: current === step.n ? "var(--ft-base)" :
                           current > step.n ? "var(--ft-green)" : "var(--ft-border)",
              color: current === step.n ? "var(--ft-accent)" :
                      current > step.n ? "var(--ft-base)" : "var(--ft-dim)",
            }}>
              {current > step.n ? "✓" : step.n}
            </div>
            <span style={{
              ...mono,
              fontSize: 9,
              letterSpacing: "0.08em",
              color: current === step.n ? "var(--ft-base)" :
                      current > step.n ? "var(--ft-green)" : "var(--ft-dim)",
              fontWeight: current === step.n ? 700 : 400,
            }}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: 24,
              height: 1,
              background: current > step.n ? "var(--ft-green)" : "var(--ft-border)",
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── step 1 ───────────────────────────────────────────────────────────────────

function Step1({
  csvText,
  onCsvChange,
  onFileUpload,
  onProceed,
  onShowExample,
  showExample,
}: {
  csvText: string;
  onCsvChange: (v: string) => void;
  onFileUpload: (text: string, ext: string) => void;
  onProceed: () => void;
  onShowExample: () => void;
  showExample: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") onFileUpload(text, ext);
    };
    reader.readAsText(file);
  };

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
        STEP 1 — PASTE OR UPLOAD FILE
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 16 }}>
        Paste your bank export below, or upload a .csv, .ofx, or .qif file
      </div>

      <textarea
        value={csvText}
        onChange={(e) => onCsvChange(e.target.value)}
        placeholder={"Paste your bank export CSV here...\n\nExample:\nDate,Description,Amount,Type\n2025-01-15,Salary,2800.00,income\n2025-01-17,Tesco,-45.30,expense"}
        style={{
          width: "100%",
          minHeight: 200,
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border)",
          color: "var(--ft-text)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          padding: 12,
          resize: "vertical",
          boxSizing: "border-box",
          outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.qif,text/csv,application/x-ofx,text/x-qif"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button onClick={() => fileRef.current?.click()} style={BTN_GHOST}>
          Upload CSV, OFX, or QIF
        </button>
        <button onClick={onShowExample} style={BTN_GHOST}>
          {showExample ? "Hide" : "Show"} example CSV
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onProceed}
          disabled={!csvText.trim()}
          style={{
            ...BTN_PRIMARY,
            opacity: !csvText.trim() ? 0.5 : 1,
            cursor: !csvText.trim() ? "not-allowed" : "pointer",
          }}
        >
          Parse CSV →
        </button>
      </div>

      {showExample && (
        <div style={{
          marginTop: 12,
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border)",
          padding: 12,
        }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Example Barclays/Monzo-style CSV</div>
          <pre style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", margin: 0, whiteSpace: "pre-wrap" }}>
            {EXAMPLE_CSV}
          </pre>
          <button
            onClick={() => onCsvChange(EXAMPLE_CSV)}
            style={{ ...BTN_GHOST, marginTop: 8, fontSize: 9 }}
          >
            Use this example
          </button>
        </div>
      )}
    </div>
  );
}

// ─── step 2 ───────────────────────────────────────────────────────────────────

function Step2({
  headers,
  previewRows,
  colMap,
  onColMapChange,
  amountFormat,
  onAmountFormatChange,
  onProceed,
  onBack,
}: {
  headers: string[];
  previewRows: string[][];
  colMap: ColumnMap;
  onColMapChange: (k: keyof ColumnMap, v: string) => void;
  amountFormat: AmountFormat;
  onAmountFormatChange: (v: AmountFormat) => void;
  onProceed: () => void;
  onBack: () => void;
}) {
  const ColSelect = ({ field, label }: { field: keyof ColumnMap; label: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <div style={labelStyle}>{label}</div>
      <select
        value={colMap[field]}
        onChange={(e) => onColMapChange(field, e.target.value)}
        style={{
          ...mono,
          fontSize: 10,
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border)",
          color: "var(--ft-text)",
          padding: "6px 8px",
          cursor: "pointer",
        }}
      >
        <option value="">— none —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
        STEP 2 — MAP COLUMNS
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 16 }}>
        Tell Numeris which CSV column maps to each field
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <ColSelect field="date" label="Date column" />
        <ColSelect field="description" label="Description column" />
        <ColSelect field="type" label="Type column (income/expense)" />
      </div>

      {/* Amount format selector */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <div style={labelStyle}>Amount format:</div>
        {[
          { v: "signed" as AmountFormat, label: "Single column (+ income, − expense)" },
          { v: "separate" as AmountFormat, label: "Separate debit / credit columns" },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => onAmountFormatChange(opt.v)}
            style={{
              ...mono,
              fontSize: 9,
              padding: "4px 8px",
              border: `1px solid ${amountFormat === opt.v ? "var(--ft-accent)" : "var(--ft-border)"}`,
              background: amountFormat === opt.v ? "var(--ft-accent)22" : "transparent",
              color: amountFormat === opt.v ? "var(--ft-accent)" : "var(--ft-muted)",
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {amountFormat === "signed" ? (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <ColSelect field="amount" label="Amount column (signed)" />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <ColSelect field="credit" label="Credit / income column" />
          <ColSelect field="debit" label="Debit / expense column" />
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>PREVIEW (first 5 rows)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 10 }}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ ...td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onBack} style={BTN_GHOST}>← Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onProceed}
          disabled={!colMap.date || !colMap.description}
          style={{
            ...BTN_PRIMARY,
            opacity: (!colMap.date || !colMap.description) ? 0.5 : 1,
            cursor: (!colMap.date || !colMap.description) ? "not-allowed" : "pointer",
          }}
        >
          Build Preview →
        </button>
      </div>
    </div>
  );
}

// ─── step 3 ───────────────────────────────────────────────────────────────────

function Step3({
  rows,
  accounts,
  accountId,
  onAccountChange,
  onToggleRow,
  onToggleAll,
  onImport,
  onBack,
  onDeselectDuplicates,
  importing,
  progress,
  errors,
}: {
  rows: ParsedRow[];
  accounts: { id: number; name: string }[];
  accountId: string;
  onAccountChange: (v: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: (v: boolean) => void;
  onImport: () => void;
  onBack: () => void;
  onDeselectDuplicates: () => void;
  importing: boolean;
  progress: number;
  errors: Record<string, string>;
}) {
  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const dupCount = rows.filter((r) => r.isDuplicate).length;

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>
        STEP 3 — REVIEW &amp; IMPORT
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 16 }}>
        Select transactions to import · {selectedCount} of {rows.length} selected
      </div>

      {/* Account selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "10px 14px", background: "var(--ft-base)", border: "1px solid var(--ft-border)" }}>
        <div style={labelStyle}>Import into account:</div>
        <select
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
          style={{
            ...mono,
            fontSize: 10,
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-text)",
            padding: "6px 8px",
            cursor: "pointer",
            minWidth: 180,
          }}
        >
          <option value="">— select account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        {!accountId && (
          <span style={{ ...mono, fontSize: 9, color: "var(--ft-amber)" }}>
            Account required to import
          </span>
        )}
      </div>

      {/* Duplicate warning */}
      {dupCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--ft-amber)15", border: "1px solid var(--ft-amber)44", marginBottom: 12 }}>
          <span style={{ ...mono, fontSize: 10, color: "var(--ft-amber)" }}>⚠ {dupCount} potential duplicate{dupCount !== 1 ? "s" : ""} detected</span>
          <button onClick={onDeselectDuplicates} style={{ ...BTN_GHOST, fontSize: 9, padding: "4px 10px" }}>Deselect duplicates</button>
        </div>
      )}

      {/* Progress bar */}
      {importing && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>IMPORTING… {progress} / {selectedCount}</div>
          <div style={{ height: 4, background: "var(--ft-border)" }}>
            <div style={{
              height: "100%",
              width: `${(progress / selectedCount) * 100}%`,
              background: "var(--ft-green)",
              transition: "width 0.2s ease",
            }} />
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 480, overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              <th style={{ ...th, width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
                />
              </th>
              {["Date","Description","Amount","Type","Category","Status"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasError = !!errors[row.id];
              return (
                <tr
                  key={row.id}
                  style={{
                    opacity: row.selected ? 1 : 0.45,
                    background: hasError ? "var(--ft-red)10" : "transparent",
                  }}
                >
                  <td style={{ ...td, width: 32 }}>
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => onToggleRow(row.id)}
                      style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
                    />
                  </td>
                  <td style={{ ...td, color: "var(--ft-dim)" }}>{row.rawDate}</td>
                  <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {row.description}
                  </td>
                  <td style={{
                    ...td,
                    textAlign: "right",
                    color: row.type === "income" ? "var(--ft-green)" : "var(--ft-red)",
                    fontWeight: 600,
                  }}>
                    {row.type === "income" ? "+" : "-"}{formatGbp(Math.abs(row.amount))}
                  </td>
                  <td style={{
                    ...td,
                    textAlign: "right",
                  }}>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      background: row.type === "income" ? "var(--ft-green)22" : "var(--ft-red)22",
                      color: row.type === "income" ? "var(--ft-green)" : "var(--ft-red)",
                    }}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)" }}>{row.category}</td>
                  <td style={{ ...td, textAlign: "right", fontSize: 9 }}>
                    {hasError ? (
                      <span style={{ color: "var(--ft-red)" }}>ERROR: {errors[row.id]}</span>
                    ) : importing && row.selected ? (
                      <span style={{ color: "var(--ft-dim)" }}>…</span>
                    ) : row.isDuplicate ? (
                      <span style={{ color: "var(--ft-amber)", background: "var(--ft-amber)22", padding: "1px 5px", fontSize: 9 }}>DUP</span>
                    ) : (
                      <span style={{ color: "var(--ft-green)" }}>READY</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <button onClick={onBack} style={BTN_GHOST} disabled={importing}>← Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onImport}
          disabled={importing || selectedCount === 0 || !accountId}
          style={{
            ...BTN_PRIMARY,
            background: importing ? "var(--ft-muted)" : "var(--ft-green)",
            opacity: (importing || selectedCount === 0 || !accountId) ? 0.6 : 1,
            cursor: (importing || selectedCount === 0 || !accountId) ? "not-allowed" : "pointer",
          }}
        >
          {importing ? `Importing ${progress}/${selectedCount}…` : `Import ${selectedCount} Transaction${selectedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>(1);
  const [csvText, setCsvText] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [colMap, setColMap] = useState<ColumnMap>({
    date: "",
    description: "",
    amount: "",
    type: "",
    credit: "",
    debit: "",
  });
  const [amountFormat, setAmountFormat] = useState<AmountFormat>("signed");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const [importDone, setImportDone] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntry[]>(loadHistory);

  const { data: rawAccounts } = useListAccounts();
  const { data: existingTxs } = useListTransactions();
  const accounts = (rawAccounts ?? []) as { id: number; name: string }[];
  const createTransaction = useCreateTransaction();

  // Auto-detect: try to find likely columns
  const autoDetect = (hdrs: string[]) => {
    const find = (...candidates: string[]) =>
      hdrs.find((h) =>
        candidates.some((c) => h.toLowerCase().includes(c))
      ) ?? "";

    setColMap({
      date: find("date", "time", "posted"),
      description: find("description", "desc", "narration", "details", "memo", "payee", "reference"),
      amount: find("amount", "value", "sum"),
      type: find("type", "transaction type", "debit/credit"),
      credit: find("credit", "deposit", "in", "income"),
      debit: find("debit", "withdrawal", "out", "expense"),
    });
  };

  const handleFileUpload = (text: string, ext: string) => {
    if (ext === "ofx") {
      const parsed = parseOFX(text);
      if (parsed.length > 0) {
        const withDups = parsed.map((r) => {
          const isDuplicate = (existingTxs ?? []).some(
            (tx) => tx.date === r.rawDate && Math.abs(Math.abs(tx.nativeAmount) - r.amount) < 0.01
          );
          return isDuplicate ? { ...r, isDuplicate: true, selected: false } : r;
        });
        setParsedRows(withDups);
        setImportErrors({});
        setImportDone(false);
        setStep(3);
        return;
      }
    } else if (ext === "qif") {
      const parsed = parseQIF(text);
      if (parsed.length > 0) {
        const withDups = parsed.map((r) => {
          const isDuplicate = (existingTxs ?? []).some(
            (tx) => tx.date === r.rawDate && Math.abs(Math.abs(tx.nativeAmount) - r.amount) < 0.01
          );
          return isDuplicate ? { ...r, isDuplicate: true, selected: false } : r;
        });
        setParsedRows(withDups);
        setImportErrors({});
        setImportDone(false);
        setStep(3);
        return;
      }
    }
    // Fall back to CSV flow
    setCsvText(text);
  };

  const handleParseCsv = () => {
    const { headers: hdrs, rows } = parseCSV(csvText);
    if (hdrs.length === 0) return;
    setHeaders(hdrs);
    setRawRows(rows);
    autoDetect(hdrs);
    setStep(2);
  };

  const handleBuildPreview = () => {
    const dateIdx = headers.indexOf(colMap.date);
    const descIdx = headers.indexOf(colMap.description);
    const amtIdx = amountFormat === "signed" ? headers.indexOf(colMap.amount) : -1;
    const creditIdx = amountFormat === "separate" ? headers.indexOf(colMap.credit) : -1;
    const debitIdx = amountFormat === "separate" ? headers.indexOf(colMap.debit) : -1;
    const typeIdx = colMap.type ? headers.indexOf(colMap.type) : -1;

    const built: ParsedRow[] = rawRows
      .filter((row) => row.some((c) => c.trim()))
      .map((row, i) => {
        const rawDate = dateIdx >= 0 ? row[dateIdx] ?? "" : "";
        const description = descIdx >= 0 ? row[descIdx] ?? "" : "";

        let amount = 0;
        let type: "income" | "expense" = "expense";

        if (amountFormat === "signed" && amtIdx >= 0) {
          const raw = (row[amtIdx] ?? "").replace(/[£$€,\s]/g, "");
          amount = parseFloat(raw) || 0;
          type = amount >= 0 ? "income" : "expense";
          amount = Math.abs(amount);
        } else if (amountFormat === "separate") {
          const creditRaw = creditIdx >= 0 ? (row[creditIdx] ?? "").replace(/[£$€,\s]/g, "") : "";
          const debitRaw = debitIdx >= 0 ? (row[debitIdx] ?? "").replace(/[£$€,\s]/g, "") : "";
          const creditVal = parseFloat(creditRaw) || 0;
          const debitVal = parseFloat(debitRaw) || 0;
          if (creditVal > 0) { amount = creditVal; type = "income"; }
          else { amount = debitVal; type = "expense"; }
        }

        // Try to get type from column
        if (typeIdx >= 0) {
          const typeStr = (row[typeIdx] ?? "").toLowerCase();
          if (typeStr.includes("income") || typeStr.includes("credit") || typeStr.includes("deposit")) {
            type = "income";
          } else if (typeStr.includes("expense") || typeStr.includes("debit") || typeStr.includes("withdrawal")) {
            type = "expense";
          }
        }

        return {
          id: `row-${i}`,
          rawDate: parseDate(rawDate),
          description: description,
          amount,
          type,
          category: applyAutoCategory(description) ?? guessCategory(description),
          selected: true,
        };
      });

    const withDups = built.map((r) => {
      const isDuplicate = (existingTxs ?? []).some(
        (tx) => tx.date === r.rawDate && Math.abs(Math.abs(tx.nativeAmount) - r.amount) < 0.01
      );
      return isDuplicate ? { ...r, isDuplicate: true, selected: false } : r;
    });
    setParsedRows(withDups);
    setImportErrors({});
    setImportDone(false);
    setStep(3);
  };

  const handleDeselectDuplicates = () => {
    setParsedRows((rows) => rows.map((r) => r.isDuplicate ? { ...r, selected: false } : r));
  };

  const handleToggleRow = (id: string) => {
    setParsedRows((rows) =>
      rows.map((r) => r.id === id ? { ...r, selected: !r.selected } : r)
    );
  };

  const handleToggleAll = (v: boolean) => {
    setParsedRows((rows) => rows.map((r) => ({ ...r, selected: v })));
  };

  const handleImport = async () => {
    if (!accountId) return;
    const selected = parsedRows.filter((r) => r.selected);
    setImporting(true);
    setImportProgress(0);
    const errors: Record<string, string> = {};

    for (let i = 0; i < selected.length; i++) {
      const row = selected[i];
      try {
        await createTransaction.mutateAsync({
          data: {
            date: row.rawDate,
            description: row.description,
            type: row.type,
            category: row.category,
            accountId: parseInt(accountId),
            nativeAmount: row.amount,
            currency: "GBP",
          },
        });
      } catch (err) {
        errors[row.id] = err instanceof Error ? err.message : "Unknown error";
      }
      setImportProgress(i + 1);
    }

    setImportErrors(errors);
    setImporting(false);
    setImportDone(true);

    const successCount = selected.length - Object.keys(errors).length;
    const entry: ImportHistoryEntry = {
      date: new Date().toISOString(),
      count: successCount,
    };
    const newHistory = [entry, ...history].slice(0, 3);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  const successCount = useMemo(
    () => parsedRows.filter((r) => r.selected && !importErrors[r.id]).length,
    [parsedRows, importErrors]
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>
            IMPORT
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
            bulk-create transactions from a bank export (CSV, OFX, QIF)
          </div>
        </div>
        {/* Import history */}
        {history.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Recent imports</div>
            {history.map((h, i) => (
              <div key={i} style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
                {new Date(h.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} · {h.count} transactions
              </div>
            ))}
          </div>
        )}
      </div>

      <StepIndicator current={step} />

      {/* Import complete banner */}
      {importDone && (
        <div style={{
          background: Object.keys(importErrors).length === 0 ? "var(--ft-green)15" : "var(--ft-amber)15",
          border: `1px solid ${Object.keys(importErrors).length === 0 ? "var(--ft-green)" : "var(--ft-amber)"}44`,
          padding: "12px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}>
          <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: Object.keys(importErrors).length === 0 ? "var(--ft-green)" : "var(--ft-amber)" }}>
            {Object.keys(importErrors).length === 0
              ? `✓ Import complete — ${successCount} transaction${successCount !== 1 ? "s" : ""} created`
              : `⚠ ${successCount} imported · ${Object.keys(importErrors).length} failed`}
          </div>
          <button
            onClick={() => { setCsvText(""); setStep(1); setImportDone(false); setImportErrors({}); setParsedRows([]); }}
            style={{ ...BTN_GHOST, marginLeft: "auto", fontSize: 9 }}
          >
            Start New Import
          </button>
        </div>
      )}

      {step === 1 && (
        <Step1
          csvText={csvText}
          onCsvChange={setCsvText}
          onFileUpload={handleFileUpload}
          onProceed={handleParseCsv}
          onShowExample={() => setShowExample((v) => !v)}
          showExample={showExample}
        />
      )}

      {step === 2 && (
        <Step2
          headers={headers}
          previewRows={rawRows}
          colMap={colMap}
          onColMapChange={(k, v) => setColMap((m) => ({ ...m, [k]: v }))}
          amountFormat={amountFormat}
          onAmountFormatChange={setAmountFormat}
          onProceed={handleBuildPreview}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <Step3
          rows={parsedRows}
          accounts={accounts}
          accountId={accountId}
          onAccountChange={setAccountId}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onImport={handleImport}
          onBack={() => setStep(headers.length > 0 ? 2 : 1)}
          onDeselectDuplicates={handleDeselectDuplicates}
          importing={importing}
          progress={importProgress}
          errors={importErrors}
        />
      )}
    </div>
  );
}
