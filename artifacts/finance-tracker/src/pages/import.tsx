import { useState, useRef, useMemo } from "react";
import { useListAccounts, useCreateTransaction, useListTransactions } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { applyAutoCategory } from "@/lib/auto-cat";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PageHeader } from "@/components/page-header";
import {
  FileInput,
  Upload,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
} from "lucide-react";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";

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

// ─── Bank/broker format presets ───────────────────────────────────────────────

interface FormatPreset {
  label: string;
  amountFormat: AmountFormat;
  colHints: { date: string[]; description: string[]; amount: string[]; credit: string[]; debit: string[] };
}

const FORMAT_PRESETS: FormatPreset[] = [
  { label: "Monzo",     amountFormat: "signed",   colHints: { date: ["date"], description: ["name","description","memo"], amount: ["amount"], credit: [], debit: [] } },
  { label: "Revolut",   amountFormat: "signed",   colHints: { date: ["date completed","date"], description: ["description"], amount: ["amount"], credit: [], debit: [] } },
  { label: "Starling",  amountFormat: "signed",   colHints: { date: ["date"], description: ["counter party","reference","description"], amount: ["amount (gbp)","amount"], credit: [], debit: [] } },
  { label: "Barclays",  amountFormat: "signed",   colHints: { date: ["date"], description: ["memo","description"], amount: ["amount"], credit: [], debit: [] } },
  { label: "HSBC",      amountFormat: "separate", colHints: { date: ["date"], description: ["description","details"], amount: [], credit: ["credit","in"], debit: ["debit","out"] } },
  { label: "NatWest",   amountFormat: "separate", colHints: { date: ["date"], description: ["description","reference"], amount: [], credit: ["credit"], debit: ["debit"] } },
  { label: "Schwab",    amountFormat: "signed",   colHints: { date: ["date"], description: ["description","action"], amount: ["amount"], credit: [], debit: [] } },
  { label: "Robinhood", amountFormat: "signed",   colHints: { date: ["activity date","process date"], description: ["description","instrument"], amount: ["amount"], credit: [], debit: [] } },
  { label: "IBKR",      amountFormat: "signed",   colHints: { date: ["date/time","date"], description: ["description","symbol"], amount: ["amount","proceeds"], credit: [], debit: [] } },
];

function applyPreset(preset: FormatPreset, headers: string[]): { colMap: Partial<ColumnMap>; amountFormat: AmountFormat } {
  const lc = headers.map((h) => h.toLowerCase().trim());
  const match = (hints: string[]) => headers.find((_, i) => hints.some((h) => lc[i].includes(h))) ?? "";
  return {
    amountFormat: preset.amountFormat,
    colMap: {
      date: match(preset.colHints.date),
      description: match(preset.colHints.description),
      amount: preset.amountFormat === "signed" ? match(preset.colHints.amount) : "",
      credit: preset.amountFormat === "separate" ? match(preset.colHints.credit) : "",
      debit: preset.amountFormat === "separate" ? match(preset.colHints.debit) : "",
    },
  };
}

// ─── style atoms ─────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  padding: 20,
  marginBottom: 16,
  boxSizing: "border-box",
  width: "100%",
};

const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "6px 10px",
  fontWeight: 700,
  background: "var(--ft-base)",
  borderBottom: "1px solid var(--ft-border2)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
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
  display: "flex",
  alignItems: "center",
  gap: 6,
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
  const body = text.replace(/^[\s\S]*?(?=<OFX>)/i, "");

  const rows: ParsedRow[] = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = trnRegex.exec(body)) !== null) {
    const block = match[1];
    const get = (tag: string): string => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i").exec(block);
      return m ? m[1].trim() : "";
    };

    const rawDate = get("DTPOSTED").slice(0, 8);
    const amtStr = get("TRNAMT") || get("TRNAMT>");
    const amount = parseFloat(amtStr.replace(",", "."));
    const description = get("NAME") || get("MEMO") || "Unknown";

    if (!rawDate || isNaN(amount)) continue;

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
        const parts = value.replace(/-/g, "/").split("/");
        if (parts.length === 3) {
          const [a, b, c] = parts.map(p => parseInt(p, 10));
          if (c > 31) {
            date = `${c}-${String(a).padStart(2,"0")}-${String(b).padStart(2,"0")}`;
          } else if (a > 31) {
            date = `${a}-${String(b).padStart(2,"0")}-${String(c).padStart(2,"0")}`;
          } else {
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
  const clean = raw.trim().replace(/['"]/g, "");
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
  const dmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
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

// ─── History entry item (module-level) ───────────────────────────────────────

interface HistoryEntryItemProps {
  entry: ImportHistoryEntry;
}

function HistoryEntryItem({ entry }: HistoryEntryItemProps) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color: "var(--ft-dim)",
      marginBottom: 2,
      display: "flex",
      alignItems: "center",
      gap: 6,
      justifyContent: "flex-end",
    }}>
      <Text as="span" color="var(--ft-green)">·</Text>
      {new Date(entry.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      })}
      <Text as="span" color="var(--ft-border2)">·</Text>
      <span className="pnum">{entry.count}</span> tx
    </div>
  );
}

// ─── Amount format option button (module-level) ────────────────────────────────

interface AmountFormatOptionProps {
  value: AmountFormat;
  label: string;
  selected: boolean;
  onSelect: (v: AmountFormat) => void;
}

function AmountFormatOption({ value, label, selected, onSelect }: AmountFormatOptionProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      key={value}
      onClick={() => onSelect(value)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...mono,
        fontSize: 9,
        padding: "5px 10px",
        border: `1px solid ${selected ? "var(--ft-accent)" : hovered ? "var(--ft-border2)" : "var(--ft-border)"}`,
        background: selected
          ? "color-mix(in srgb, var(--ft-accent) 12%, var(--ft-surface))"
          : hovered
          ? "color-mix(in srgb, var(--ft-accent) 4%, var(--ft-surface))"
          : "transparent",
        color: selected ? "var(--ft-accent)" : hovered ? "var(--ft-text)" : "var(--ft-muted)",
        cursor: "pointer",
        transition: "background 0.1s, border-color 0.1s, color 0.1s",
        fontWeight: selected ? 700 : 400,
      }}
    >
      {selected && "✓ "}{label}
    </button>
  );
}

// ─── step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: ImportStep }) {
  const steps: { n: ImportStep; label: string }[] = [
    { n: 1, label: "PASTE / UPLOAD" },
    { n: 2, label: "MAP COLUMNS" },
    { n: 3, label: "REVIEW & IMPORT" },
  ];
  return (
    <div
      className="ft-scroll-x"
      style={{ display: "flex", alignItems: "stretch", gap: 0, marginBottom: 24 }}
    >
      {steps.map((step, i) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <div key={step.n} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                background: active
                  ? "var(--ft-accent)"
                  : done
                  ? "var(--ft-surface)"
                  : "var(--ft-base)",
                border: `1px solid ${
                  active ? "var(--ft-accent)" : done ? "var(--ft-green)" : "var(--ft-border)"
                }`,
                borderLeft: i === 0 ? undefined : "none",
              }}
            >
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: active
                    ? "var(--ft-base)"
                    : done
                    ? "var(--ft-green)"
                    : "var(--ft-border)",
                  color: active
                    ? "var(--ft-accent)"
                    : done
                    ? "var(--ft-base)"
                    : "var(--ft-dim)",
                }}
              >
                {done ? "✓" : step.n}
              </div>
              <span
                style={{
                  ...mono,
                  fontSize: 9,
                  letterSpacing: "0.10em",
                  color: active
                    ? "var(--ft-base)"
                    : done
                    ? "var(--ft-green)"
                    : "var(--ft-dim)",
                  fontWeight: active ? 700 : done ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "0 2px",
                  background: done ? "var(--ft-green)" : "var(--ft-border)",
                  height: "100%",
                  alignSelf: "stretch",
                }}
              >
                <ChevronRight
                  size={12}
                  color={done ? "var(--ft-base)" : "var(--ft-dim)"}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── drop zone component ───────────────────────────────────────────────────────

function DropZone({
  onFileUpload,
  fileRef,
}: {
  onFileUpload: (text: string, ext: string) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
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
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      style={{
        border: `1px dashed ${dragging ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        background: dragging
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : "var(--ft-base)",
        padding: "28px 20px",
        cursor: "pointer",
        textAlign: "center",
        transition: "background 0.15s, border-color 0.15s",
        marginBottom: 12,
      }}
    >
      <Upload
        size={20}
        color={dragging ? "var(--ft-accent)" : "var(--ft-dim)"}
        style={{ marginBottom: 8 }}
      />
      <div
        style={{
          ...mono,
          fontSize: 10,
          color: dragging ? "var(--ft-accent)" : "var(--ft-muted)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {dragging ? "DROP TO UPLOAD" : "DRAG & DROP OR CLICK TO UPLOAD"}
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
        .csv · .ofx · .qif
      </div>
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

  const lineCount = csvText.trim() ? csvText.trim().split("\n").length : 0;

  return (
    <div style={card}>
      {/* Step header */}
      <div style={{ marginBottom: 16, borderBottom: "1px solid var(--ft-border)", paddingBottom: 12 }}>
        <div
          style={{
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-accent)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 2,
            borderLeft: "3px solid var(--ft-accent)",
            paddingLeft: 8,
          }}
        >
          Step 1 — Paste or Upload File
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", paddingLeft: 11 }}>
          Paste your bank export below, or upload a .csv, .ofx, or .qif file
        </div>
      </div>

      {/* Drop zone */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.ofx,.qif,text/csv,application/x-ofx,text/x-qif"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <DropZone onFileUpload={onFileUpload} fileRef={fileRef} />

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          marginTop: 4,
        }}
      >
        <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
        <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
          OR PASTE BELOW
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
      </div>

      {/* Textarea */}
      <div style={{ position: "relative" }}>
        <textarea
          value={csvText}
          onChange={(e) => onCsvChange(e.target.value)}
          placeholder={"Date,Description,Amount,Type\n2025-01-15,Salary,2800.00,income\n2025-01-17,Tesco,-45.30,expense\n..."}
          style={{
            width: "100%",
            minHeight: 160,
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: 12,
            resize: "vertical",
            boxSizing: "border-box",
            outline: "none",
            lineHeight: 1.6,
          }}
        />
        {lineCount > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              ...mono,
              fontSize: 9,
              color: "var(--ft-dim)",
              pointerEvents: "none",
            }}
          >
            <span className="pnum">{lineCount}</span> line{lineCount !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onShowExample} style={BTN_GHOST}>
          {showExample ? "Hide example" : "Show example CSV"}
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
          Parse CSV
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Example panel */}
      {showExample && (
        <div
          style={{
            marginTop: 14,
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            borderLeft: "2px solid var(--ft-accent)",
            padding: 12,
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 8 }}>Example Barclays/Monzo-style CSV</div>
          <pre style={{ ...mono, fontSize: 10, color: "var(--ft-muted)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {EXAMPLE_CSV}
          </pre>
          <button
            onClick={() => onCsvChange(EXAMPLE_CSV)}
            style={{ ...BTN_GHOST, marginTop: 10, fontSize: 9, padding: "4px 10px" }}
          >
            Use this example →
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
  onApplyPreset,
}: {
  headers: string[];
  previewRows: string[][];
  colMap: ColumnMap;
  onColMapChange: (k: keyof ColumnMap, v: string) => void;
  amountFormat: AmountFormat;
  onAmountFormatChange: (v: AmountFormat) => void;
  onProceed: () => void;
  onBack: () => void;
  onApplyPreset: (preset: FormatPreset) => void;
}) {
  const ColSelect = ({ field, label }: { field: keyof ColumnMap; label: string }) => (
    <VStack gap={4} grow minWidth={140}>
      <div style={labelStyle}>{label}</div>
      <select
        value={colMap[field]}
        onChange={(e) => onColMapChange(field, e.target.value)}
        style={{
          ...mono,
          fontSize: 10,
          background: "var(--ft-base)",
          border: `1px solid ${colMap[field] ? "var(--ft-green)" : "var(--ft-border)"}`,
          color: colMap[field] ? "var(--ft-text)" : "var(--ft-dim)",
          padding: "6px 8px",
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.15s",
        }}
      >
        <option value="">— none —</option>
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </VStack>
  );

  return (
    <div style={card}>
      {/* Step header */}
      <div style={{ marginBottom: 16, borderBottom: "1px solid var(--ft-border)", paddingBottom: 12 }}>
        <div
          style={{
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-accent)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 2,
            borderLeft: "3px solid var(--ft-accent)",
            paddingLeft: 8,
          }}
        >
          Step 2 — Map Columns
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", paddingLeft: 11 }}>
          Tell Numeris which CSV column maps to each field · <span className="pnum">{headers.length}</span> columns detected
        </div>
      </div>

      {/* Quick Format Presets */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>Quick presets — auto-fill for known banks</div>
        <HStack gap={5} wrap>
          {FORMAT_PRESETS.map((p) => (
            <PresetButton key={p.label} preset={p} onApply={onApplyPreset} />
          ))}
        </HStack>
      </div>

      {/* Column mapping */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle, marginBottom: 8, borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 8 }}>Column mapping</div>
        <HStack gap={10} wrap marginBottom={10}>
          <ColSelect field="date" label="Date" />
          <ColSelect field="description" label="Description" />
          <ColSelect field="type" label="Type (income/expense)" />
        </HStack>
      </div>

      {/* Amount format selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelStyle, marginBottom: 8, borderLeft: "3px solid var(--ft-cyan)", paddingLeft: 8 }}>Amount format</div>
        <HStack gap={6} wrap>
          {[
            { v: "signed" as AmountFormat, label: "Single column (+ income, − expense)" },
            { v: "separate" as AmountFormat, label: "Separate debit / credit columns" },
          ].map((opt) => (
            <AmountFormatOption
              key={opt.v}
              value={opt.v}
              label={opt.label}
              selected={amountFormat === opt.v}
              onSelect={onAmountFormatChange}
            />
          ))}
        </HStack>
      </div>

      {amountFormat === "signed" ? (
        <HStack gap={10} marginBottom={16}>
          <ColSelect field="amount" label="Amount column (signed)" />
        </HStack>
      ) : (
        <HStack gap={10} marginBottom={16}>
          <ColSelect field="credit" label="Credit / income column" />
          <ColSelect field="debit" label="Debit / expense column" />
        </HStack>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 8, borderLeft: "3px solid var(--ft-border2)", paddingLeft: 8 }}>
            Preview — first {Math.min(5, previewRows.length)} of <span className="pnum">{previewRows.length}</span> rows
          </div>
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--ft-border)",
              background: "var(--ft-surface)",
            }}
          >
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
                  <tr
                    key={i}
                    style={{ background: i % 2 === 1 ? "var(--ft-base)" : "transparent" }}
                  >
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

      <HStack gap={8} marginTop={4}>
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
          Build Preview
          <ChevronRight size={12} />
        </button>
      </HStack>
    </div>
  );
}

// ─── preset button with hover ──────────────────────────────────────────────────

function PresetButton({
  preset,
  onApply,
}: {
  preset: FormatPreset;
  onApply: (preset: FormatPreset) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onApply(preset)}
      style={{
        ...mono,
        fontSize: 9,
        fontWeight: 600,
        padding: "4px 10px",
        background: hovered
          ? "color-mix(in srgb, var(--ft-accent) 8%, var(--ft-surface))"
          : "var(--ft-raised)",
        border: `1px solid ${hovered ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        color: hovered ? "var(--ft-accent)" : "var(--ft-muted)",
        cursor: "pointer",
        letterSpacing: "0.06em",
        transition: "background 0.1s, border-color 0.1s, color 0.1s",
      }}
    >
      {preset.label}
    </button>
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
  const incomeCount = rows.filter((r) => r.selected && r.type === "income").length;
  const expenseCount = rows.filter((r) => r.selected && r.type === "expense").length;

  return (
    <div style={card}>
      {/* Step header */}
      <div style={{ marginBottom: 16, borderBottom: "1px solid var(--ft-border)", paddingBottom: 12 }}>
        <div
          style={{
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--ft-accent)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 2,
            borderLeft: "3px solid var(--ft-accent)",
            paddingLeft: 8,
          }}
        >
          Step 3 — Review &amp; Import
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", paddingLeft: 11 }}>
          <span className="pnum">{selectedCount}</span> of <span className="pnum">{rows.length}</span> transactions selected · <span className="pnum">{incomeCount}</span> income · <span className="pnum">{expenseCount}</span> expenses
        </div>
      </div>

      {/* KPI strip (border-as-gap) */}
      <div style={{ display: "grid", gap: 1, background: "var(--ft-border)", marginBottom: 14 }} className="ft-four-col">
        {[
          { label: "Total Rows", value: String(rows.length), color: "var(--ft-muted)" },
          { label: "Selected", value: String(selectedCount), color: "var(--ft-accent)" },
          { label: "Income", value: String(incomeCount), color: "var(--ft-green)" },
          { label: "Expenses", value: String(expenseCount), color: "var(--ft-red)" },
        ].map(k => (
          <div key={k.label} style={{ background: "var(--ft-surface)", borderTop: `2px solid ${k.color}`, padding: "7px 12px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>
              {k.label}
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: k.color, lineHeight: 1 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Account selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
          padding: "10px 14px",
          background: "var(--ft-base)",
          border: `1px solid ${accountId ? "var(--ft-border)" : "var(--ft-amber)"}`,
          flexWrap: "wrap",
          transition: "border-color 0.15s",
        }}
      >
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
            flex: "1 1 auto",
            outline: "none",
          }}
        >
          <option value="">— select account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>{a.name}</option>
          ))}
        </select>
        {!accountId && (
          <span style={{ ...mono, fontSize: 9, color: "var(--ft-amber)", display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={10} />
            Required to import
          </span>
        )}
      </div>

      {/* Duplicate warning banner */}
      {dupCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "rgba(244,162,30,0.08)",
            border: "1px solid rgba(244,162,30,0.28)",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <AlertTriangle size={12} color="var(--ft-amber)" style={{ flexShrink: 0 }} />
          <span style={{ ...mono, fontSize: 10, color: "var(--ft-amber)", flex: 1 }}>
            <span className="pnum">{dupCount}</span> potential duplicate{dupCount !== 1 ? "s" : ""} detected — these are pre-deselected
          </span>
          <button
            onClick={onDeselectDuplicates}
            style={{ ...BTN_GHOST, fontSize: 9, padding: "3px 10px" }}
          >
            Deselect all duplicates
          </button>
        </div>
      )}

      {/* Import progress bar */}
      {importing && (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div style={{ ...labelStyle }}>
              Importing…
            </div>
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>
              <span className="pnum">{progress}</span> / <span className="pnum">{selectedCount}</span>
            </span>
          </div>
          <div style={{ height: 3, background: "var(--ft-border)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${selectedCount > 0 ? (progress / selectedCount) * 100 : 0}%`,
                background: "var(--ft-green)",
                transition: "width 0.12s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Transaction table */}
      <div style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto", border: "1px solid var(--ft-border)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              <th style={{ ...th, width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
                />
              </th>
              <th style={th}>Date</th>
              <th style={th}>Description</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
              <th style={{ ...th, textAlign: "center" }}>Type</th>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ImportRow
                key={row.id}
                row={row}
                td={td}
                hasError={!!errors[row.id]}
                errorMsg={errors[row.id]}
                importing={importing}
                onToggle={onToggleRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <HStack gap={8} align="center" wrap marginTop={14}>
        <button onClick={onBack} style={BTN_GHOST} disabled={importing}>← Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onImport}
          disabled={importing || selectedCount === 0 || !accountId}
          style={{
            ...BTN_PRIMARY,
            background: importing ? "var(--ft-muted)" : "var(--ft-green)",
            color: "var(--ft-base)",
            opacity: (importing || selectedCount === 0 || !accountId) ? 0.55 : 1,
            cursor: (importing || selectedCount === 0 || !accountId) ? "not-allowed" : "pointer",
            border: "none",
          }}
        >
          {importing ? (
            <>
              <Clock size={12} />
              Importing <span className="pnum">{progress}</span>/<span className="pnum">{selectedCount}</span>…
            </>
          ) : (
            <>
              <CheckCircle2 size={12} />
              Import <span className="pnum">{selectedCount}</span> Transaction{selectedCount !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </HStack>
    </div>
  );
}

// ─── import row with hover ─────────────────────────────────────────────────────

function ImportRow({
  row,
  td: tdStyle,
  hasError,
  errorMsg,
  importing,
  onToggle,
}: {
  row: ParsedRow;
  td: React.CSSProperties;
  hasError: boolean;
  errorMsg?: string;
  importing: boolean;
  onToggle: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        opacity: row.selected ? 1 : 0.4,
        background: hasError
          ? "rgba(255,123,114,0.08)"
          : hovered
          ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
          : row.isDuplicate
          ? "rgba(244,162,30,0.04)"
          : "transparent",
        transition: "background 0.1s",
        cursor: "pointer",
      }}
      onClick={() => onToggle(row.id)}
    >
      <td style={{ ...tdStyle, width: 36, textAlign: "center" }}>
        <input
          type="checkbox"
          checked={row.selected}
          onChange={() => onToggle(row.id)}
          style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td style={{ ...tdStyle, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>
        {row.rawDate}
      </td>
      <td
        style={{
          ...tdStyle,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "var(--ft-text)",
        }}
      >
        {row.description}
      </td>
      <td
        className="pnum"
        style={{
          ...tdStyle,
          textAlign: "right",
          color: row.type === "income" ? "var(--ft-green)" : "var(--ft-red)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {row.type === "income" ? "+" : "−"}{formatGbp(Math.abs(row.amount))}
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            padding: "1px 7px",
            fontWeight: 700,
            letterSpacing: "0.06em",
            background: row.type === "income" ? "rgba(86,211,100,0.12)" : "rgba(255,123,114,0.12)",
            color: row.type === "income" ? "var(--ft-green)" : "var(--ft-red)",
          }}
        >
          {row.type.toUpperCase()}
        </span>
      </td>
      <td style={{ ...tdStyle, color: "var(--ft-muted)" }}>
        {row.category}
      </td>
      <td style={{ ...tdStyle, textAlign: "center", fontSize: 9 }}>
        {hasError ? (
          <span
            title={errorMsg}
            style={{
              color: "var(--ft-red)",
              display: "flex",
              alignItems: "center",
              gap: 3,
              justifyContent: "center",
            }}
          >
            <X size={10} />
            ERROR
          </span>
        ) : importing && row.selected ? (
          <span style={{ color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>…</span>
        ) : row.isDuplicate ? (
          <span
            style={{
              color: "var(--ft-amber)",
              background: "rgba(244,162,30,0.15)",
              padding: "1px 6px",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            DUP
          </span>
        ) : (
          <span
            style={{
              color: "var(--ft-green)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: "0.06em",
            }}
          >
            READY
          </span>
        )}
      </td>
    </tr>
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

  const errorCount = Object.keys(importErrors).length;

  return (
    <div>
      <PageHeader
        icon={FileInput}
        title="Import"
        subtitle="Bulk-create transactions from a bank export (CSV, OFX, QIF)"
        actions={
          history.length > 0 ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Recent imports</div>
              {history.map((h, i) => (
                <HistoryEntryItem key={i} entry={h} />
              ))}
            </div>
          ) : undefined
        }
      />

      {/* Persona tip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const msgs: Record<string, string | null> = {
          market:  "Import broker trade confirmations and investment account CSVs to populate your Portfolio page with real cost-basis data.",
          budget:  "Export a CSV from your bank's online portal (typically under Statements or Download). Most UK banks support this natively.",
          wealth:  "Import both bank and investment account exports — complete transaction history unlocks accurate net worth history and FIRE projections.",
          social:  "Import your full bank statement to capture all shared expenses. The AI Categorize tool will auto-tag group-related transactions.",
          full:    null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--ft-muted)",
              border: "1px solid var(--ft-border)",
              borderLeft: `2px solid ${color}`,
              background: "var(--ft-surface)",
              padding: "8px 14px 8px 12px",
              marginBottom: 16,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              flexWrap: "wrap",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>TIP</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      <StepIndicator current={step} />

      {/* Import complete banner */}
      {importDone && (
        <div
          style={{
            background: errorCount === 0 ? "rgba(86,211,100,0.08)" : "rgba(244,162,30,0.08)",
            border: `1px solid ${errorCount === 0 ? "rgba(86,211,100,0.35)" : "rgba(244,162,30,0.35)"}`,
            borderLeft: `3px solid ${errorCount === 0 ? "var(--ft-green)" : "var(--ft-amber)"}`,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {errorCount === 0 ? (
            <CheckCircle2 size={16} color="var(--ft-green)" style={{ flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={16} color="var(--ft-amber)" style={{ flexShrink: 0 }} />
          )}
          <div
            style={{
              ...mono,
              fontSize: 13,
              fontWeight: 700,
              color: errorCount === 0 ? "var(--ft-green)" : "var(--ft-amber)",
              flex: 1,
            }}
          >
            {errorCount === 0
              ? `Import complete — `
              : ""}
            {errorCount === 0 ? (
              <><span className="pnum">{successCount}</span> transaction{successCount !== 1 ? "s" : ""} created</>
            ) : (
              <><span className="pnum">{successCount}</span> imported · <span className="pnum">{errorCount}</span> failed</>
            )}
          </div>
          <button
            onClick={() => {
              setCsvText("");
              setStep(1);
              setImportDone(false);
              setImportErrors({});
              setParsedRows([]);
            }}
            style={{ ...BTN_GHOST, fontSize: 9, padding: "5px 12px" }}
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
          onApplyPreset={(preset) => {
            const { colMap: newMap, amountFormat: newFmt } = applyPreset(preset, headers);
            setColMap((m) => ({ ...m, ...newMap }));
            setAmountFormat(newFmt);
          }}
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
