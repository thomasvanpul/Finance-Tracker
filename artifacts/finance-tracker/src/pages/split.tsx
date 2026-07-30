import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PersonaQuickStart } from "@/components/persona-quick-start";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import {
  useCreateTransaction,
  useCreateDebt,
  getListTransactionsQueryKey,
  getGetDashboardQueryKey,
  getGetTransactionSummaryQueryKey,
  getListDebtsQueryKey,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Trash2,
  Check,
  X,
  SplitSquareHorizontal,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Settings2,
  ChevronLeft,
  Camera,
} from "lucide-react";

// ─── Data model ───────────────────────────────────────────────────────────────

interface SplitGroup {
  id: string;
  name: string;
  members: string[];
  createdAt: string;
  settled: boolean;
}

interface ReceiptLineItem {
  name: string;
  price: number;
}

interface ReceiptSplitSuggestion {
  label: string;
  description: string;
  shares: Record<string, number>;
}

interface ReceiptSplitAnalysis {
  items: ReceiptLineItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  suggestions: ReceiptSplitSuggestion[];
}

interface SplitExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitType: "equal" | "custom" | "percentage";
  shares: Record<string, number>;
  date: string;
  category: string;
  addedToMyTransactions: boolean;
  receiptImage?: string;
  receiptMimeType?: string;
  receiptScanData?: ReceiptSplitAnalysis;
}

interface BillSplitData {
  groups: SplitGroup[];
  expenses: SplitExpense[];
}

interface Transfer {
  from: string;
  to: string;
  amount: number;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_DATA = "ft-bill-splits";
const LS_MY_NAME = "ft-split-my-name";

function loadData(): BillSplitData {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) return JSON.parse(raw) as BillSplitData;
  } catch {}
  return { groups: [], expenses: [] };
}

function saveData(data: BillSplitData): void {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(data));
  } catch {}
}

function loadMyName(): string {
  return localStorage.getItem(LS_MY_NAME) ?? "";
}

function saveMyName(name: string): void {
  localStorage.setItem(LS_MY_NAME, name);
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// ─── Balance + settle-up algorithm ───────────────────────────────────────────

function computeBalances(
  members: string[],
  expenses: SplitExpense[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of members) balances[m] = 0;

  for (const exp of expenses) {
    // The payer gets credited the full amount
    if (balances[exp.paidBy] !== undefined) {
      balances[exp.paidBy] += exp.amount;
    }
    // Each member is debited their share
    for (const [member, share] of Object.entries(exp.shares)) {
      if (balances[member] !== undefined) {
        balances[member] -= share;
      }
    }
  }
  return balances;
}

function minimumTransfers(balances: Record<string, number>): Transfer[] {
  const transfers: Transfer[] = [];
  // Work on a mutable copy, rounded to 2dp
  const pos: Array<{ name: string; amount: number }> = [];
  const neg: Array<{ name: string; amount: number }> = [];

  for (const [name, bal] of Object.entries(balances)) {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.005) pos.push({ name, amount: rounded });
    else if (rounded < -0.005) neg.push({ name, amount: rounded });
  }

  // Sort descending by absolute amount
  pos.sort((a, b) => b.amount - a.amount);
  neg.sort((a, b) => a.amount - b.amount);

  let pi = 0;
  let ni = 0;
  while (pi < pos.length && ni < neg.length) {
    const creditor = pos[pi];
    const debtor = neg[ni];
    const transfer = Math.min(creditor.amount, Math.abs(debtor.amount));
    if (transfer > 0.005) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    creditor.amount -= transfer;
    debtor.amount += transfer;
    if (Math.abs(creditor.amount) < 0.005) pi++;
    if (Math.abs(debtor.amount) < 0.005) ni++;
  }

  return transfers;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const MEMBER_COLORS = [
  { bg: "rgba(96,165,250,0.15)", color: "#60A5FA" },
  { bg: "rgba(74,222,128,0.15)", color: "#4ADE80" },
  { bg: "rgba(244,162,30,0.15)", color: "#F4A21E" },
  { bg: "rgba(34,211,238,0.15)", color: "#22D3EE" },
  { bg: "rgba(248,113,113,0.15)", color: "#F87171" },
  { bg: "rgba(167,139,250,0.15)", color: "#A78BFA" },
  { bg: "rgba(251,191,36,0.15)", color: "#FBBF24" },
  { bg: "rgba(52,211,153,0.15)", color: "#34D399" },
];

function memberColor(index: number): { bg: string; color: string } {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function memberIndex(members: string[], name: string): number {
  return members.indexOf(name);
}

const CATEGORIES = [
  "Food & Drink",
  "Accommodation",
  "Transport",
  "Activities",
  "Shopping",
  "Groceries",
  "Utilities",
  "Entertainment",
  "Travel",
  "Other",
];

// ─── Shared style constants ────────────────────────────────────────────────────

const INPUT_S: React.CSSProperties = {
  background: "var(--ft-base)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  height: 30,
  fontSize: 12,
  padding: "0 8px",
  borderRadius: 2,
  outline: "none",
  width: "100%",
};

const LABEL_S: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--ft-dim)",
  marginBottom: 4,
  display: "block",
};

// ─── MemberAvatar ─────────────────────────────────────────────────────────────

function MemberAvatar({
  name,
  members,
  size = 24,
}: {
  name: string;
  members: string[];
  size?: number;
}) {
  const idx = memberIndex(members, name);
  const col = memberColor(idx >= 0 ? idx : 0);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: col.bg,
        color: col.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
        border: `1px solid ${col.color}33`,
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ─── Receipt utilities ────────────────────────────────────────────────────────

function compressImage(file: File, maxPx = 1400): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── ReceiptUploadZone ────────────────────────────────────────────────────────

function ReceiptUploadZone({
  receiptImage,
  onUpload,
  onClear,
}: {
  receiptImage?: string;
  onUpload: (base64: string, mimeType: string) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const { base64, mimeType } = await compressImage(file);
    onUpload(base64, mimeType);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (receiptImage) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <img
          src={`data:image/jpeg;base64,${receiptImage}`}
          alt="Receipt"
          style={{ width: 80, height: 80, objectFit: "cover", border: "1px solid var(--ft-border2)", borderRadius: 2, cursor: "pointer", flexShrink: 0 }}
          onClick={() => window.open(`data:image/jpeg;base64,${receiptImage}`, "_blank")}
          title="Click to view full receipt"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)" }}>✓ Receipt attached</span>
          <button
            onClick={onClear}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", background: "transparent", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", cursor: "pointer" }}
          >
            Remove
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", background: "transparent", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", cursor: "pointer" }}
          >
            Replace
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${dragging ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        background: dragging ? "rgba(96,165,250,0.04)" : "transparent",
        padding: "12px 16px",
        textAlign: "center",
        cursor: "pointer",
        borderRadius: 2,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.05em" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 5 }}><path d="M1 3.5A1.5 1.5 0 012.5 2h.5l.75-1h3.5L8 2h.5A1.5 1.5 0 0110 3.5v5A1.5 1.5 0 018.5 10h-5A1.5 1.5 0 012 8.5v-5z"/><circle cx="6" cy="6" r="1.5"/></svg>Drop receipt photo here or click to upload
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-raised)", marginTop: 4 }}>
        JPEG · PNG · WEBP
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ─── ReceiptAnalysisPanel ─────────────────────────────────────────────────────

function ReceiptAnalysisPanel({
  receiptImage,
  receiptMimeType,
  members,
  onApply,
}: {
  receiptImage: string;
  receiptMimeType: string;
  members: string[];
  onApply: (amount: number, shares: Record<string, number>, splitType: "custom", analysis: ReceiptSplitAnalysis) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysis, setAnalysis] = useState<ReceiptSplitAnalysis | null>(null);
  const [error, setError] = useState("");
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

  async function analyze() {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/ai/receipt-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: receiptImage, mimeType: receiptMimeType, members }),
      });
      if (!res.ok) {
        const j = await res.json() as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as ReceiptSplitAnalysis;
      setAnalysis(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }

  if (status === "idle") {
    return (
      <button
        onClick={analyze}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 10,
          letterSpacing: "0.06em", textTransform: "uppercase",
          background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.3)",
          color: "#A78BFA", cursor: "pointer", borderRadius: 2,
        }}
      >
        ✦ Scan Receipt with AI
      </button>
    );
  }

  if (status === "loading") {
    return (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "6px 0" }}>
        Analysing receipt…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)" }}>
          Error: {error}
        </span>
        <button onClick={analyze} style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 8px", background: "transparent", border: "1px solid var(--ft-border2)", color: "var(--ft-dim)", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div style={{ background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 2, padding: "10px 12px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#A78BFA", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
        ✦ Receipt Analysis
      </div>

      {/* Line items */}
      {analysis.items.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Items found</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {analysis.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--ft-muted)" }}>{item.name}</span>
                <span style={{ color: "var(--ft-text)" }}>£{item.price.toFixed(2)}</span>
              </div>
            ))}
            {(analysis.tax > 0 || analysis.tip > 0) && (
              <>
                {analysis.tax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
                    <span>Tax</span><span>£{analysis.tax.toFixed(2)}</span>
                  </div>
                )}
                {analysis.tip > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
                    <span>Tip / Service</span><span>£{analysis.tip.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, borderTop: "1px solid var(--ft-border)", paddingTop: 4, marginTop: 2 }}>
              <span style={{ color: "var(--ft-text)" }}>Total</span>
              <span style={{ color: "var(--ft-text)" }}>£{analysis.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Split suggestions */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        Split suggestions
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {analysis.suggestions.map((sug, i) => (
          <div key={i} style={{
            border: `1px solid ${appliedIdx === i ? "rgba(167,139,250,0.5)" : "var(--ft-border2)"}`,
            background: appliedIdx === i ? "rgba(167,139,250,0.08)" : "var(--ft-base)",
            padding: "8px 10px", borderRadius: 2,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: appliedIdx === i ? "#A78BFA" : "var(--ft-text)" }}>
                  {sug.label}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginLeft: 6 }}>
                  {sug.description}
                </span>
              </div>
              <button
                onClick={() => { onApply(analysis.total, sug.shares, "custom", analysis); setAppliedIdx(i); }}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em",
                  padding: "2px 9px", background: appliedIdx === i ? "rgba(167,139,250,0.2)" : "var(--ft-raised)",
                  border: `1px solid ${appliedIdx === i ? "rgba(167,139,250,0.4)" : "var(--ft-border2)"}`,
                  color: appliedIdx === i ? "#A78BFA" : "var(--ft-muted)", cursor: "pointer", borderRadius: 2,
                }}
              >
                {appliedIdx === i ? "✓ Applied" : "Apply"}
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {Object.entries(sug.shares).map(([member, share]) => {
                const mi = memberIndex(members, member);
                const col = memberColor(mi >= 0 ? mi : 0);
                return (
                  <div key={member} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", background: col.bg, borderRadius: 2, fontSize: 9, fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: col.color, fontWeight: 700 }}>{member}</span>
                    <span style={{ color: col.color }}>£{(share ?? 0).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ReceiptViewerModal ───────────────────────────────────────────────────────

function ReceiptViewerModal({
  imageBase64,
  scanData,
  onClose,
}: {
  imageBase64: string;
  scanData?: ReceiptSplitAnalysis;
  onClose: () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ display: "flex", gap: 16, maxWidth: "92vw", maxHeight: "90vh", alignItems: "flex-start" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Receipt image */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img
            src={`data:image/jpeg;base64,${imageBase64}`}
            alt="Receipt"
            style={{ maxHeight: "88vh", maxWidth: scanData ? "55vw" : "90vw", objectFit: "contain", display: "block", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ✕
          </button>
        </div>

        {/* Scan data panel */}
        {scanData && (
          <div
            style={{
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border)",
              borderTop: "2px solid #A78BFA",
              padding: "12px 14px",
              minWidth: 220,
              maxWidth: 300,
              maxHeight: "88vh",
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#A78BFA", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              ✦ Receipt Items
            </div>

            {scanData.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                {scanData.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--ft-muted)", flex: 1 }}>{item.name}</span>
                    <span style={{ color: "var(--ft-text)", flexShrink: 0 }}>£{item.price.toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 5, marginTop: 3 }}>
                  {scanData.tax > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginBottom: 2 }}>
                      <span>Tax</span><span>£{scanData.tax.toFixed(2)}</span>
                    </div>
                  )}
                  {scanData.tip > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", marginBottom: 2 }}>
                      <span>Tip / Service</span><span>£{scanData.tip.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ft-text)" }}>
                    <span>Total</span><span>£{scanData.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Split suggestions
            </div>
            {scanData.suggestions.map((sug, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--ft-text)", marginBottom: 3 }}>{sug.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {Object.entries(sug.shares).map(([member, share]) => (
                    <div key={member} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                      <span style={{ color: "var(--ft-muted)" }}>{member}</span>
                      <span style={{ color: "var(--ft-text)" }}>£{(share ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AddGroupPanel ────────────────────────────────────────────────────────────

interface AddGroupPanelProps {
  onAdd: (group: SplitGroup) => void;
  onCancel: () => void;
}

function AddGroupPanel({ onAdd, onCancel }: AddGroupPanelProps) {
  const [name, setName] = useState("");
  const [membersRaw, setMembersRaw] = useState("");
  const myName = loadMyName();
  const [members, setMembers] = useState<string[]>(() => myName ? [myName] : []);
  const [newMember, setNewMember] = useState("");

  function parseMembersRaw() {
    const parsed = membersRaw
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      setMembers((prev) => {
        const combined = [...prev];
        for (const m of parsed) {
          if (!combined.includes(m)) combined.push(m);
        }
        return combined;
      });
      setMembersRaw("");
    }
  }

  function addOne() {
    const trimmed = newMember.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers((prev) => [...prev, trimmed]);
    }
    setNewMember("");
  }

  function removeMember(m: string) {
    setMembers((prev) => prev.filter((x) => x !== m));
  }

  function handleAdd() {
    if (!name.trim() || members.length < 2) return;
    const group: SplitGroup = {
      id: genId(),
      name: name.trim(),
      members,
      createdAt: new Date().toISOString(),
      settled: false,
    };
    onAdd(group);
  }

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        borderLeft: "3px solid var(--ft-accent)",
        padding: "14px 16px",
        borderRadius: 2,
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ft-accent)",
          marginBottom: 12,
        }}
      >
        New Group
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Group Name</label>
        <input
          style={INPUT_S}
          placeholder='e.g. "Holiday Portugal 2026"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Add Members (comma-separated)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...INPUT_S, flex: 1 }}
            placeholder='e.g. "Thomas, Alice, Bob"'
            value={membersRaw}
            onChange={(e) => setMembersRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                parseMembersRaw();
              }
            }}
          />
          <button
            onClick={parseMembersRaw}
            style={{
              padding: "0 10px",
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border2)",
              color: "var(--ft-muted)",
              fontSize: 11,
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Or add one at a time</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...INPUT_S, flex: 1 }}
            placeholder="Person name"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOne();
              }
            }}
          />
          <button
            onClick={addOne}
            style={{
              padding: "0 10px",
              background: "rgba(96,165,250,0.12)",
              border: "1px solid rgba(96,165,250,0.25)",
              color: "var(--ft-blue)",
              fontSize: 11,
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {members.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
          {members.map((m, i) => {
            const col = memberColor(i);
            const isYou = m === myName && i === 0 && myName !== "";
            return (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px 2px 6px",
                  background: col.bg,
                  border: `1px solid ${isYou ? col.color : col.color + "33"}`,
                  borderRadius: 2,
                  fontSize: 11,
                  color: col.color,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: col.color,
                    color: "var(--ft-base)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </span>
                {m}
                {isYou && (
                  <span style={{ fontSize: 8, opacity: 0.7, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>you</span>
                )}
                {!isYou && (
                  <button
                    onClick={() => removeMember(m)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: col.color, opacity: 0.7, display: "flex" }}
                  >
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {members.length < 2 && (
        <div
          style={{
            fontSize: 10,
            color: "var(--ft-dim)",
            fontFamily: "var(--font-mono)",
            marginBottom: 10,
          }}
        >
          Add at least 2 members to create a group.
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleAdd}
          disabled={!name.trim() || members.length < 2}
          style={{
            padding: "5px 14px",
            background: !name.trim() || members.length < 2 ? "var(--ft-raised)" : "var(--ft-blue)",
            color: !name.trim() || members.length < 2 ? "var(--ft-dim)" : "#fff",
            border: "none",
            borderRadius: 2,
            fontSize: 12,
            cursor: !name.trim() || members.length < 2 ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          Create Group
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "var(--ft-dim)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── AddExpenseForm ───────────────────────────────────────────────────────────

interface AddExpenseFormProps {
  group: SplitGroup;
  onAdd: (expense: SplitExpense) => void;
  onCancel: () => void;
}

function AddExpenseForm({ group, onAdd, onCancel }: AddExpenseFormProps) {
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [paidBy, setPaidBy] = useState(group.members[0] ?? "");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState("Other");
  const [splitType, setSplitType] = useState<"equal" | "custom" | "percentage">("equal");
  const [customShares, setCustomShares] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of group.members) init[m] = "";
    return init;
  });
  const [receiptImage, setReceiptImage] = useState<string | undefined>();
  const [receiptMimeType, setReceiptMimeType] = useState("image/jpeg");
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [receiptScanData, setReceiptScanData] = useState<ReceiptSplitAnalysis | undefined>();

  const amount = parseFloat(amountStr) || 0;
  const count = group.members.length;
  const equalShare = count > 0 ? amount / count : 0;

  function computedShares(): Record<string, number> {
    const shares: Record<string, number> = {};
    if (splitType === "equal") {
      for (const m of group.members) shares[m] = equalShare;
    } else if (splitType === "custom") {
      for (const m of group.members) {
        shares[m] = parseFloat(customShares[m] ?? "") || 0;
      }
    } else {
      // percentage
      const totalPct = group.members.reduce(
        (s, m) => s + (parseFloat(customShares[m] ?? "") || 0),
        0
      );
      for (const m of group.members) {
        const pct = parseFloat(customShares[m] ?? "") || 0;
        shares[m] = totalPct > 0 ? (pct / totalPct) * amount : 0;
      }
    }
    return shares;
  }

  const shares = computedShares();
  const sharesSum = Object.values(shares).reduce((s, v) => s + v, 0);
  const isBalanced =
    splitType === "equal" ||
    Math.abs(sharesSum - amount) < 0.005;

  function handleApplyAnalysis(total: number, aiShares: Record<string, number>, type: "custom", analysis: ReceiptSplitAnalysis) {
    setAmountStr(total.toFixed(2));
    setSplitType(type);
    const next: Record<string, string> = {};
    for (const m of group.members) next[m] = (aiShares[m] ?? 0).toFixed(2);
    setCustomShares(next);
    setReceiptScanData(analysis);
  }

  function handleAdd() {
    if (!description.trim() || amount <= 0 || !paidBy || !isBalanced) return;
    const expense: SplitExpense = {
      id: genId(),
      groupId: group.id,
      description: description.trim(),
      amount,
      paidBy,
      splitType,
      shares: computedShares(),
      date,
      category,
      addedToMyTransactions: false,
      receiptImage,
      receiptMimeType: receiptImage ? receiptMimeType : undefined,
      receiptScanData: receiptImage ? receiptScanData : undefined,
    };
    onAdd(expense);
  }

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border2)",
        borderTop: "2px solid var(--ft-accent)",
        padding: "14px 16px",
        borderRadius: 2,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ft-accent)",
          marginBottom: 12,
        }}
      >
        Add Expense
      </div>

      <div className="ft-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LABEL_S}>Description</label>
          <input
            style={INPUT_S}
            placeholder="Dinner, hotel, tickets…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label style={LABEL_S}>Total Amount (£)</label>
          <input
            style={INPUT_S}
            type="number"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL_S}>Paid By</label>
          <select
            style={{ ...INPUT_S }}
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          >
            {group.members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={LABEL_S}>Date</label>
          <input
            style={INPUT_S}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label style={LABEL_S}>Category</label>
          <select
            style={{ ...INPUT_S }}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Split type picker */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Split Type</label>
        <div style={{ display: "flex", gap: 5 }}>
          {(["equal", "custom", "percentage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSplitType(t)}
              style={{
                padding: "3px 10px",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: 2,
                border: `1px solid ${splitType === t ? "rgba(96,165,250,0.5)" : "var(--ft-border2)"}`,
                background: splitType === t ? "rgba(96,165,250,0.12)" : "var(--ft-base)",
                color: splitType === t ? "var(--ft-blue)" : "var(--ft-dim)",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Per-member share inputs */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>
          {splitType === "equal"
            ? "Equal shares"
            : splitType === "percentage"
            ? "Percentages (%)"
            : "Custom amounts (£)"}
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {group.members.map((m, i) => {
            const col = memberColor(i);
            const displayVal =
              splitType === "equal"
                ? equalShare.toFixed(2)
                : customShares[m] ?? "";

            return (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: col.bg,
                    color: col.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--ft-text)",
                    minWidth: 50,
                    maxWidth: 90,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flexShrink: 1,
                  }}
                >
                  {m}
                </span>
                {splitType === "equal" ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-green)",
                    }}
                  >
                    £{displayVal}
                  </span>
                ) : (
                  <input
                    style={{ ...INPUT_S, minWidth: 72, width: 90, flex: "0 0 auto" }}
                    type="number"
                    placeholder={splitType === "percentage" ? "%" : "0.00"}
                    value={displayVal}
                    onChange={(e) =>
                      setCustomShares((prev) => ({ ...prev, [m]: e.target.value }))
                    }
                  />
                )}
                {splitType !== "equal" && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-dim)",
                    }}
                  >
                    {splitType === "percentage"
                      ? `= £${shares[m]?.toFixed(2) ?? "0.00"}`
                      : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {splitType !== "equal" && amount > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "5px 10px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              borderRadius: 2,
              background: isBalanced
                ? "rgba(74,222,128,0.06)"
                : "rgba(248,113,113,0.06)",
              border: `1px solid ${isBalanced ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}`,
              color: isBalanced ? "var(--ft-green)" : "var(--ft-red)",
            }}
          >
            {isBalanced
              ? `✓ Balanced — £${sharesSum.toFixed(2)} of £${amount.toFixed(2)}`
              : `Remaining: £${(amount - sharesSum).toFixed(2)}`}
          </div>
        )}
      </div>

      {/* Receipt upload */}
      <div style={{ marginBottom: 10 }}>
        <label style={LABEL_S}>Receipt Photo (optional)</label>
        <ReceiptUploadZone
          receiptImage={receiptImage}
          onUpload={(b64, mime) => { setReceiptImage(b64); setReceiptMimeType(mime); setShowAnalysis(true); }}
          onClear={() => { setReceiptImage(undefined); setShowAnalysis(false); }}
        />
      </div>

      {/* AI analysis panel */}
      {receiptImage && showAnalysis && (
        <div style={{ marginBottom: 10 }}>
          <ReceiptAnalysisPanel
            receiptImage={receiptImage}
            receiptMimeType={receiptMimeType}
            members={group.members}
            onApply={handleApplyAnalysis}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={handleAdd}
          disabled={!description.trim() || amount <= 0 || !isBalanced}
          style={{
            padding: "5px 14px",
            background:
              !description.trim() || amount <= 0 || !isBalanced
                ? "var(--ft-raised)"
                : "var(--ft-blue)",
            color:
              !description.trim() || amount <= 0 || !isBalanced
                ? "var(--ft-dim)"
                : "#fff",
            border: "none",
            borderRadius: 2,
            fontSize: 12,
            cursor:
              !description.trim() || amount <= 0 || !isBalanced
                ? "not-allowed"
                : "pointer",
            fontWeight: 600,
          }}
        >
          Add Expense
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "5px 12px",
            background: "transparent",
            color: "var(--ft-dim)",
            border: "1px solid var(--ft-border2)",
            borderRadius: 2,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── GroupCard (left panel item) ──────────────────────────────────────────────

interface GroupCardProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function GroupCard({ group, expenses, myName, isActive, onClick, onDelete }: GroupCardProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hovered, setHovered] = useState(false);
  const groupExpenses = expenses.filter((e) => e.groupId === group.id);
  const total = groupExpenses.reduce((s, e) => s + e.amount, 0);
  const balances = computeBalances(group.members, groupExpenses);
  const myBalance = myName && balances[myName] !== undefined ? balances[myName] : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isActive ? "var(--ft-raised)" : hovered ? "var(--ft-raised)" : "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderLeft: isActive
          ? "3px solid var(--ft-accent)"
          : group.settled
          ? "3px solid var(--ft-border2)"
          : "3px solid var(--ft-blue)",
        borderRadius: 2,
        padding: "10px 12px",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.12s",
        opacity: group.settled ? 0.65 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ft-text)",
              marginBottom: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {group.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", gap: -4 }}>
              {group.members.slice(0, 5).map((m, i) => (
                <div
                  key={m}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: memberColor(i).bg,
                    color: memberColor(i).color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    border: "1px solid var(--ft-base)",
                    marginLeft: i === 0 ? 0 : -4,
                  }}
                >
                  {m[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
              {group.members.length} members
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="pnum" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ft-muted)" }}>
              {formatGbp(total)}
            </span>
            <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              {groupExpenses.length} expense{groupExpenses.length !== 1 ? "s" : ""}
            </span>
          </div>
          {myBalance !== null && (
            <div style={{ marginTop: 4 }}>
              <span
                className="pnum"
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: myBalance > 0.005 ? "var(--ft-green)" : myBalance < -0.005 ? "var(--ft-red)" : "var(--ft-dim)",
                }}
              >
                {myBalance > 0.005
                  ? `+${formatGbp(myBalance)} net`
                  : myBalance < -0.005
                  ? `${formatGbp(myBalance)} net`
                  : "settled up"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {group.settled && (
            <span
              style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "1px 5px",
                borderRadius: 2,
                background: "rgba(74,222,128,0.08)",
                color: "var(--ft-green)",
                border: "1px solid rgba(74,222,128,0.15)",
              }}
            >
              Settled
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (deleteConfirm) { onDelete(); }
              else { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 3000); }
            }}
            style={{
              background: deleteConfirm ? "var(--ft-red)" : "none",
              border: "none",
              cursor: "pointer",
              color: deleteConfirm ? "#fff" : "var(--ft-dim)",
              padding: deleteConfirm ? "2px 5px" : 2,
              display: "flex",
              alignItems: "center",
              borderRadius: 2,
              fontSize: deleteConfirm ? 8 : undefined,
              fontFamily: deleteConfirm ? "var(--font-mono)" : undefined,
              fontWeight: deleteConfirm ? 700 : undefined,
              opacity: deleteConfirm ? 1 : 0.6,
            }}
            title={deleteConfirm ? "Click again to confirm delete" : "Delete group"}
          >
            {deleteConfirm ? "DEL?" : <Trash2 style={{ width: 12, height: 12 }} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense: SplitExpense;
  members: string[];
  myName: string;
  onAddToTransactions: () => void;
  onDelete: () => void;
}

function ExpenseRow({ expense, members, myName, onAddToTransactions, onDelete }: ExpenseRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hovered, setHovered] = useState(false);
  const myShare = myName ? expense.shares[myName] : undefined;
  const paidByIdx = memberIndex(members, expense.paidBy);
  const paidByCol = memberColor(paidByIdx >= 0 ? paidByIdx : 0);

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: `1px solid ${hovered ? "var(--ft-border2)" : "var(--ft-border)"}`,
        borderRadius: 2,
        overflow: "hidden",
        transition: "border-color 0.12s",
      }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: hovered ? "rgba(255,255,255,0.02)" : "transparent",
          transition: "background 0.12s",
          padding: "8px 12px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={{ flexShrink: 0, color: "var(--ft-dim)" }}>
          {expanded ? (
            <ChevronDown style={{ width: 12, height: 12 }} />
          ) : (
            <ChevronRight style={{ width: 12, height: 12 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {expense.description}
            </span>
            <span
              style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "1px 5px",
                borderRadius: 2,
                background: "rgba(74,222,128,0.06)",
                color: "var(--ft-dim)",
                border: "1px solid var(--ft-border2)",
              }}
            >
              {expense.category}
            </span>
            {expense.receiptImage && (
              <button
                onClick={(e) => { e.stopPropagation(); setViewingReceipt(true); }}
                title="View receipt"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--ft-dim)",
                  display: "flex",
                  alignItems: "center",
                  opacity: 0.7,
                }}
              >
                <Camera style={{ width: 11, height: 11 }} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
              {formatDateShort(expense.date)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <MemberAvatar name={expense.paidBy} members={members} size={14} />
              <span style={{ fontSize: 9, color: paidByCol.color, fontFamily: "var(--font-mono)" }}>
                paid by {expense.paidBy}
              </span>
            </div>
          </div>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div
            className="pnum"
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: "var(--ft-text)",
            }}
          >
            {formatGbp(expense.amount)}
          </div>
          {myShare !== undefined && (
            <div className="pnum" style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>
              your share {formatGbp(myShare)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 4, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {myShare !== undefined && myShare > 0 && (
            <button
              onClick={onAddToTransactions}
              title={
                expense.addedToMyTransactions
                  ? "Added to transactions"
                  : "Add my share to transactions"
              }
              style={{
                padding: "2px 7px",
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRadius: 2,
                border: expense.addedToMyTransactions
                  ? "1px solid rgba(74,222,128,0.3)"
                  : "1px solid rgba(96,165,250,0.3)",
                background: expense.addedToMyTransactions
                  ? "rgba(74,222,128,0.08)"
                  : "rgba(96,165,250,0.08)",
                color: expense.addedToMyTransactions
                  ? "var(--ft-green)"
                  : "var(--ft-blue)",
                cursor: expense.addedToMyTransactions ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
              disabled={expense.addedToMyTransactions}
            >
              {expense.addedToMyTransactions ? (
                <>
                  <Check style={{ width: 9, height: 9 }} /> Logged
                </>
              ) : (
                <>+ Log</>
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (deleteConfirm) { onDelete(); }
              else { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 3000); }
            }}
            style={{
              background: deleteConfirm ? "var(--ft-red)" : "none",
              border: "none",
              cursor: "pointer",
              color: deleteConfirm ? "#fff" : "var(--ft-dim)",
              padding: deleteConfirm ? "2px 5px" : 2,
              display: "flex",
              alignItems: "center",
              borderRadius: 2,
              fontSize: deleteConfirm ? 8 : undefined,
              fontFamily: deleteConfirm ? "var(--font-mono)" : undefined,
              fontWeight: deleteConfirm ? 700 : undefined,
              opacity: deleteConfirm ? 1 : 0.6,
            }}
            title={deleteConfirm ? "Click again to confirm delete" : "Delete expense"}
          >
            {deleteConfirm ? "DEL?" : <Trash2 style={{ width: 11, height: 11 }} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            padding: "8px 12px 10px 36px",
            borderTop: "1px solid var(--ft-border)",
            background: "var(--ft-base)",
          }}
        >
          <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Split breakdown · {expense.splitType}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {Object.entries(expense.shares).map(([member, share]) => {
              const mi = memberIndex(members, member);
              const col = memberColor(mi >= 0 ? mi : 0);
              const isMe = member === myName;
              return (
                <div
                  key={member}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    background: col.bg,
                    border: `1px solid ${col.color}33`,
                    borderRadius: 2,
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: col.color, fontWeight: 700 }}>{member}</span>
                  {isMe && (
                    <span style={{ fontSize: 8, color: col.color, opacity: 0.7 }}>(you)</span>
                  )}
                  <span
                    className="pnum"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--ft-text)",
                      fontWeight: 600,
                    }}
                  >
                    {formatGbp(share)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {viewingReceipt && expense.receiptImage && (
        <ReceiptViewerModal
          imageBase64={expense.receiptImage}
          scanData={expense.receiptScanData}
          onClose={() => setViewingReceipt(false)}
        />
      )}
    </div>
  );
}

// ─── SettleUpPanel ────────────────────────────────────────────────────────────

interface SettleUpPanelProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
  onMarkGroupSettled: () => void;
}

function SettleUpPanel({ group, expenses, myName, onMarkGroupSettled }: SettleUpPanelProps) {
  const [settledTransfers, setSettledTransfers] = useState<Set<number>>(new Set());
  const [pushedToDebts, setPushedToDebts] = useState<Set<number>>(new Set());
  const [pushingIdx, setPushingIdx] = useState<number | null>(null);

  const createDebt = useCreateDebt();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const balances = computeBalances(group.members, expenses);
  const transfers = minimumTransfers(balances);

  function toggleTransfer(i: number) {
    setSettledTransfers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function pushTransferToDebts(t: Transfer, i: number) {
    if (!myName || pushedToDebts.has(i)) return;
    const involvesMe = t.from === myName || t.to === myName;
    if (!involvesMe) return;
    setPushingIdx(i);
    try {
      const direction = t.from === myName ? "i_owe_them" : "they_owe_me";
      const personName = t.from === myName ? t.to : t.from;
      await createDebt.mutateAsync({
        data: {
          personName,
          description: `${group.name} — bill split`,
          date: new Date().toISOString().slice(0, 10),
          nativeAmount: t.amount,
          currency: "GBP",
          direction,
          notes: `From bill split group: ${group.name}`,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListDebtsQueryKey() });
      setPushedToDebts((prev) => { const n = new Set(prev); n.add(i); return n; });
      toast({ title: "Added to Debts", description: `${direction === "i_owe_them" ? `You owe ${personName}` : `${personName} owes you`} ${formatGbp(t.amount)} now appears on the Owing page.` });
    } catch {
      toast({ title: "Failed", description: "Could not add to debts.", variant: "destructive" });
    } finally {
      setPushingIdx(null);
    }
  }

  const allDone = transfers.length > 0 && settledTransfers.size === transfers.length;

  return (
    <div
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderTop: "2px solid var(--ft-cyan)",
        borderRadius: 2,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--ft-cyan)",
          }}
        >
          Settle Up
        </span>
        {transfers.length === 0 && (
          <span style={{ fontSize: 10, color: "var(--ft-green)", fontFamily: "var(--font-mono)" }}>
            ✓ All settled
          </span>
        )}
      </div>

      {/* Per-member balance bar */}
      <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ft-dim)", marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid var(--ft-border)" }}>
        Balances
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        {group.members.map((m, i) => {
          const bal = Math.round((balances[m] ?? 0) * 100) / 100;
          const col = memberColor(i);
          const isMe = m === myName;
          return (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 3,
                  background: col.bg,
                  color: col.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {m[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 11, color: "var(--ft-text)", minWidth: 50, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1 }}>
                {m}
                {isMe && (
                  <span style={{ fontSize: 8, color: "var(--ft-dim)", marginLeft: 3 }}>(you)</span>
                )}
              </span>
              <span
                className="pnum"
                style={{
                  fontSize: 14,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color:
                    bal > 0.005
                      ? "var(--ft-green)"
                      : bal < -0.005
                      ? "var(--ft-red)"
                      : "var(--ft-dim)",
                }}
              >
                {bal > 0.005 ? "+" : ""}
                {formatGbp(bal)}
              </span>
              <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)" }}>
                {bal > 0.005 ? "is owed" : bal < -0.005 ? "owes" : "even"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Transfer instructions */}
      {transfers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 8,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--ft-dim)",
              marginBottom: 6,
              paddingBottom: 5,
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            Settle Up — Minimum Transfers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {transfers.map((t, i) => {
              const fromIdx = memberIndex(group.members, t.from);
              const toIdx = memberIndex(group.members, t.to);
              const fromCol = memberColor(fromIdx >= 0 ? fromIdx : 0);
              const toCol = memberColor(toIdx >= 0 ? toIdx : 0);
              const done = settledTransfers.has(i);
              const involvesMe = myName && (t.from === myName || t.to === myName);
              const pushed = pushedToDebts.has(i);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    background: done ? "rgba(74,222,128,0.06)" : "var(--ft-raised)",
                    border: `1px solid ${done ? "rgba(74,222,128,0.2)" : "var(--ft-border)"}`,
                    borderRadius: 2,
                    opacity: done ? 0.7 : 1,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: fromCol.bg,
                      color: fromCol.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.from[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ft-dim)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>
                    {t.from}
                  </span>
                  <ArrowRight style={{ width: 10, height: 10, color: "var(--ft-dim)", flexShrink: 0 }} />
                  <span
                    className="pnum"
                    style={{
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                      color: done ? "var(--ft-dim)" : "var(--ft-green)",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {formatGbp(t.amount)}
                  </span>
                  <ArrowRight style={{ width: 10, height: 10, color: "var(--ft-dim)", flexShrink: 0 }} />
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 3,
                      background: toCol.bg,
                      color: toCol.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 8,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.to[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--ft-accent)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>{t.to}</span>
                  <div style={{ flex: 1 }} />
                  {involvesMe && (
                    <button
                      onClick={() => pushTransferToDebts(t, i)}
                      disabled={pushed || pushingIdx === i}
                      style={{
                        padding: "2px 8px",
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        borderRadius: 2,
                        border: pushed ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(34,211,238,0.5)",
                        background: pushed ? "rgba(34,211,238,0.08)" : "transparent",
                        color: pushed ? "var(--ft-cyan)" : "var(--ft-cyan)",
                        cursor: pushed || pushingIdx === i ? "default" : "pointer",
                        opacity: pushed || pushingIdx === i ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pushed ? "↗ In Debts" : pushingIdx === i ? "…" : "↗ Push to Debts"}
                    </button>
                  )}
                  <button
                    onClick={() => toggleTransfer(i)}
                    style={{
                      padding: "2px 8px",
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderRadius: 2,
                      border: done
                        ? "1px solid rgba(74,222,128,0.3)"
                        : "1px solid var(--ft-border2)",
                      background: done ? "rgba(74,222,128,0.1)" : "transparent",
                      color: done ? "var(--ft-green)" : "var(--ft-dim)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {done ? (
                      <>
                        <Check style={{ width: 9, height: 9 }} /> Done
                      </>
                    ) : (
                      "Mark done"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allDone && !group.settled && (
        <button
          onClick={onMarkGroupSettled}
          style={{
            width: "100%",
            padding: "7px",
            background: "rgba(74,222,128,0.12)",
            border: "1px solid rgba(74,222,128,0.3)",
            color: "var(--ft-green)",
            borderRadius: 2,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <CheckCircle2 style={{ width: 14, height: 14 }} /> Mark Group as Settled
        </button>
      )}

      {group.settled && (
        <div
          style={{
            padding: "7px",
            background: "rgba(74,222,128,0.06)",
            border: "1px solid rgba(74,222,128,0.15)",
            borderRadius: 2,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ft-green)",
            fontFamily: "var(--font-mono)",
          }}
        >
          ✓ This group is settled
        </div>
      )}
    </div>
  );
}

// ─── GroupSummaryStats ─────────────────────────────────────────────────────────

const SUMMARY_CATEGORY_COLORS: Record<string, string> = {
  "Food & Drink": "var(--ft-green)",
  Transport: "var(--ft-blue)",
  Shopping: "var(--ft-accent)",
  Entertainment: "var(--ft-amber)",
  "Bills & Utilities": "var(--ft-red)",
  Health: "#a78bfa",
  Travel: "#22d3ee",
  Other: "var(--ft-dim)",
};

interface StatCellProps {
  label: string;
  value: string;
  color: string;
  sub?: string;
}

function StatCell({ label, value, color, sub }: StatCellProps) {
  return (
    <div
      style={{
        background: "var(--ft-surface)",
        borderTop: `2px solid ${color}`,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-dim)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div
        className="pnum"
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: "var(--ft-dim)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

interface CategoryLegendItemProps {
  cat: string;
  amt: number;
  total: number;
}

function CategoryLegendItem({ cat, amt, total }: CategoryLegendItemProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 7, height: 7, borderRadius: 1, background: SUMMARY_CATEGORY_COLORS[cat] ?? "var(--ft-dim)", flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
        {cat} <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 600 }}>{((amt / total) * 100).toFixed(0)}%</span>
      </span>
    </div>
  );
}

interface GroupSummaryStatsProps {
  group: SplitGroup;
  expenses: SplitExpense[];
  myName: string;
}

function GroupSummaryStats({ group, expenses, myName }: GroupSummaryStatsProps) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const myShare = myName
    ? expenses.reduce((s, e) => s + (e.shares[myName] ?? 0), 0)
    : 0;
  const myPaid = myName
    ? expenses.filter((e) => e.paidBy === myName).reduce((s, e) => s + e.amount, 0)
    : 0;
  const myNet = myPaid - myShare;

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const cat = e.category || "Other";
      map.set(cat, (map.get(cat) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Border-as-gap KPI strip */}
      <div
        className="ft-four-col"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--ft-border)",
          border: "1px solid var(--ft-border)",
        }}
      >
        <StatCell label="Total Expenses" value={formatGbp(total)} color="var(--ft-text)" sub={`${expenses.length} items`} />
        {myName
          ? <StatCell label="Your Share" value={formatGbp(myShare)} color="var(--ft-blue)" sub="of total" />
          : <StatCell label="Members" value={`${group.members.length}`} color="var(--ft-blue)" sub="in group" />
        }
        {myName && <StatCell label="You Paid" value={formatGbp(myPaid)} color="var(--ft-accent)" sub="as payer" />}
        {myName && (
          <StatCell
            label="Your Net"
            value={`${myNet > 0.005 ? "+" : ""}${formatGbp(myNet)}`}
            color={myNet > 0.005 ? "var(--ft-green)" : myNet < -0.005 ? "var(--ft-red)" : "var(--ft-dim)"}
            sub={myNet > 0.005 ? "others owe you" : myNet < -0.005 ? "you owe others" : "even"}
          />
        )}
      </div>

      {/* Category breakdown bar */}
      {categoryTotals.length > 1 && total > 0 && (
        <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-amber)", padding: "8px 10px" }}>
          <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ft-dim)", marginBottom: 6 }}>
            Spend by category
          </div>
          {/* Stacked bar */}
          <div style={{ display: "flex", height: 6, borderRadius: 2, overflow: "hidden", marginBottom: 8, gap: 1 }}>
            {categoryTotals.map(([cat, amt]) => (
              <div
                key={cat}
                title={`${cat}: ${formatGbp(amt)}`}
                style={{
                  width: `${(amt / total) * 100}%`,
                  background: SUMMARY_CATEGORY_COLORS[cat] ?? "var(--ft-dim)",
                  opacity: 0.85,
                  transition: "none",
                }}
              />
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {categoryTotals.map(([cat, amt]) => (
              <CategoryLegendItem key={cat} cat={cat} amt={amt} total={total} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MyNameSettingBar ──────────────────────────────────────────────────────────

interface MyNameBarProps {
  myName: string;
  onChange: (name: string) => void;
  groupMembers: string[];
}

function MyNameBar({ myName, onChange, groupMembers }: MyNameBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(myName);

  function save() {
    const trimmed = draft.trim();
    onChange(trimmed);
    saveMyName(trimmed);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
        marginBottom: 10,
      }}
    >
      <Settings2 style={{ width: 11, height: 11, color: "var(--ft-dim)", flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--ft-dim)", flexShrink: 0 }}>You are</span>
      {editing ? (
        <>
          <select
            style={{ ...INPUT_S, height: 22, fontSize: 10, flex: 1, minWidth: 0 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          >
            <option value="">— pick your name —</option>
            {groupMembers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            style={{
              padding: "2px 8px",
              fontSize: 10,
              background: "var(--ft-blue)",
              color: "var(--ft-base)",
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              padding: "2px 6px",
              fontSize: 10,
              background: "transparent",
              color: "var(--ft-dim)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 11, fontWeight: 600, color: myName ? "var(--ft-accent)" : "var(--ft-dim)" }}>
            {myName || "— not set —"}
          </span>
          <button
            onClick={() => {
              setDraft(myName);
              setEditing(true);
            }}
            style={{
              padding: "2px 7px",
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "transparent",
              color: "var(--ft-dim)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            Change
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function exportGroupCSV(group: SplitGroup, expenses: SplitExpense[]): void {
  const members = group.members;
  const shareHeaders = members.map((m) => `Share:${m}`);
  const header = ["Date", "Description", "Category", "Amount (GBP)", "Paid By", ...shareHeaders].join(",");
  const rows = expenses.map((e) => {
    const shares = members.map((m) => (e.shares[m] ?? 0).toFixed(2));
    return [
      e.date,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.category.replace(/"/g, '""')}"`,
      e.amount.toFixed(2),
      `"${e.paidBy.replace(/"/g, '""')}"`,
      ...shares,
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `${group.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SplitPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTransaction = useCreateTransaction();

  const [data, setData] = useState<BillSplitData>(() => loadData());
  const [myName, setMyName] = useState<string>(() => loadMyName());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseFilterPayer, setExpenseFilterPayer] = useState("all");
  const [expenseFilterCategory, setExpenseFilterCategory] = useState("all");

  // Persist on every change
  useEffect(() => {
    saveData(data);
  }, [data]);

  const activeGroups = useMemo(
    () => data.groups.filter((g) => !g.settled),
    [data.groups]
  );
  const settledGroups = useMemo(
    () => data.groups.filter((g) => g.settled),
    [data.groups]
  );

  const selectedGroup = useMemo(
    () => (selectedGroupId ? data.groups.find((g) => g.id === selectedGroupId) ?? null : null),
    [selectedGroupId, data.groups]
  );

  const groupExpenses = useMemo(
    () => (selectedGroupId ? data.expenses.filter((e) => e.groupId === selectedGroupId) : []),
    [selectedGroupId, data.expenses]
  );

  const expenseCategoryOptions = useMemo(() => {
    const cats = new Set(groupExpenses.map((e) => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [groupExpenses]);

  const filteredGroupExpenses = useMemo(() => {
    return groupExpenses.filter((e) => {
      if (expenseSearch && !e.description.toLowerCase().includes(expenseSearch.toLowerCase())) return false;
      if (expenseFilterPayer !== "all" && e.paidBy !== expenseFilterPayer) return false;
      if (expenseFilterCategory !== "all" && e.category !== expenseFilterCategory) return false;
      return true;
    });
  }, [groupExpenses, expenseSearch, expenseFilterPayer, expenseFilterCategory]);

  // Auto-select first group when none selected
  useEffect(() => {
    if (!selectedGroupId && activeGroups.length > 0) {
      setSelectedGroupId(activeGroups[0].id);
    }
  }, [selectedGroupId, activeGroups]);

  // Reset expense filters when switching groups
  useEffect(() => {
    setExpenseSearch("");
    setExpenseFilterPayer("all");
    setExpenseFilterCategory("all");
  }, [selectedGroupId]);

  const handleAddGroup = useCallback((group: SplitGroup) => {
    setData((prev) => ({ ...prev, groups: [...prev.groups, group] }));
    setSelectedGroupId(group.id);
    setShowAddGroup(false);
    setMobileView("detail");
    toast({ title: "Group created", description: group.name });
  }, [toast]);

  const handleDeleteGroup = useCallback((groupId: string) => {
    setData((prev) => ({
      groups: prev.groups.filter((g) => g.id !== groupId),
      expenses: prev.expenses.filter((e) => e.groupId !== groupId),
    }));
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    toast({ title: "Group deleted" });
  }, [selectedGroupId, toast]);

  const handleAddExpense = useCallback((expense: SplitExpense) => {
    setData((prev) => ({ ...prev, expenses: [...prev.expenses, expense] }));
    setShowAddExpense(false);
    toast({ title: "Expense added", description: expense.description });
  }, [toast]);

  const handleDeleteExpense = useCallback((expenseId: string) => {
    setData((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== expenseId),
    }));
    toast({ title: "Expense removed" });
  }, [toast]);

  const handleMarkGroupSettled = useCallback(() => {
    if (!selectedGroupId) return;
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((g) =>
        g.id === selectedGroupId ? { ...g, settled: true } : g
      ),
    }));
    toast({ title: "Group settled", description: "All done!" });
  }, [selectedGroupId, toast]);

  const handleAddToTransactions = useCallback(
    async (expenseId: string) => {
      if (!myName) {
        toast({
          title: "Set your name first",
          description: "Use the 'You are' bar to identify yourself in this group.",
          variant: "destructive",
        });
        return;
      }
      const expense = data.expenses.find((e) => e.id === expenseId);
      if (!expense) return;
      const myShare = expense.shares[myName];
      if (myShare === undefined || myShare <= 0) {
        toast({
          title: "No share found",
          description: "You don't appear to have a share in this expense.",
          variant: "destructive",
        });
        return;
      }
      if (expense.addedToMyTransactions) return;

      try {
        await createTransaction.mutateAsync({
          data: {
            nativeAmount: Math.round(myShare * 100) / 100,
            currency: "GBP",
            type: "expense",
            description: expense.description,
            category: expense.category,
            accountId: 0,
            date: expense.date,
          },
        });
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
        setData((prev) => ({
          ...prev,
          expenses: prev.expenses.map((e) =>
            e.id === expenseId ? { ...e, addedToMyTransactions: true } : e
          ),
        }));
        toast({
          title: "Added to transactions",
          description: `${expense.description} — ${formatGbp(myShare)}`,
        });
      } catch {
        toast({
          title: "Could not add transaction",
          description: "Please try again or add manually.",
          variant: "destructive",
        });
      }
    },
    [data.expenses, myName, createTransaction, queryClient, toast]
  );

  const handleSelectGroup = useCallback((id: string) => {
    setSelectedGroupId(id);
    setShowAddExpense(false);
    setMobileView("detail");
  }, []);

  // ─── Left panel ────────────────────────────────────────────────────────────

  const leftPanel = (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        height: "100%",
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-surface)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ft-dim)",
          }}
        >
          Groups ({activeGroups.length})
        </span>
        <button
          onClick={() => {
            setShowAddGroup(true);
            setMobileView("list");
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            background: "rgba(96,165,250,0.1)",
            border: "1px solid rgba(96,165,250,0.25)",
            color: "var(--ft-blue)",
            borderRadius: 2,
            fontSize: 10,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
          }}
        >
          <Plus style={{ width: 10, height: 10 }} /> New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {showAddGroup && (
          <AddGroupPanel
            onAdd={handleAddGroup}
            onCancel={() => setShowAddGroup(false)}
          />
        )}

        {activeGroups.length === 0 && !showAddGroup && (
          <div
            style={{
              padding: "28px 12px 24px",
              textAlign: "center",
              color: "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <pre style={{ fontSize: 9, lineHeight: 1.4, color: "var(--ft-raised)", margin: "0 auto 12px", display: "inline-block", textAlign: "left" }}>{
`  ┌───┐ ┌───┐
  │ A │ │ B │
  └─┬─┘ └─┬─┘
    └──┬──┘
    [split]`
            }</pre>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ft-muted)", marginBottom: 4 }}>No groups yet</div>
            <div style={{ fontSize: 10, color: "var(--ft-dim)", lineHeight: 1.5 }}>
              Create a group to split bills<br />and track shared costs.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activeGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              expenses={data.expenses}
              myName={myName}
              isActive={selectedGroupId === g.id}
              onClick={() => handleSelectGroup(g.id)}
              onDelete={() => handleDeleteGroup(g.id)}
            />
          ))}
        </div>

        {/* Settled groups collapsible */}
        {settledGroups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowSettled((p) => !p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 0",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ft-dim)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                width: "100%",
              }}
            >
              {showSettled ? (
                <ChevronDown style={{ width: 11, height: 11 }} />
              ) : (
                <ChevronRight style={{ width: 11, height: 11 }} />
              )}
              Settled ({settledGroups.length})
            </button>
            {showSettled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {settledGroups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    expenses={data.expenses}
                    myName={myName}
                    isActive={selectedGroupId === g.id}
                    onClick={() => handleSelectGroup(g.id)}
                    onDelete={() => handleDeleteGroup(g.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Right panel ───────────────────────────────────────────────────────────

  const rightPanel = selectedGroup ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Group header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 14px",
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          borderLeft: "3px solid var(--ft-accent)",
          borderRadius: 2,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ft-text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedGroup.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {selectedGroup.members.map((m, i) => (
                <MemberAvatar key={m} name={m} members={selectedGroup.members} size={18} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {selectedGroup.members.join(" · ")}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!selectedGroup.settled && (
            <button
              onClick={() => setShowAddExpense(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                background: "var(--ft-blue)",
                border: "none",
                color: "var(--ft-base)",
                borderRadius: 2,
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              <Plus style={{ width: 11, height: 11 }} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* Your name bar */}
      <MyNameBar
        myName={myName}
        onChange={(n) => setMyName(n)}
        groupMembers={selectedGroup.members}
      />

      {/* Summary stats */}
      {groupExpenses.length > 0 && (
        <GroupSummaryStats
          group={selectedGroup}
          expenses={groupExpenses}
          myName={myName}
        />
      )}

      {/* Add expense form */}
      {showAddExpense && !selectedGroup.settled && (
        <AddExpenseForm
          group={selectedGroup}
          onAdd={handleAddExpense}
          onCancel={() => setShowAddExpense(false)}
        />
      )}

      {/* Expenses list */}
      <div>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            padding: "0 2px",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: "var(--ft-dim)",
            }}
          >
            Expenses ({filteredGroupExpenses.length}{filteredGroupExpenses.length !== groupExpenses.length ? `/${groupExpenses.length}` : ""})
          </div>
          {groupExpenses.length > 0 && (
            <button
              onClick={() => exportGroupCSV(selectedGroup, groupExpenses)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "3px 8px",
                border: "1px solid rgba(34,211,238,0.35)",
                background: "transparent",
                color: "var(--ft-cyan)",
                cursor: "pointer",
              }}
            >
              ↓ CSV
            </button>
          )}
        </div>

        {/* Filter bar — only shown when there are expenses */}
        {groupExpenses.length > 0 && (
          <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              value={expenseSearch}
              onChange={(e) => setExpenseSearch(e.target.value)}
              placeholder="Search expenses…"
              className="ft-filter-input"
              style={{
                flex: 1,
                minWidth: 120,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-text)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "4px 8px",
                outline: "none",
              }}
            />
            <select
              value={expenseFilterPayer}
              onChange={(e) => setExpenseFilterPayer(e.target.value)}
              className="ft-filter-input"
              style={{
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: expenseFilterPayer !== "all" ? "var(--ft-text)" : "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "4px 6px",
                cursor: "pointer",
              }}
            >
              <option value="all">All payers</option>
              {selectedGroup.members.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {expenseCategoryOptions.length > 1 && (
              <select
                value={expenseFilterCategory}
                onChange={(e) => setExpenseFilterCategory(e.target.value)}
                className="ft-filter-input"
                style={{
                  background: "var(--ft-raised)",
                  border: "1px solid var(--ft-border)",
                  color: expenseFilterCategory !== "all" ? "var(--ft-text)" : "var(--ft-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  padding: "4px 6px",
                  cursor: "pointer",
                }}
              >
                <option value="all">All categories</option>
                {expenseCategoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {(expenseSearch || expenseFilterPayer !== "all" || expenseFilterCategory !== "all") && (
              <button
                onClick={() => { setExpenseSearch(""); setExpenseFilterPayer("all"); setExpenseFilterCategory("all"); }}
                style={{
                  background: "none",
                  border: "1px solid var(--ft-border)",
                  color: "var(--ft-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "4px 7px",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
                title="Clear filters"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {groupExpenses.length === 0 ? (
          <div
            style={{
              padding: "28px 24px",
              textAlign: "center",
              background: "var(--ft-surface)",
              border: "1px dashed var(--ft-border2)",
              borderRadius: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            <pre style={{ fontSize: 9, lineHeight: 1.4, color: "var(--ft-raised)", margin: "0 auto 10px", display: "inline-block", textAlign: "left" }}>{
`  DATE   ITEM        PAID BY  AMOUNT
  ─────  ──────────  ───────  ──────
  ???    ???         ???      £?.??`
            }</pre>
            <div style={{ fontSize: 11, color: "var(--ft-muted)", marginBottom: 4 }}>No expenses yet</div>
            <div style={{ fontSize: 10, color: "var(--ft-dim)" }}>Add the first expense to start tracking.</div>
          </div>
        ) : filteredGroupExpenses.length === 0 ? (
          <div
            style={{
              padding: "18px",
              textAlign: "center",
              background: "var(--ft-surface)",
              border: "1px dashed var(--ft-border2)",
              borderRadius: 2,
              color: "var(--ft-dim)",
              fontSize: 11,
            }}
          >
            No expenses match the current filters.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[...filteredGroupExpenses]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((exp) => (
                <ExpenseRow
                  key={exp.id}
                  expense={exp}
                  members={selectedGroup.members}
                  myName={myName}
                  onAddToTransactions={() => handleAddToTransactions(exp.id)}
                  onDelete={() => handleDeleteExpense(exp.id)}
                />
              ))}
          </div>
        )}
      </div>

      {/* Settle up */}
      <SettleUpPanel
        group={selectedGroup}
        expenses={groupExpenses}
        myName={myName}
        onMarkGroupSettled={handleMarkGroupSettled}
      />
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: 340,
        color: "var(--ft-dim)",
        fontFamily: "var(--font-mono)",
        gap: 12,
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderRadius: 2,
      }}
    >
      <pre style={{ fontSize: 9, lineHeight: 1.5, color: "var(--ft-raised)", textAlign: "center" }}>{
`  A ──pays──▶ shared
  B ──pays──▶ ledger
  C ──pays──▶ settle`
      }</pre>
      <div style={{ fontSize: 11, color: "var(--ft-muted)", textAlign: "center", lineHeight: 1.6 }}>
        Select a group from the left panel<br />
        <span style={{ fontSize: 10, color: "var(--ft-dim)" }}>to view expenses and settle up</span>
      </div>
    </div>
  );

  // ─── Responsive: detect mobile ─────────────────────────────────────────────
  // Use a simple className-based check rather than a JS media query to keep it stateless
  // and avoid a flicker; we do the logic via inline styles with a responsive breakpoint approach.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Persona quick-start for Social Finance users */}
      {(() => { const ids = loadPersonaIds(); return ids[0] === "social"; })() && (
        <div style={{ marginBottom: 14 }}><PersonaQuickStart /></div>
      )}
      <PageHeader
        icon={SplitSquareHorizontal}
        title="Group Expenses"
        subtitle="Split bills, track shared costs, settle up with minimum transfers"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <a href="/owing" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-muted)", textDecoration: "none", padding: "4px 8px", border: "1px solid var(--ft-border)", background: "transparent", whiteSpace: "nowrap" }}>
              → Debts
            </a>
            {data.groups.length > 0 && (
              <span
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ft-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {activeGroups.length} active
              </span>
            )}
          </div>
        }
      />

      {/* Global KPI strip */}
      {data.groups.length > 0 && (() => {
        const allExpenses = data.expenses;
        const totalSpend = allExpenses.reduce((s, e) => s + e.amount, 0);
        const myNetAll = myName
          ? activeGroups.reduce((sum, g) => {
              const gExp = allExpenses.filter((e) => e.groupId === g.id);
              const bals = computeBalances(g.members, gExp);
              return sum + (bals[myName] ?? 0);
            }, 0)
          : null;
        const unsettledGroups = activeGroups.length;
        const totalExpenseCount = allExpenses.length;
        return (
          <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, border: "1px solid var(--ft-border)", background: "var(--ft-border)", marginBottom: 4 }}>
            {[
              { label: "Active Groups", value: String(unsettledGroups), color: "var(--ft-blue)" },
              { label: "Total Expenses", value: String(totalExpenseCount), color: "var(--ft-text)" },
              { label: "Total Spend", value: formatGbp(totalSpend), color: "var(--ft-text)" },
              {
                label: "Your Net Position",
                value: myName && myNetAll !== null
                  ? `${myNetAll > 0.005 ? "+" : ""}${formatGbp(myNetAll)}`
                  : "—",
                color: myNetAll !== null && myNetAll > 0.005
                  ? "var(--ft-green)"
                  : myNetAll !== null && myNetAll < -0.005
                  ? "var(--ft-red)"
                  : "var(--ft-dim)",
              },
            ].map((kpi) => (
              <div key={kpi.label} style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
                <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{kpi.label}</div>
                <div className="pnum" style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid) return null;
        const msgs: Record<string, string | null> = {
          social: "Social Finance mode — AI receipt scanner, group ledger, and instant split calculations are the core of this page.",
          budget: "Split group expenses here and push the result to your transaction ledger for accurate budget tracking.",
          wealth: "Track shared expenses to keep your net worth figures clean — unsettled group costs can distort your true picture.",
          market: null,
          full: null,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${color}`, background: "var(--ft-surface)", padding: "7px 14px 7px 10px", marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {/* Two-panel layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 12,
          alignItems: "start",
        }}
        className="split-layout"
      >
        {/* Left panel */}
        <div
          style={{
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            borderRadius: 2,
            overflow: "hidden",
            minHeight: 400,
          }}
          className={mobileView === "detail" ? "split-panel-hidden" : "split-panel-left"}
        >
          {leftPanel}
        </div>

        {/* Right panel */}
        <div
          style={{ minHeight: 400 }}
          className={mobileView === "list" ? "split-panel-hidden-mobile" : ""}
        >
          {/* Mobile back button */}
          {mobileView === "detail" && (
            <button
              onClick={() => setMobileView("list")}
              style={{
                display: "none",
                alignItems: "center",
                gap: 5,
                padding: "5px 10px",
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                borderRadius: 2,
                fontSize: 11,
                color: "var(--ft-muted)",
                cursor: "pointer",
                marginBottom: 10,
              }}
              className="split-back-btn"
            >
              <ChevronLeft style={{ width: 12, height: 12 }} /> Back to Groups
            </button>
          )}
          {rightPanel}
        </div>
      </div>

      {/* Responsive styles injected inline via a style tag */}
      <style>{`
        @media (max-width: 720px) {
          .split-layout {
            grid-template-columns: 1fr !important;
          }
          .split-panel-hidden {
            display: none !important;
          }
          .split-panel-hidden-mobile {
            display: none !important;
          }
          .split-back-btn {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}
