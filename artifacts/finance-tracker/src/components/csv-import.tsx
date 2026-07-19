import { useState, useRef, useCallback } from "react";
import { useImportCsv, useCreateTransaction, useListAccounts, getListTransactionsQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { applyAutoCategory } from "@/lib/auto-cat";

interface ParsedTx {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

function parseQIFDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mdy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseOFX(text: string): ParsedTx[] {
  const results: ParsedTx[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1];
    const get = (tag: string) => { const r = new RegExp(`<${tag}>([^<\r\n]+)`, "i").exec(block); return r ? r[1].trim() : ""; };
    const dtRaw = get("DTPOSTED");
    const amtRaw = get("TRNAMT");
    const name = get("NAME") || get("MEMO") || "Unknown";
    if (!dtRaw || !amtRaw) continue;
    const date = `${dtRaw.slice(0, 4)}-${dtRaw.slice(4, 6)}-${dtRaw.slice(6, 8)}`;
    const amount = parseFloat(amtRaw);
    if (isNaN(amount)) continue;
    results.push({ date, description: name, amount: Math.abs(amount), type: amount < 0 ? "expense" : "income" });
  }
  return results;
}

function parseQIF(text: string): ParsedTx[] {
  const results: ParsedTx[] = [];
  let cur: { date?: string; amount?: number; desc?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === "D") { cur.date = val; }
    else if (code === "T") { cur.amount = parseFloat(val.replace(/,/g, "")); }
    else if (code === "P") { cur.desc = val; }
    else if (code === "^") {
      if (cur.date && cur.amount !== undefined && !isNaN(cur.amount)) {
        const date = parseQIFDate(cur.date);
        if (date) {
          results.push({ date, description: cur.desc || "Unknown", amount: Math.abs(cur.amount), type: cur.amount < 0 ? "expense" : "income" });
        }
      }
      cur = {};
    }
  }
  return results;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PROVIDERS = [
  { id: "revolut", label: "Revolut" },
  { id: "maybank", label: "Maybank" },
] as const;

type Provider = (typeof PROVIDERS)[number]["id"];

export function CsvImportModal({ open, onClose, onSuccess }: Props) {
  const [provider, setProvider] = useState<Provider>("revolut");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<"csv" | "ofx" | "qif">("csv");
  const [ofxQifAccountId, setOfxQifAccountId] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsv = useImportCsv();
  const createTransaction = useCreateTransaction();
  const accounts = useListAccounts({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reset = useCallback(() => {
    setFile(null);
    setFileType("csv");
    setResult(null);
    setDragging(false);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  const detectAndSetFile = useCallback((f: File) => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".ofx")) { setFileType("ofx"); setFile(f); }
    else if (name.endsWith(".qif")) { setFileType("qif"); setFile(f); }
    else if (name.endsWith(".csv")) { setFileType("csv"); setFile(f); }
    else toast({ title: "Unsupported file type", description: "Use .csv, .ofx, or .qif", variant: "destructive" });
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) detectAndSetFile(dropped);
  }, [detectAndSetFile]);

  // Enrich CSV text: for each data row, if category column is empty, apply auto-cat rule
  const enrichCsvWithAutoCat = async (f: File): Promise<File> => {
    try {
      const text = await f.text();
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) return f;
      const header = lines[0].split(",");
      // Try to find description and category columns (case-insensitive)
      const descIdx = header.findIndex(h => /description|memo|name|merchant/i.test(h.trim()));
      const catIdx = header.findIndex(h => /categor/i.test(h.trim()));
      if (descIdx === -1) return f; // can't enrich without knowing description column
      const enriched = lines.map((line, i) => {
        if (i === 0) return line; // header row
        const cols = line.split(",");
        if (!cols[descIdx]) return line;
        const desc = cols[descIdx].replace(/^"|"$/g, "");
        const suggested = applyAutoCategory(desc);
        if (suggested && catIdx !== -1 && (!cols[catIdx] || cols[catIdx] === '""' || cols[catIdx] === "")) {
          const newCols = [...cols];
          newCols[catIdx] = suggested;
          return newCols.join(",");
        }
        return line;
      });
      const blob = new Blob([enriched.join("\n")], { type: "text/csv" });
      return new File([blob], f.name, { type: "text/csv" });
    } catch {
      return f; // on any error, fall back to original file
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    if (fileType === "ofx" || fileType === "qif") {
      const accountId = parseInt(ofxQifAccountId, 10);
      if (!accountId) { toast({ title: "Select an account first", variant: "destructive" }); return; }
      try {
        const text = await file.text();
        const txs = fileType === "ofx" ? parseOFX(text) : parseQIF(text);
        if (txs.length === 0) { toast({ title: "No transactions found in file", variant: "destructive" }); return; }
        let added = 0;
        const errors: string[] = [];
        for (const tx of txs) {
          try {
            const cat = applyAutoCategory(tx.description) ?? undefined;
            await createTransaction.mutateAsync({ data: { nativeAmount: tx.amount, currency: "GBP", type: tx.type, description: tx.description, category: cat ?? "", accountId, date: tx.date } });
            added++;
          } catch {
            errors.push(`Failed: ${tx.date} ${tx.description}`);
          }
        }
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setResult({ added, skipped: txs.length - added - errors.length, errors });
        onSuccess();
      } catch (err) {
        toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      }
      return;
    }

    try {
      const enrichedFile = await enrichCsvWithAutoCat(file);
      const res = await importCsv.mutateAsync({ data: { file: enrichedFile }, params: { provider, accountId: 0 } });
      setResult({ added: res.added, skipped: res.skipped, errors: res.errors ?? [] });
      queryClient.invalidateQueries();
      onSuccess();
    } catch (err) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const isPending = importCsv.isPending || createTransaction.isPending;

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        width: "100%", maxWidth: 480,
        fontFamily: "var(--font-mono)",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--ft-raised)",
          borderBottom: "1px solid var(--ft-border)",
          padding: "0 14px", height: 38,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-muted)",
        }}>
          <span><span style={{ color: "var(--ft-accent)" }}>·</span> Import CSV / OFX / QIF</span>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "var(--ft-dim)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 16 }}>
          {!result ? (
            <>
              {/* Provider selector — CSV only */}
              <div style={{ marginBottom: 14, display: fileType !== "csv" ? "none" : undefined }}>
                <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
                  Bank / Provider
                </div>
                <div style={{ display: "flex", gap: 0 }}>
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setProvider(p.id)}
                      style={{
                        flex: 1,
                        padding: "6px 0",
                        fontSize: 11, fontFamily: "var(--font-mono)",
                        background: provider === p.id ? "var(--ft-accent)" : "var(--ft-raised)",
                        border: `1px solid ${provider === p.id ? "var(--ft-accent)" : "var(--ft-border)"}`,
                        color: provider === p.id ? "var(--ft-base)" : "var(--ft-muted)",
                        cursor: "pointer", fontWeight: 600,
                        marginLeft: p.id !== "revolut" ? -1 : 0,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? "var(--ft-accent)" : file ? "var(--ft-green)" : "var(--ft-border2)"}`,
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: dragging ? "rgba(244,162,30,0.04)" : "var(--ft-raised)",
                  transition: "all 0.15s",
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 8, color: file ? "var(--ft-green)" : "var(--ft-dim)" }}>
                  {file ? "✓" : "↑"}
                </div>
                <div style={{ fontSize: 11, color: file ? "var(--ft-green)" : "var(--ft-muted)", marginBottom: 4 }}>
                  {file ? file.name : "Drop .csv file here or click to browse"}
                </div>
                <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {file ? `${(file.size / 1024).toFixed(1)} KB · ${fileType.toUpperCase()}` : "CSV · OFX · QIF"}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.ofx,.qif"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) detectAndSetFile(f); }}
                />
              </div>

              {/* OFX/QIF account selector */}
              {(fileType === "ofx" || fileType === "qif") && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 6 }}>
                    Import into account
                  </div>
                  <select
                    value={ofxQifAccountId}
                    onChange={e => setOfxQifAccountId(e.target.value)}
                    style={{
                      width: "100%", background: "var(--ft-raised)", border: "1px solid var(--ft-border)",
                      color: "var(--ft-text)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "6px 10px",
                      cursor: "pointer", outline: "none",
                    }}
                  >
                    <option value="">— select account —</option>
                    {(accounts.data ?? []).map(a => (
                      <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Format hint */}
              <div style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", marginBottom: 14, lineHeight: 1.6 }}>
                {fileType === "ofx"
                  ? "OFX/QFX: exported from most banks and accounting tools. Transactions imported directly."
                  : fileType === "qif"
                  ? "QIF: Quicken Interchange Format. Supported by most banking software."
                  : provider === "revolut"
                  ? "Export from Revolut app → Accounts → Statement → CSV. Includes all transaction types."
                  : "Export from Maybank2u → Transaction History → Download as CSV."}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={handleClose}
                  style={{
                    background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)",
                    fontSize: 10, fontFamily: "var(--font-mono)", padding: "6px 14px", cursor: "pointer",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || isPending}
                  style={{
                    background: file && !isPending ? "var(--ft-accent)" : "var(--ft-border)",
                    border: "none",
                    color: file && !isPending ? "var(--ft-base)" : "var(--ft-dim)",
                    fontSize: 10, fontFamily: "var(--font-mono)", padding: "6px 18px",
                    cursor: file && !isPending ? "pointer" : "not-allowed",
                    fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                    transition: "all 0.1s",
                  }}
                >
                  {isPending ? "Importing…" : "Import"}
                </button>
              </div>
            </>
          ) : (
            /* Result screen */
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10, color: result.added > 0 ? "var(--ft-green)" : "var(--ft-amber)" }}>
                {result.added > 0 ? "✓" : "○"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-text)", marginBottom: 16 }}>
                Import complete
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {[
                  { label: "Added", value: result.added, color: "var(--ft-green)" },
                  { label: "Skipped", value: result.skipped, color: "var(--ft-dim)" },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--ft-raised)", padding: "10px", border: "1px solid var(--ft-border)" }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid var(--ft-red)", padding: 10, marginBottom: 14, textAlign: "left" }}>
                  <div style={{ fontSize: 9, color: "var(--ft-red)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Errors</div>
                  {result.errors.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontSize: 10, color: "var(--ft-muted)", marginBottom: 2 }}>· {e}</div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  onClick={() => { reset(); }}
                  style={{
                    background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-muted)",
                    fontSize: 10, fontFamily: "var(--font-mono)", padding: "6px 14px", cursor: "pointer",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}
                >
                  Import Another
                </button>
                <button
                  onClick={handleClose}
                  style={{
                    background: "var(--ft-accent)", border: "none", color: "var(--ft-base)",
                    fontSize: 10, fontFamily: "var(--font-mono)", padding: "6px 18px",
                    cursor: "pointer", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
