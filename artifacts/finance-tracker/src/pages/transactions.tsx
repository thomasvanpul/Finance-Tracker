import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CsvImportModal } from "@/components/csv-import";
import {
  useListTransactions,
  useGetTransactionSummary,
  useCreateTransaction,
  useUpdateTransaction,
  useDeleteTransaction,
  useListAccounts,
  getListTransactionsQueryKey,
  getGetTransactionSummaryQueryKey,
  getListAccountsQueryKey,
  getGetDashboardQueryKey,
  type Transaction,
} from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api-fetch";
import { enqueueOutbox, isNetworkError } from "@/lib/outbox-db";
import { formatBaseMoney, formatNative, formatDate } from "@/lib/utils";
import { loadPersonaIds, PERSONA_COLORS } from "@/lib/persona";
import { PrivDesc } from "@/contexts/privacy-context";
import { convertWithOverride } from "@/lib/currency-store";
import { applyAutoCategory } from "@/lib/auto-cat";
import { loadTemplates, saveTemplate, deleteTemplate, type TxTemplate } from "@/lib/tx-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Trash2, Edit2, Search, Save, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton as FtSkeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { MobileSheet } from "@/components/mobile-sheet";
import { useQueryParam } from "@/hooks/use-query-param";
import { useLocation, useSearch } from "wouter";
import { ledgerLocation, ledgerSearchMatches } from "@/lib/ledger-query";
import { Drill } from "@/components/drill";
import { categoryTransactionsHref, entityHref, merchantTransactionsHref } from "@/lib/entity-href";
import { HStack, PanelHeader, Text, VStack } from "@/components/primitives";

import {
  type TxType, type Currency, type TxForm, type TxFormErrors,
  type SplitLine, type MerchantGroup,
  EMPTY_ERRORS, validateTxField,
  makeEmptyForm, BULK_CATEGORIES, CATEGORIES, TH, TX_TYPE_COLOR,
  getWeekStart, getMonthStart, getMonthEnd, get3MonthsAgo,
  exportCsv, exportJson,
} from "./transactions-helpers";

// ── Honest empty state for an empty ledger ──────────────────────────────────
//
// Replaces the earlier TxFeedPreview + PREVIEW_ROWS pattern. That component
// rendered six fabricated £ rows (Rent -£1100, Sainsbury's -£67.40, Monthly
// Salary +£3700, TfL -£4.80, Pret -£5.95, Spotify -£11.99) directly beneath a
// "0 entries" header, in £ regardless of account currency. Even at 45% opacity
// they read as content, not decoration, and any MYR-account user saw the
// currency mismatch. "Never show a number the API did not supply" applies to
// preview/dimmed rows too.

function TxLedgerEmpty({ openAdd }: { openAdd: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "60px 24px",
        minHeight: "calc(100vh - 260px)",
        fontFamily: "var(--font-sans)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ft-muted)" }}>
        No transactions
      </div>
      <div style={{ fontSize: 12, color: "var(--ft-dim)", maxWidth: 380, lineHeight: 1.55 }}>
        Your transaction feed will appear here. Import a bank CSV for instant history, or add manually. Rows show once you have data.
      </div>
      <HStack gap={10}>
        <button
          type="button"
          onClick={openAdd}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            background: "var(--ft-accent)",
            color: "var(--ft-base)",
            border: "none",
            padding: "10px 20px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Add transaction
        </button>
        <a
          href="/import"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            background: "none",
            color: "var(--ft-accent)",
            border: "1px solid var(--ft-border2)",
            padding: "10px 20px",
            cursor: "pointer",
            textDecoration: "none",
            display: "inline-block",
            fontWeight: 600,
          }}
        >
          Import CSV
        </a>
      </HStack>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const TAG_CHIP_STYLE: React.CSSProperties = {
  background: "color-mix(in srgb, var(--ft-amber) 15%, transparent)",
  color: "var(--ft-amber)",
  border: "1px solid color-mix(in srgb, var(--ft-amber) 30%, transparent)",
  borderRadius: 2,
  padding: "0 4px",
  fontSize: 10,
  fontFamily: "var(--font-sans)",
  whiteSpace: "nowrap" as const,
  lineHeight: "16px",
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
};

interface TxRowProps {
  tx: Transaction;
  indented?: boolean;
  isKeyboardSelected?: boolean;
  notes: Record<number, string>;
  tags: Record<number, string[]>;
  selectedIds: Set<number>;
  pendingDeleteIds: Set<number>;
  toggleSelect: (id: number) => void;
  openDetail: (tx: Transaction) => void;
}

// Declared at module scope, not inside Transactions(). A component defined in
// a render body is a NEW component type on every parent render, so React
// unmounts and remounts every row whenever any filter changes — losing row
// state and paying a full mount per row instead of a re-render.
//
// Five columns: DATE · DESCRIPTION · CATEGORY · ACCOUNT · AMOUNT. TYPE is
// already carried by the sign and the colour on the amount, so it does not
// need a column of its own, and the separate GBP column is gone — the
// converted figure now sits beneath the native one, and only on the rows
// where the two differ (DESIGN.md §7). The row itself is the affordance:
// clicking it opens the detail surface, where note, tag, split, edit and
// delete carry words instead of six unlabelled glyphs in 128px of chrome
// repeated down every row.
function TxRow({
  tx, indented = false, isKeyboardSelected = false,
  notes, tags, selectedIds, pendingDeleteIds,
  toggleSelect, openDetail,
}: TxRowProps) {
  const fxGbp = tx.currency !== "GBP" ? convertWithOverride(Math.abs(tx.nativeAmount), tx.currency, "GBP") : null;
  const hasOverride = fxGbp != null;
  // displayGbp is null when neither an override nor a server-side
  // FX conversion is available; the row still shows the native
  // amount alone, never £0.
  const displayGbp: number | null = hasOverride ? fxGbp : tx.baseEquivalent == null ? null : Math.abs(tx.baseEquivalent);
  // The converted line is printed only where it says something the native
  // line does not. On a GBP transaction it is the same figure in the same
  // currency — which is what made the old GBP column repeat itself down
  // almost every row.
  const showConverted = tx.currency !== "GBP" && displayGbp != null;
  const hasNote = Boolean(notes[tx.id]);
  const txTags = tags[tx.id] ?? [];
  const visibleTags = txTags.slice(0, 2);
  const hiddenTagCount = txTags.length - 2;
  const [hovered, setHovered] = useState(false);
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
  const tone = TX_TYPE_COLOR[tx.type as TxType];
  return (
  <div
    data-tx-row
    className="flex items-center border-b xls-row"
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onClick={() => openDetail(tx)}
    style={{
      borderColor: "var(--ft-border)",
      background: selectedIds.has(tx.id) ? "color-mix(in srgb, var(--ft-blue) 8%, var(--ft-base))" : isKeyboardSelected ? "var(--ft-raised)" : hovered ? "var(--ft-raised)" : "var(--ft-surface)",
      opacity: pendingDeleteIds.has(tx.id) ? 0.4 : 1,
      textDecoration: pendingDeleteIds.has(tx.id) ? "line-through" : "none",
      transition: "opacity 0.15s, background 0.1s",
      cursor: "pointer",
    }}
  >
    {/* The checkbox is a plain input, so it needs its own guard; the three
        drill links carry theirs inside Drill. */}
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ width: 36, minWidth: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch" }}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(tx.id)}
        onChange={() => toggleSelect(tx.id)}
        style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
        aria-label={`Select transaction ${tx.description}`}
      />
    </div>
    <div style={{ width: 90, minWidth: 90, flexShrink: 0, padding: indented ? "6px 10px 6px 20px" : "6px 10px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
      {formatDate(tx.date)}
    </div>
    <div style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", color: isKeyboardSelected ? "var(--ft-accent)" : "var(--ft-text)", fontSize: 12, overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
      {/* No stopPropagation wrapper here: Drill already stops the click
          reaching a pressable ancestor, and a wrapper sized to the cell would
          swallow every click on the whitespace beside the name — which is
          most of the row's width. */}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {tx.description
          ? <Drill href={merchantTransactionsHref(tx.description)} title={`Every ${tx.description} transaction`}><PrivDesc>{tx.description}</PrivDesc></Drill>
          : <PrivDesc>{tx.description}</PrivDesc>}
      </span>
      {/* Note and tags used to own a 36px icon column each. They are
          annotations on the description, so the mark reads here and the
          editing happens in the detail surface. */}
      {hasNote && <span title="Has a note" style={{ fontSize: 10, color: "var(--ft-amber)", flexShrink: 0, lineHeight: "16px" }}>✎</span>}
      {txTags.length > 0 && (
        <HStack gap={3} align="center" shrink={false}>
          {visibleTags.map((t) => (
            <span key={t} style={TAG_CHIP_STYLE}>{t}</span>
          ))}
          {hiddenTagCount > 0 && (
            <span style={{ ...TAG_CHIP_STYLE, fontFamily: "var(--font-mono)", background: "color-mix(in srgb, var(--ft-amber) 8%, transparent)" }}>+{hiddenTagCount}</span>
          )}
        </HStack>
      )}
    </div>
    <div style={{ width: 120, minWidth: 120, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", display: "flex", alignItems: "center", overflow: "hidden" }}>
      <span style={{ fontSize: 10, color: "var(--ft-muted)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em", fontWeight: 600, whiteSpace: "nowrap" as const, lineHeight: "14px", flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
        {tx.category
          ? <Drill href={categoryTransactionsHref(tx.category)} title={`Everything in ${tx.category}`}>{tx.category}</Drill>
          : tx.category}
      </span>
    </div>
    <div style={{ width: 150, minWidth: 150, flexShrink: 0, padding: "6px 10px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-muted)", fontSize: 10, fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      <span>
        {tx.accountId != null && tx.accountName
          ? <Drill href={entityHref("account", tx.accountId)} title={`${tx.accountName} — open the account`}>{tx.accountName}</Drill>
          : tx.accountName}
      </span>
    </div>
    {/* Native first, converted beneath, and only on a foreign row
        (DESIGN.md §7). The slot is sized from the widest of both strings
        across the filtered set, so neither line can be clipped (§8). */}
    <div style={{ width: "var(--tx-amount-w)", minWidth: "var(--tx-amount-w)", flexShrink: 0, padding: "6px 10px", textAlign: "right", color: tone, fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      <div className="pnum">
        {sign}{formatNative(Math.abs(tx.nativeAmount), tx.currency)}
      </div>
      {showConverted && (
        <div className="pnum" style={{ fontSize: 10, fontWeight: 500, color: "var(--ft-dim)", marginTop: 1 }}>
          {sign}{formatBaseMoney(displayGbp)}
          {hasOverride && <span title="Custom FX rate applied" style={{ color: "var(--ft-amber)", marginLeft: 2 }}>★</span>}
        </div>
      )}
    </div>
  </div>
  );
}

const TX_DETAIL_SECONDARY_BTN: React.CSSProperties = {
  fontSize: 11,
  padding: "5px 12px",
  background: "transparent",
  border: "1px solid var(--ft-border2)",
  borderRadius: 2,
  color: "var(--ft-muted)",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};

const TX_DETAIL_PRIMARY_BTN: React.CSSProperties = {
  ...TX_DETAIL_SECONDARY_BTN,
  padding: "5px 14px",
  background: "var(--ft-accent)",
  borderColor: "var(--ft-accent)",
  color: "var(--ft-base)",
  fontWeight: 700,
};

const TX_DEVICE_LOCAL_MARK: React.CSSProperties = {
  fontSize: 8,
  color: "var(--ft-dim)",
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--ft-border2)",
  padding: "1px 5px",
  letterSpacing: "0.04em",
  background: "var(--ft-raised)",
};

function TxDetailRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--ft-border)" }}>
      <Text as="span" mono size={9} upper letterSpacing="0.12em" color="var(--ft-dim)">{label}</Text>
      <span style={{ fontSize: 12, color: "var(--ft-text)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value == null || value === "" ? "—" : href ? <Drill href={href}>{value}</Drill> : value}
      </span>
    </div>
  );
}

// The surface the row opens. It is where the 128px action column went: note,
// tag, split, edit and delete, each carrying a word instead of one of six
// unlabelled glyphs. Ephemeral — it floats and it leaves (DESIGN.md §6) — so
// Dialog is the right frame, and the one the rest of this page already uses.
function TxDetailDialog({
  tx, note, txTags, allTagSuggestions,
  onClose, onEdit, onSplit, onDelete,
  onSaveNote, onClearNote, onAddTag, onRemoveTag,
}: {
  tx: Transaction;
  note: string;
  txTags: string[];
  allTagSuggestions: string[];
  onClose: () => void;
  onEdit: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onSaveNote: (text: string) => void;
  onClearNote: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(note);
  const [tagInput, setTagInput] = useState("");
  const fxGbp = tx.currency !== "GBP" ? convertWithOverride(Math.abs(tx.nativeAmount), tx.currency, "GBP") : null;
  const hasOverride = fxGbp != null;
  const displayGbp: number | null = hasOverride ? fxGbp : tx.baseEquivalent == null ? null : Math.abs(tx.baseEquivalent);
  const showConverted = tx.currency !== "GBP" && displayGbp != null;
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";
  const tone = TX_TYPE_COLOR[tx.type as TxType];
  const suggestions = (tagInput
    ? allTagSuggestions.filter((s) => s.toLowerCase().includes(tagInput.toLowerCase()) && !txTags.includes(s))
    : allTagSuggestions.filter((s) => !txTags.includes(s))
  ).slice(0, 8);

  const commitTags = () => {
    tagInput.split(",").map((s) => s.trim()).filter(Boolean).forEach(onAddTag);
    setTagInput("");
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent style={{ maxWidth: 460 }}>
        <DialogHeader>
          <DialogTitle style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <PrivDesc>{tx.description}</PrivDesc>
          </DialogTitle>
        </DialogHeader>

        {/* Native first, converted second (DESIGN.md §7) */}
        <VStack gap={2}>
          <Text as="div" mono size={9} upper letterSpacing="0.16em" color="var(--ft-dim)">{tx.type}</Text>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, lineHeight: "28px", color: tone, whiteSpace: "nowrap" }}>
            {sign}{formatNative(Math.abs(tx.nativeAmount), tx.currency)}
          </div>
          {showConverted && (
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)", whiteSpace: "nowrap" }}>
              {sign}{formatBaseMoney(displayGbp)}
              {hasOverride && <span title="Custom FX rate applied" style={{ color: "var(--ft-amber)", marginLeft: 3 }}>★</span>}
            </div>
          )}
        </VStack>

        <VStack gap={0} marginTop={14}>
          <TxDetailRow label="DATE" value={formatDate(tx.date)} />
          <TxDetailRow
            label="CATEGORY"
            value={tx.category}
            href={tx.category ? categoryTransactionsHref(tx.category) : undefined}
          />
          <TxDetailRow
            label="ACCOUNT"
            value={tx.accountName}
            href={tx.accountId != null ? entityHref("account", tx.accountId) : undefined}
          />
        </VStack>

        <VStack gap={6} marginTop={14}>
          <HStack align="center" justify="between">
            <Text as="span" mono size={9} upper letterSpacing="0.12em" color="var(--ft-dim)">NOTE</Text>
            <span style={TX_DEVICE_LOCAL_MARK} title="Notes are saved locally on this device only and will not sync across browsers or devices">device-local</span>
          </HStack>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            placeholder="Add a note…"
            style={{ width: "100%", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", fontSize: 12, fontFamily: "var(--font-sans)", padding: "6px 8px", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          <HStack gap={6} justify="end">
            <button type="button" onClick={() => { onClearNote(); setNoteDraft(""); }} style={TX_DETAIL_SECONDARY_BTN}>Clear note</button>
            <button type="button" onClick={() => onSaveNote(noteDraft)} style={TX_DETAIL_PRIMARY_BTN}>Save note</button>
          </HStack>
        </VStack>

        <VStack gap={6} marginTop={14}>
          <HStack align="center" justify="between">
            <Text as="span" mono size={9} upper letterSpacing="0.12em" color="var(--ft-dim)">TAGS</Text>
            <span style={TX_DEVICE_LOCAL_MARK} title="Tags are saved locally on this device only and will not sync across browsers or devices">device-local</span>
          </HStack>
          {txTags.length > 0 && (
            <HStack gap={4} wrap>
              {txTags.map((t) => (
                <span key={t} style={{ ...TAG_CHIP_STYLE, cursor: "pointer" }} onClick={() => onRemoveTag(t)} title="Click to remove">
                  {t}<span style={{ marginLeft: 2, opacity: 0.7 }}>×</span>
                </span>
              ))}
            </HStack>
          )}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitTags(); } }}
            placeholder="Add tag… (Enter or comma)"
            style={{ width: "100%", background: "var(--ft-base)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", fontSize: 12, fontFamily: "var(--font-sans)", padding: "5px 8px", outline: "none", boxSizing: "border-box" }}
          />
          {suggestions.length > 0 && (
            <HStack gap={4} wrap>
              {suggestions.map((s) => (
                <span key={s} onClick={() => onAddTag(s)} style={{ ...TAG_CHIP_STYLE, cursor: "pointer", opacity: 0.65 }}>+ {s}</span>
              ))}
            </HStack>
          )}
        </VStack>

        {/* The former action column, with words */}
        <DialogFooter style={{ marginTop: 18, gap: 8 }}>
          <button type="button" onClick={onDelete} style={{ ...TX_DETAIL_SECONDARY_BTN, borderColor: "var(--ft-red)", color: "var(--ft-red)", marginRight: "auto" }}>Delete</button>
          <button type="button" onClick={onSplit} style={TX_DETAIL_SECONDARY_BTN}>Split into transactions</button>
          <button type="button" onClick={onEdit} style={TX_DETAIL_PRIMARY_BTN}>Edit</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── the ledger's filter state ────────────────────────────────────────────────
// One object rather than nine useStates, and one list of fields rather than
// two hand-written summaries of them.
//
// The bug this closes: `hasFilters` was a disjunction over eight fields and
// `activeFilterCount` an array over five, written separately and free to
// disagree — and they did. A search term or a type selection made the empty
// state say "no transactions match the current filters" while the FILTERS
// badge showed nothing and the chip row was empty, so the screen told the
// user they had filters and refused to say which. Deriving both from
// FILTER_FIELDS makes `hasFilters === activeFilterCount > 0` true by
// construction rather than by two authors agreeing.

type LedgerFilters = {
  q: string;
  type: "all" | TxType;
  category: string;
  account: string;
  from: string;
  to: string;
  amountMin: string;
  amountMax: string;
  tag: string;
};

const NO_FILTERS: LedgerFilters = {
  q: "", type: "all", category: "all", account: "all",
  from: "", to: "", amountMin: "", amountMax: "", tag: "",
};

// The six named periods the period control offers. `null` means the from/to
// pair matches none of them — a custom range, which the panel owns.
// How the ledger is grouped. One value, three positions — DAY is the default,
// because a ledger read chronologically is what every statement and every bank
// app shows, and it is what the phone surface has always done.
type Grouping = "day" | "merchant" | "none";
const GROUPING_LABEL: Record<Grouping, string> = { day: "DAY", merchant: "MERCHANT", none: "LIST" };

type QuickRange = "all" | "today" | "week" | "month" | "lastmonth" | "3m";

const QUICK_RANGE_LABEL: Record<QuickRange, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  lastmonth: "Last month",
  "3m": "Last 3 months",
};

function quickRangeBounds(range: QuickRange): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  switch (range) {
    case "today": return { from: today, to: today };
    case "week": return { from: getWeekStart(), to: "" };
    case "month": return { from: getMonthStart(), to: "" };
    case "lastmonth": return { from: getMonthStart(-1), to: getMonthEnd(-1) };
    case "3m": return { from: get3MonthsAgo(), to: "" };
    case "all": return { from: "", to: "" };
  }
}

function quickRangeOf(f: LedgerFilters): QuickRange | null {
  for (const r of ["all", "today", "week", "month", "lastmonth", "3m"] as QuickRange[]) {
    const b = quickRangeBounds(r);
    if (b.from === f.from && b.to === f.to) return r;
  }
  return null;
}

// Every field that can narrow the ledger, with the label its chip carries and
// what clearing it means. Adding a filter is one entry here, not five edits in
// five places that have to be kept in step.
const FILTER_FIELDS: readonly {
  key: string;
  active: (f: LedgerFilters) => boolean;
  label: (f: LedgerFilters) => string;
  cleared: Partial<LedgerFilters>;
}[] = [
  { key: "q", active: (f) => f.q !== "", label: (f) => `"${f.q}"`, cleared: { q: "" } },
  { key: "type", active: (f) => f.type !== "all", label: (f) => f.type.toUpperCase(), cleared: { type: "all" } },
  {
    key: "period",
    active: (f) => f.from !== "" || f.to !== "",
    label: (f) => {
      const r = quickRangeOf(f);
      return r == null ? `${f.from || "…"}–${f.to || "…"}` : QUICK_RANGE_LABEL[r];
    },
    cleared: { from: "", to: "" },
  },
  { key: "category", active: (f) => f.category !== "all", label: (f) => `CAT: ${f.category}`, cleared: { category: "all" } },
  { key: "account", active: (f) => f.account !== "all", label: (f) => `ACCT: ${f.account}`, cleared: { account: "all" } },
  { key: "tag", active: (f) => f.tag !== "", label: (f) => `#${f.tag}`, cleared: { tag: "" } },
  {
    key: "amount",
    active: (f) => f.amountMin !== "" || f.amountMax !== "",
    label: (f) => `${f.amountMin || "0"}–${f.amountMax || "∞"}`,
    cleared: { amountMin: "", amountMax: "" },
  },
];

export default function Transactions() {
  const { data: transactions, isLoading, isError, error } = useListTransactions();
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useGetTransactionSummary();
  const { data: accounts } = useListAccounts();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // No `isMobile` here on purpose. App.tsx returns <PhoneShell /> before it
  // reaches the desktop <Switch>, and PhoneShell maps /transactions to
  // SpendingScreen — so this page never mounts below 768px and every
  // `isMobile &&` branch it used to carry was unreachable. Verified: the
  // only importer of pages/transactions is App.tsx:34.

  // ── core dialog state ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [form, setForm] = useState<TxForm>(makeEmptyForm);
  const [formErrors, setFormErrors] = useState<TxFormErrors>(EMPTY_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  // ── filters ─────────────────────────────────────────────────────────────
  const qParam = useQueryParam("q");

  // ?category=, ?account=, ?type=, ?from= and ?to= are how a drill arrives
  // here (DESIGN.md §14, lib/entity-href.ts `ledgerHref`). They seed the same
  // filters the selects write, so a drilled-in view and a hand-filtered one
  // are the same view, and the filter chips already know how to clear them.
  const categoryParam = useQueryParam("category");
  const accountParam = useQueryParam("account");
  const typeParam = useQueryParam("type");
  const fromParam = useQueryParam("from");
  const toParam = useQueryParam("to");
  const parseTypeParam = (v: string | null): "all" | TxType =>
    v === "income" || v === "expense" || v === "transfer" ? v : "all";
  const [filters, setFilters] = useState<LedgerFilters>(() => ({
    ...NO_FILTERS,
    q: qParam ?? "",
    type: parseTypeParam(typeParam),
    category: categoryParam ?? "all",
    from: fromParam ?? "",
    to: toParam ?? "",
  }));
  // One write path. Every control on this screen goes through it, so there is
  // no field a control can set without the count and the chips noticing.
  const patchFilters = useCallback((p: Partial<LedgerFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
  }, []);
  // Read aliases, so the ~40 places that only read a filter keep reading a
  // plain name. Writes never go through these.
  const { q: search, type: filterType, category: filterCategory, account: filterAccount,
          from: filterDateFrom, to: filterDateTo, amountMin, amountMax, tag: filterTag } = filters;

  useEffect(() => { patchFilters({ q: qParam ?? "" }); }, [qParam, patchFilters]);
  useEffect(() => { patchFilters({ category: categoryParam ?? "all" }); }, [categoryParam, patchFilters]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { patchFilters({ type: parseTypeParam(typeParam) }); }, [typeParam, patchFilters]);
  useEffect(() => { patchFilters({ from: fromParam ?? "" }); }, [fromParam, patchFilters]);
  useEffect(() => { patchFilters({ to: toParam ?? "" }); }, [toParam, patchFilters]);
  // The parameter carries an account id; the filter matches on the name the
  // ledger rows carry. Resolving here rather than putting a name in the URL
  // keeps `account` meaning one thing across the whole app, and a name that
  // is later edited does not strand the link.
  useEffect(() => {
    if (accountParam == null) { patchFilters({ account: "all" }); return; }
    const match = accounts?.find((a) => String(a.id) === accountParam);
    if (match) patchFilters({ account: match.name });
  }, [accountParam, accounts, patchFilters]);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-high" | "amount-low">("date-desc");

  // ── the return leg: state back into the URL ──────────────────────────────
  // Until now this was one-way. ?category= and friends seeded the filters on
  // arrival, and from that moment the address bar described a view the screen
  // had left behind — so a filtered ledger could be reached but not kept.
  // Refresh, bookmark or paste it and you got the whole list back, which
  // quietly undoes what the §14 drills are for.
  //
  // `replace`, never `push`: the filter bar is not a sequence of pages, and
  // making every select press a back-button stop would be worse than the bug.
  // Only the six filters lib/entity-href.ts already spells are written; see
  // lib/ledger-query.ts for why a one-way parameter is worse than none.
  const currentSearch = useSearch();
  const [, navigate] = useLocation();
  const filterAccountId = useMemo(() => {
    if (filterAccount === "all") return null;
    const match = accounts?.find((a) => a.name === filterAccount);
    return match == null ? null : String(match.id);
  }, [filterAccount, accounts]);
  useEffect(() => {
    // An ?account= id is resolved to a name by an effect that needs the
    // account list. Writing before it loads would strip the parameter from
    // the URL of a link that had only just been opened.
    if (accountParam != null && accounts == null) return;
    const state = {
      q: search, type: filterType, category: filterCategory,
      accountId: filterAccountId, from: filterDateFrom, to: filterDateTo,
    };
    if (ledgerSearchMatches(currentSearch, state)) return;
    navigate(ledgerLocation(state), { replace: true });
  }, [search, filterType, filterCategory, filterAccountId, filterDateFrom, filterDateTo,
      currentSearch, navigate, accountParam, accounts]);

  // ── bulk selection ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkFormCat, setBulkFormCat] = useState("");
  const [bulkFormType, setBulkFormType] = useState<"" | TxType>("");

  // ── per-transaction notes (localStorage) ─────────────────────────────────
  const [notes, setNotes] = useState<Record<number, string>>(() => {
    try {
      const raw = localStorage.getItem("ft-tx-notes");
      return raw ? (JSON.parse(raw) as Record<number, string>) : {};
    } catch { return {}; }
  });

  // ── per-transaction tags (localStorage) ──────────────────────────────────
  const [tags, setTags] = useState<Record<number, string[]>>(() => {
    try {
      const raw = localStorage.getItem("ft-tx-tags");
      return raw ? (JSON.parse(raw) as Record<number, string[]>) : {};
    } catch { return {}; }
  });

  // ── how the ledger is grouped ────────────────────────────────────────────
  // One lens, not two checkboxes. They used to be independent booleans, and
  // the render read `groupByDay && !groupByMerchant` — so with both ticked the
  // DAY box was lit and doing nothing, which is the same defect as SL: a
  // control that does not change what the user sees. A single value cannot
  // enter that state.
  //
  // DAY is the default, and was the documented intent all along ("group by
  // day — the default grouping (Monzo/Revolut pattern)") while the state it
  // annotated initialised to false. The phone has grouped by day with a day
  // total since it was built; this is the desktop catching up.
  const [grouping, setGrouping] = useState<Grouping>("day");
  const groupByDay = grouping === "day";
  const groupByMerchant = grouping === "merchant";
  const [expandedMerchants, setExpandedMerchants] = useState<Set<string>>(new Set());

  // ── pagination ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 75;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // ── split transaction (server-side) ─────────────────────────────────────────
  const [splitTxId, setSplitTxId] = useState<number | null>(null);
  const [splitLines, setSplitLines] = useState<SplitLine[]>([]);
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // ── the detail surface a row opens ────────────────────────────────────────
  // Holds the transaction itself rather than its id, so the dialog does not
  // have to re-find the row in a list that a refetch may have reordered.
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);

  // ── templates ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<TxTemplate[]>(() => loadTemplates());
  const [autoCatFilled, setAutoCatFilled] = useState(false);

  // ── pending delete (soft-delete with 3s undo window) ─────────────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Clear all pending delete timers on unmount to prevent firing after navigation
  useEffect(() => {
    return () => {
      deleteTimers.current.forEach((timer) => clearTimeout(timer));
      deleteTimers.current.clear();
    };
  }, []);

  // ── search input ref for / shortcut ─────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── AI batch categorize ──────────────────────────────────────────────────
  const [aiCatConfirmOpen, setAiCatConfirmOpen] = useState(false);
  const [aiCatRunning, setAiCatRunning] = useState(false);

  // ── keyboard navigation ──────────────────────────────────────────────────
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  // Both derived from the same list, so they cannot disagree. `hasFilters`
  // is `activeFilterCount > 0` by construction, not by convention.
  const activeFilters = FILTER_FIELDS.filter((f) => f.active(filters));
  const activeFilterCount = activeFilters.length;
  const hasFilters = activeFilterCount > 0;

  // Reset pagination and row selection when the filters change. One object,
  // so these are one dependency each — and a filter added later cannot be
  // forgotten here the way it could when this was a nine-name list.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters]);
  useEffect(() => { setSelectedRowIndex(null); }, [filters, sortBy]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowIndex === null || !tableContainerRef.current) return;
    const rows = tableContainerRef.current.querySelectorAll<HTMLElement>("[data-tx-row]");
    const el = rows[selectedRowIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedRowIndex]);

  const allCategories = useMemo(
    () => [...new Set((transactions ?? []).map(tx => tx.category).filter(Boolean))].sort(),
    [transactions],
  );
  const allAccounts = useMemo(
    () => [...new Set((transactions ?? []).map(tx => tx.accountName).filter(Boolean))].sort(),
    [transactions],
  );

  const filtered = useMemo(() => {
    const base = (transactions ?? []).filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;
      if (filterAccount !== "all" && tx.accountName !== filterAccount) return false;
      if (filterDateFrom && tx.date < filterDateFrom) return false;
      if (filterDateTo && tx.date > filterDateTo) return false;
      // Amount range filter needs a GBP figure; transactions without
      // an FX conversion fall out of a bounded range but stay in an
      // open one.
      if (amountMin !== "" && (tx.baseEquivalent == null || Math.abs(tx.baseEquivalent) < parseFloat(amountMin))) return false;
      if (amountMax !== "" && (tx.baseEquivalent == null || Math.abs(tx.baseEquivalent) > parseFloat(amountMax))) return false;
      if (search) {
        const q = search.toLowerCase();
        const desc = (tx.description ?? "").toLowerCase();
        const cat = (tx.category ?? "").toLowerCase();
        const acct = (tx.accountName ?? "").toLowerCase();
        if (!desc.includes(q) && !cat.includes(q) && !acct.includes(q)) return false;
      }
      if (filterTag) {
        const txTags = tags[tx.id] ?? [];
        const q = filterTag.toLowerCase();
        if (!txTags.some((t) => t.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    // Amount sorts: unconvertible rows sink to the bottom of a
    // descending sort (magnitude unknown) rather than shuffling above
    // real amounts.
    if (sortBy === "date-asc") return [...base].sort((a, b) => a.date.localeCompare(b.date));
    if (sortBy === "amount-high") return [...base].sort((a, b) => Math.abs(b.baseEquivalent ?? -Infinity) - Math.abs(a.baseEquivalent ?? -Infinity));
    if (sortBy === "amount-low") return [...base].sort((a, b) => Math.abs(a.baseEquivalent ?? Infinity) - Math.abs(b.baseEquivalent ?? Infinity));
    return base; // date-desc is server default
  }, [transactions, filterType, filterCategory, filterAccount, filterDateFrom, filterDateTo, amountMin, amountMax, search, filterTag, tags, sortBy]);

  // The amount slot reserves room for the widest figure the ledger is about to
  // show, so a 7-figure balance widens the slot instead of running into the
  // next cell (DESIGN.md §8: the slot gives, the digits do not). Since the
  // converted figure now sits *beneath* the native one rather than in its own
  // column, the slot has to clear whichever of the two strings is longer —
  // §8 says exactly that: check the width "with a converted line beneath".
  // 7.3px is JetBrains Mono's advance at 12px; +1 for the sign glyph; 20 for
  // the cell padding. The floor is the pre-2026-09-06 fixed width.
  const amountColW = useMemo(() => {
    let nativeMax = 0;
    let baseMax = 0;
    for (const tx of filtered) {
      nativeMax = Math.max(nativeMax, formatNative(Math.abs(tx.nativeAmount), tx.currency).length);
      if (tx.baseEquivalent != null) baseMax = Math.max(baseMax, formatBaseMoney(Math.abs(tx.baseEquivalent)).length);
    }
    return `${Math.max(130, Math.ceil((Math.max(nativeMax, baseMax) + 1) * 7.3) + 20)}px`;
  }, [filtered]);

  // Filtered average: skips unconvertible rows; the denominator drops
  // to match, so this is a true average of what could be converted
  // rather than one padded with fabricated zeros.
  const filteredAvg = useMemo(() => {
    const withGbp = filtered.filter((tx): tx is typeof tx & { baseEquivalent: number } => tx.baseEquivalent != null);
    return withGbp.length > 0 ? withGbp.reduce((acc, tx) => acc + tx.baseEquivalent, 0) / withGbp.length : 0;
  }, [filtered]);

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const inInput = () => { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedIds(new Set()); setBulkFormCat(""); setBulkFormType(""); setDetailTx(null); return; }
      if (e.key === "/" && !inInput()) { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === "n" && !inInput() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setForm(makeEmptyForm()); setAutoCatFilled(false); setAddOpen(true); }
      if (e.key === "e" && !inInput() && !e.metaKey && !e.ctrlKey) { e.preventDefault(); exportCsv(filtered); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [filtered]);

  // ── the period control ───────────────────────────────────────────────────
  const activeQuickRange = quickRangeOf(filters);
  const applyQuickRange = (range: QuickRange) => patchFilters(quickRangeBounds(range));

  // ── merchant groups ──────────────────────────────────────────────────────
  const merchantGroups: MerchantGroup[] = useMemo(() => {
    if (!groupByMerchant) return [];
    const map = new Map<string, MerchantGroup>();
    for (const tx of filtered) {
      // Merchant totals skip unconvertible transactions; the row
      // count still includes them so the merchant doesn't vanish,
      // but the total is honest about what was rolled up.
      if (tx.baseEquivalent == null) continue;
      const key = tx.description ?? "(no description)";
      // Same correction as the day net: baseEquivalent is already signed, so
      // negating expenses again turned a merchant's spending into a credit.
      const signed = tx.baseEquivalent;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += signed;
        existing.txIds.push(tx.id);
      } else {
        map.set(key, {
          description: key,
          count: 1,
          total: signed,
          txIds: [tx.id],
          expanded: expandedMerchants.has(key),
        });
      }
    }
    return Array.from(map.values()).map((g) => ({ ...g, expanded: expandedMerchants.has(g.description) }));
  }, [filtered, groupByMerchant, expandedMerchants]);

  // ── day groups ───────────────────────────────────────────────────────────
  const dayGroups: Array<{ date: string; txs: typeof filtered; net: number }> = useMemo(() => {
    if (!groupByDay) return [];
    const map = new Map<string, typeof filtered>();
    for (const tx of filtered) {
      const key = tx.date;
      const existing = map.get(key);
      if (existing) {
        existing.push(tx);
      } else {
        map.set(key, [tx]);
      }
    }
    // Day order follows the sort control. It used to be hardcoded newest-first,
    // which was survivable while DAY was opt-in: now that it is the default,
    // choosing "Oldest first" would have changed nothing on screen — the same
    // defect this rebuild is removing. An amount sort orders the days by their
    // largest single row, so the control moves both levels rather than only
    // shuffling rows inside a day whose position never changes.
    const peak = (txs: typeof filtered) =>
      txs.reduce((acc, tx) => Math.max(acc, Math.abs(tx.baseEquivalent ?? 0)), 0);
    return Array.from(map.entries())
      .sort((a, b) => {
        if (sortBy === "date-asc") return a[0].localeCompare(b[0]);
        if (sortBy === "amount-high") return peak(b[1]) - peak(a[1]);
        if (sortBy === "amount-low") return peak(a[1]) - peak(b[1]);
        return b[0].localeCompare(a[0]);
      })
      .map(([date, txs]) => ({
        date,
        txs,
        // Day net: skip unconvertible rows; unconvertible income and
        // expense wash out of the daily net without fabrication.
        //
        // baseEquivalent arrives already signed — measured against the dev
        // dataset, all 41 expenses are negative and all 3 income rows
        // positive. Re-deriving the sign from tx.type negated it a second
        // time, so a day of spending printed as a green gain: "SAT 5 SEPT
        // +£3.85" above a single −£3.85 row. Use the sign the API supplied.
        //
        // Transfers still contribute nothing. Their baseEquivalent is
        // positive on both legs, so counting one leg would invent a gain.
        net: txs.reduce((acc, tx) => acc + (tx.baseEquivalent == null || (tx.type !== "income" && tx.type !== "expense") ? 0 : tx.baseEquivalent), 0),
      }));
  }, [filtered, groupByDay, sortBy]);

  // Paginated slices
  const visibleFiltered = filtered.slice(0, visibleCount);
  const hasMoreFlat = filtered.length > visibleCount;
  const visibleDayGroups = (() => {
    if (!groupByDay) return [];
    let shown = 0;
    const groups: typeof dayGroups = [];
    for (const g of dayGroups) {
      if (shown >= visibleCount) break;
      groups.push({ ...g, txs: g.txs.slice(0, visibleCount - shown) });
      shown += g.txs.length;
    }
    return groups;
  })();
  const hasMoreDayGroups = (() => {
    if (!groupByDay) return false;
    let total = 0;
    for (const g of dayGroups) total += g.txs.length;
    return total > visibleCount;
  })();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  }, [queryClient]);

  const openAdd = () => {
    const first = accounts?.[0];
    setForm({ ...makeEmptyForm(), accountId: first ? String(first.id) : "", currency: (first?.currency as Currency) ?? "GBP" });
    setFormErrors(EMPTY_ERRORS);
    setAutoCatFilled(false);
    setTemplates(loadTemplates());
    setAddOpen(true);
  };

  const openEdit = (id: number) => {
    const tx = transactions?.find((t) => t.id === id);
    if (!tx) return;
    setForm({
      date: tx.date,
      description: tx.description,
      type: tx.type as TxType,
      category: tx.category,
      accountId: String(tx.accountId),
      nativeAmount: String(Math.abs(tx.nativeAmount)),
      currency: tx.currency as Currency,
    });
    setFormErrors(EMPTY_ERRORS);
    setEditId(id);
  };

  const openSplit = (id: number) => {
    const tx = transactions?.find((t) => t.id === id);
    if (!tx) return;
    const half = (Math.abs(tx.nativeAmount) / 2).toFixed(2);
    setSplitLines([
      { id: crypto.randomUUID(), category: tx.category, amount: half },
      { id: crypto.randomUUID(), category: "", amount: half },
    ]);
    setSplitTxId(id);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    const body = { date: form.date, description: form.description, type: form.type, category: form.category, accountId: parseInt(form.accountId), nativeAmount: parseFloat(form.nativeAmount), currency: form.currency };
    try {
      await createTx.mutateAsync({ data: body });
      invalidate(); setAddOpen(false); toast({ title: "Transaction added" });
      haptic.success();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOutbox("POST", "/api/transactions", body);
        setAddOpen(false); toast({ title: "Queued — will sync when connected" });
      } else {
        toast({ title: "Failed to add transaction", variant: "destructive" }); haptic.error();
      }
    }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (editId === null) return; setSubmitting(true);
    const body = { date: form.date, description: form.description, type: form.type, category: form.category, nativeAmount: parseFloat(form.nativeAmount), currency: form.currency };
    try {
      await updateTx.mutateAsync({ id: editId, data: body });
      invalidate(); setEditId(null); toast({ title: "Transaction updated" });
      haptic.success();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOutbox("PATCH", `/api/transactions/${editId}`, body);
        setEditId(null); toast({ title: "Queued — will sync when connected" });
      } else {
        toast({ title: "Failed to update", variant: "destructive" }); haptic.error();
      }
    }
    finally { setSubmitting(false); }
  };

  const commitDelete = useCallback(async (id: number) => {
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      await deleteTx.mutateAsync({ id });
      invalidate();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueOutbox("DELETE", `/api/transactions/${id}`, null);
        toast({ title: "Queued — will sync when connected" });
      } else {
        toast({ title: "Failed to delete transaction", variant: "destructive" });
      }
    }
  }, [deleteTx, invalidate, toast]);

  const handleDelete = useCallback((id: number) => {
    haptic.warning();
    setPendingDeleteIds((prev) => new Set([...prev, id]));
    const { id: toastId, dismiss } = toast({
      title: "Deleting in 3s",
      description: (
        <button
          type="button"
          onClick={() => {
            const timer = deleteTimers.current.get(id);
            if (timer) clearTimeout(timer);
            deleteTimers.current.delete(id);
            setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            dismiss();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-accent)", fontFamily: "var(--font-sans)", fontSize: 12, padding: 0, fontWeight: 700 }}
        >
          Undo
        </button>
      ),
    });
    void toastId;
    const timer = setTimeout(() => { commitDelete(id); dismiss(); }, 3000);
    deleteTimers.current.set(id, timer);
  }, [toast, commitDelete]);

  // ── bulk actions ─────────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isAllSelected = filtered.length > 0 && filtered.every((tx) => selectedIds.has(tx.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((tx) => tx.id)));
    }
  };

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    const count = ids.length;
    ids.forEach((id) => {
      setPendingDeleteIds((prev) => new Set([...prev, id]));
    });
    setSelectedIds(new Set());
    const { dismiss } = toast({
      title: `Deleting ${count} transaction${count !== 1 ? "s" : ""} in 3s`,
      description: (
        <button
          type="button"
          onClick={() => {
            ids.forEach((id) => {
              const timer = deleteTimers.current.get(id);
              if (timer) clearTimeout(timer);
              deleteTimers.current.delete(id);
            });
            setPendingDeleteIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
            dismiss();
          }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-accent)", fontFamily: "var(--font-sans)", fontSize: 12, padding: 0, fontWeight: 700 }}
        >
          Undo
        </button>
      ),
    });
    const timer = setTimeout(async () => {
      dismiss();
      setBulkSubmitting(true);
      ids.forEach((id) => deleteTimers.current.delete(id));
      setPendingDeleteIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
      try {
        await Promise.all(ids.map((id) => deleteTx.mutateAsync({ id })));
        invalidate();
      } catch {
        toast({ title: "Failed to delete some transactions", variant: "destructive" });
      } finally {
        setBulkSubmitting(false);
      }
    }, 3000);
    ids.forEach((id) => deleteTimers.current.set(id, timer));
  }, [selectedIds, toast, deleteTx, invalidate]);

  const handleBulkApply = async () => {
    if (!bulkFormCat && !bulkFormType) return;
    setBulkSubmitting(true);
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) => {
          const tx = transactions?.find((t) => t.id === id);
          if (!tx) return Promise.resolve();
          return updateTx.mutateAsync({
            id,
            data: {
              date: tx.date,
              description: tx.description ?? "",
              type: (bulkFormType || tx.type) as TxType,
              category: bulkFormCat || tx.category || "",
              nativeAmount: tx.nativeAmount,
              currency: tx.currency,
            },
          });
        })
      );
      await invalidate();
      setSelectedIds(new Set());
      setBulkFormCat("");
      setBulkFormType("");
      toast({ title: `Updated ${ids.length} transaction${ids.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Failed to update some transactions", variant: "destructive" });
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── note helpers ─────────────────────────────────────────────────────────
  const saveNote = (id: number, text: string) => {
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      try { localStorage.setItem("ft-tx-notes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const clearNote = (id: number) => {
    setNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      try { localStorage.setItem("ft-tx-notes", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // ── tag helpers ──────────────────────────────────────────────────────────
  const addTag = (id: number, tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    setTags((prev) => {
      const existing = prev[id] ?? [];
      if (existing.includes(trimmed)) return prev;
      const next = { ...prev, [id]: [...existing, trimmed] };
      try { localStorage.setItem("ft-tx-tags", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const removeTag = (id: number, tag: string) => {
    setTags((prev) => {
      const existing = prev[id] ?? [];
      const next = { ...prev, [id]: existing.filter((t) => t !== tag) };
      if (next[id].length === 0) delete next[id];
      try { localStorage.setItem("ft-tx-tags", JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // All unique tags across all transactions for autocomplete
  const allTagSuggestions = [...new Set(Object.values(tags).flat())].sort();

  // Everything TxRow needs that is not the transaction itself. Bundled so the
  // three call sites (flat, day-grouped, merchant-grouped) cannot drift apart,
  // and so adding a row capability is one edit rather than four.
  const txRowProps = {
    notes, tags, selectedIds, pendingDeleteIds,
    toggleSelect, openDetail: setDetailTx,
  };

  // ── split submit ─────────────────────────────────────────────────────────
  const handleSplitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (splitTxId === null) return;
    const tx = transactions?.find((t) => t.id === splitTxId);
    if (!tx) return;
    setSplitSubmitting(true);
    try {
      const [first, ...rest] = splitLines;
      await updateTx.mutateAsync({
        id: splitTxId,
        data: {
          date: tx.date,
          description: tx.description,
          type: tx.type,
          category: first.category,
          nativeAmount: tx.type === "income" ? parseFloat(first.amount) : -parseFloat(first.amount),
          currency: tx.currency,
        },
      });
      await Promise.all(
        rest.map((line) =>
          createTx.mutateAsync({
            data: {
              date: tx.date,
              description: `[Split] ${tx.description}`,
              type: tx.type,
              category: line.category,
              accountId: tx.accountId,
              nativeAmount: tx.type === "income" ? parseFloat(line.amount) : -parseFloat(line.amount),
              currency: tx.currency,
            },
          })
        )
      );
      invalidate();
      setSplitTxId(null);
      toast({ title: "Transaction split successfully" });
    } catch {
      toast({ title: "Failed to split transaction", variant: "destructive" });
    } finally {
      setSplitSubmitting(false);
    }
  };

  const setField = <K extends keyof TxForm>(k: K, v: TxForm[K]) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "description" && typeof v === "string") {
        const suggested = applyAutoCategory(v);
        if (suggested && !f.category) {
          setAutoCatFilled(true);
          return { ...next, category: suggested };
        }
      }
      if (k === "category") {
        setAutoCatFilled(false);
      }
      return next;
    });
  };

  const applyTemplate = (t: TxTemplate) => {
    setAutoCatFilled(false);
    setForm((f) => ({
      ...f,
      type: t.type as TxForm["type"],
      category: t.category,
      description: t.description,
      currency: t.currency as TxForm["currency"],
    }));
  };

  const handleSaveTemplate = () => {
    if (!form.description) return;
    const name = form.description.trim().slice(0, 40);
    const t: TxTemplate = {
      id: crypto.randomUUID(),
      name,
      type: form.type,
      category: form.category,
      description: form.description,
      currency: form.currency,
    };
    saveTemplate(t);
    setTemplates(loadTemplates());
    toast({ title: `Template "${name}" saved` });
  };

  const handleDeleteTemplate = (id: string) => {
    deleteTemplate(id);
    setTemplates(loadTemplates());
  };

  // ── AI batch categorize ──────────────────────────────────────────────────
  const uncategorizedTxs = (transactions ?? []).filter((tx) => {
    const cat = (tx.category ?? "").trim();
    return !cat || cat === "Other" || cat === "Uncategorized";
  });

  const handleAiCategorize = async () => {
    if (uncategorizedTxs.length === 0) return;
    setAiCatRunning(true);
    setAiCatConfirmOpen(false);

    const CHUNK = 50;
    let categorized = 0;
    let failed = 0;

    try {
      for (let i = 0; i < uncategorizedTxs.length; i += CHUNK) {
        const batch = uncategorizedTxs.slice(i, i + CHUNK).map((tx) => ({
          id: tx.id,
          description: tx.description,
          amount: Math.abs(tx.nativeAmount),
          type: tx.type,
        }));

        let suggestions: Array<{ id: number; category: string }> = [];
        try {
          const res = await apiFetch("/api/ai/batch-categorize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactions: batch }),
          });
          if (res.ok) {
            const data = (await res.json()) as { suggestions?: Array<{ id: number; category: string }> };
            suggestions = data.suggestions ?? [];
          } else {
            failed += batch.length;
            continue;
          }
        } catch {
          failed += batch.length;
          continue;
        }

        await Promise.all(
          suggestions.map(async ({ id, category }) => {
            const tx = transactions?.find((t) => t.id === id);
            if (!tx) return;
            try {
              await updateTx.mutateAsync({
                id,
                data: {
                  date: tx.date,
                  description: tx.description ?? "",
                  type: tx.type as TxType,
                  category,
                  nativeAmount: tx.nativeAmount,
                  currency: tx.currency,
                },
              });
              categorized++;
            } catch {
              failed++;
            }
          })
        );
      }

      await invalidate();

      if (failed === 0) {
        toast({ title: `${categorized} transaction${categorized !== 1 ? "s" : ""} categorized` });
      } else {
        toast({ title: `${categorized} categorized, ${failed} failed`, variant: "destructive" });
      }
    } catch {
      toast({ title: "AI categorize failed", variant: "destructive" });
    } finally {
      setAiCatRunning(false);
    }
  };

  // ── keyboard navigation handler ──────────────────────────────────────────
  const handleTableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const visibleRows = groupByDay
        ? visibleDayGroups.flatMap((g) => g.txs)
        : groupByMerchant
        ? []
        : visibleFiltered;

      if (visibleRows.length === 0) return;

      const inInput = () => {
        const t = document.activeElement?.tagName;
        return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
      };

      if (e.key === "ArrowDown" || (e.key === "j" && !inInput())) {
        e.preventDefault();
        setSelectedRowIndex((prev) =>
          prev === null ? 0 : Math.min(prev + 1, visibleRows.length - 1)
        );
      } else if (e.key === "ArrowUp" || (e.key === "k" && !inInput())) {
        e.preventDefault();
        setSelectedRowIndex((prev) =>
          prev === null ? 0 : Math.max(prev - 1, 0)
        );
      } else if (e.key === "Escape") {
        setSelectedRowIndex(null);
      } else if (e.key === "Enter" && selectedRowIndex !== null) {
        e.preventDefault();
        const tx = visibleRows[selectedRowIndex];
        if (tx) setDetailTx(tx);
      }
    },
    [visibleFiltered, visibleDayGroups, groupByDay, groupByMerchant, selectedRowIndex]
  );

  if (isLoading || isSummaryLoading) {
    return (
      <VStack gap={6}>
        {/* KPI bar skeleton */}
        <div className="ft-scroll-x">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", minWidth: 640 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)" }}>
                <FtSkeleton width="50%" height={8} />
                <div style={{ marginTop: 8 }}><FtSkeleton width="70%" height={18} /></div>
                <div style={{ marginTop: 5 }}><FtSkeleton width="40%" height={8} /></div>
              </div>
            ))}
          </div>
        </div>
        {/* Filter bar skeleton */}
        <div>
          <div style={{ display: "flex", height: 28, alignItems: "center", gap: 0, borderBottom: "1px solid var(--ft-border)" }}>
            {[80, 120, 100, 120, 80, 80, 60].map((w, i) => (
              <div key={i} style={{ width: w, padding: "0 10px", borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="80%" height={9} />
              </div>
            ))}
          </div>
          <HStack align="center" height={26}>
            {[80, 60, 60, 60, 60, 60, 60, 120, 120, 80, 80].map((w, i) => (
              <div key={i} style={{ width: w, padding: "0 8px", borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="80%" height={8} />
              </div>
            ))}
          </HStack>
        </div>
        {/* Table skeleton */}
        <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
          <div style={{ display: "flex", minHeight: "var(--ft-panel-header-h)", alignItems: "center", borderBottom: "1px solid var(--ft-border)", padding: "0 12px" }}>
            <FtSkeleton width={160} height={10} />
          </div>
          {/* Column headers skeleton */}
          <div style={{ display: "flex", height: 28, background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)" }}>
            {[36, 90, 240, 120, 150, 90, 130, 110, 36, 36, 128].map((w, i) => (
              <div key={i} style={{ width: w, minWidth: w, borderRight: "1px solid var(--ft-border)", padding: "0 10px", display: "flex", alignItems: "center" }}>
                <FtSkeleton width="60%" height={8} />
              </div>
            ))}
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ display: "flex", borderBottom: "1px solid var(--ft-border)", height: 32, alignItems: "center" }}>
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FtSkeleton width={12} height={12} />
              </div>
              <div style={{ width: 90, minWidth: 90, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={70} height={10} /></div>
              <div style={{ flex: 1, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width="55%" height={11} /></div>
              <div style={{ width: 120, minWidth: 120, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={60} height={10} /></div>
              <div style={{ width: 150, minWidth: 150, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={90} height={10} /></div>
              <div style={{ width: 90, minWidth: 90, borderRight: "1px solid var(--ft-border)", padding: "0 12px" }}><FtSkeleton width={50} height={10} /></div>
              <div style={{ width: 130, minWidth: 130, borderRight: "1px solid var(--ft-border)", padding: "0 12px", display: "flex", justifyContent: "flex-end" }}><FtSkeleton width={70} height={11} /></div>
              <div style={{ width: 110, minWidth: 110, borderRight: "1px solid var(--ft-border)", padding: "0 12px", display: "flex", justifyContent: "flex-end" }}><FtSkeleton width={60} height={11} /></div>
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
              <div style={{ width: 36, minWidth: 36, borderRight: "1px solid var(--ft-border)" }} />
              <div style={{ width: 128, minWidth: 128, padding: "0 8px" }}><FtSkeleton width={80} height={10} /></div>
            </div>
          ))}
        </div>
      </VStack>
    );
  }

  if (isError) {
    return (
      <div className="space-y-1.5">
        <ErrorState message={(error as Error)?.message ?? "Could not load transactions. Check your connection and try again."} />
      </div>
    );
  }

  // ── split modal data ────────────────────────────────────────────────────
  const splitTx = splitTxId !== null ? transactions?.find((t) => t.id === splitTxId) : null;
  const splitTotal = splitLines.reduce((acc, l) => acc + (parseFloat(l.amount) || 0), 0);
  const splitOriginal = splitTx ? Math.abs(splitTx.nativeAmount) : 0;
  const splitRemaining = parseFloat((splitOriginal - splitTotal).toFixed(2));

  // ── inline field blur/change validation ──────────────────────────────────
  const blurField = (field: keyof TxFormErrors, value: string, isEdit: boolean) => {
    const err = validateTxField(field, value, isEdit);
    setFormErrors((prev) => ({ ...prev, [field]: err }));
  };

  const clearFieldError = (field: keyof TxFormErrors) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const ERR_STYLE: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    color: "var(--ft-red)",
    marginTop: 2,
  };

  const errBorder = (field: keyof TxFormErrors): React.CSSProperties | undefined =>
    formErrors[field] ? { border: "1px solid var(--ft-red)" } : undefined;

  // ── shared form fields ───────────────────────────────────────────────────
  const FormFields = (isEdit: boolean) => (
    <div className="space-y-4">
      {!isEdit && templates.length > 0 && (
        <div>
          <Text as="div" upper size={9} color="var(--ft-dim)" letterSpacing="0.08em" mb={6}>Templates</Text>
          <HStack gap={4} wrap>
            {templates.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border2)",
                    borderRight: "none",
                    borderRadius: "2px 0 0 2px",
                    color: "var(--ft-muted)",
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(t.id)}
                  aria-label={`Delete template ${t.name}`}
                  style={{
                    fontSize: 10,
                    padding: "3px 5px",
                    background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border2)",
                    borderRadius: "0 2px 2px 0",
                    color: "var(--ft-dim)",
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </HStack>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tx-date">Date</Label>
          <Input
            id="tx-date"
            type="date"
            value={form.date}
            onChange={(e) => { setField("date", e.target.value); if (e.target.value) clearFieldError("date"); }}
            onBlur={(e) => blurField("date", e.target.value, isEdit)}
            required
            style={errBorder("date")}
          />
          {formErrors.date && <div style={ERR_STYLE}>{formErrors.date}</div>}
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setField("type", v as TxType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tx-desc">Description</Label>
        <HStack gap={6} align="center">
          <Input
            id="tx-desc"
            placeholder="e.g. Monthly Salary"
            value={form.description}
            onChange={(e) => { setField("description", e.target.value); if (e.target.value.trim()) clearFieldError("description"); }}
            onBlur={(e) => blurField("description", e.target.value, isEdit)}
            required
            style={{ flex: 1, ...errBorder("description") }}
          />
          {!isEdit && form.description && (
            <button
              type="button"
              onClick={handleSaveTemplate}
              title="Save as template"
              style={{ flexShrink: 0, background: "none", border: "1px solid var(--ft-border2)", borderRadius: 2, padding: "4px 6px", cursor: "pointer", color: "var(--ft-muted)" }}
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}
        </HStack>
        {formErrors.description && <div style={ERR_STYLE}>{formErrors.description}</div>}
      </div>
      <div className="space-y-1.5">
        <HStack gap={6} align="center">
          <Label htmlFor="tx-cat">Category</Label>
          {autoCatFilled && (
            <span
              style={{
                fontSize: 9,
                padding: "1px 5px",
                background: "color-mix(in srgb, var(--ft-cyan) 12%, transparent)",
                border: "1px solid var(--ft-cyan)",
                borderRadius: 2,
                color: "var(--ft-cyan)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
              onClick={() => { setField("category", ""); setAutoCatFilled(false); }}
              title="Auto-filled — click to clear"
            >
              auto ×
            </span>
          )}
        </HStack>
        <Input
          id="tx-cat"
          list="tx-categories"
          placeholder="e.g. Groceries, Salary…"
          value={form.category}
          onChange={(e) => { setField("category", e.target.value); if (e.target.value.trim()) clearFieldError("category"); }}
          onBlur={(e) => blurField("category", e.target.value, isEdit)}
          required
          style={errBorder("category")}
        />
        {formErrors.category && <div style={ERR_STYLE}>{formErrors.category}</div>}
      </div>
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>Account</Label>
          <Select value={form.accountId} onValueChange={(v) => {
            const acct = accounts?.find((a) => String(a.id) === v);
            setForm((f) => ({ ...f, accountId: v, currency: (acct?.currency as Currency) ?? f.currency }));
            if (v) clearFieldError("accountId");
          }}>
            <SelectTrigger style={errBorder("accountId")}>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name} ({a.currency})</SelectItem>)}
            </SelectContent>
          </Select>
          {formErrors.accountId && <div style={ERR_STYLE}>{formErrors.accountId}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tx-amount">Amount</Label>
          <Input
            id="tx-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.nativeAmount}
            onChange={(e) => {
              setField("nativeAmount", e.target.value);
              const err = validateTxField("nativeAmount", e.target.value, isEdit);
              setFormErrors((prev) => ({ ...prev, nativeAmount: err }));
            }}
            onBlur={(e) => blurField("nativeAmount", e.target.value, isEdit)}
            required
            style={errBorder("nativeAmount")}
          />
          {formErrors.nativeAmount && <div style={ERR_STYLE}>{formErrors.nativeAmount}</div>}
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => setField("currency", v as Currency)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["GBP","USD","EUR","MYR","CNY","JPY","AUD","CAD","SGD","HKD","THB","INR"] as Currency[]).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );



  // ── Derived KPI data ─────────────────────────────────────────────────────
  // Skip unconvertible transactions from all four KPIs; kpiUnconvertible
  // surfaces the count so the strip can say "N tx without FX".
  const kpiIncome = filtered.reduce((acc, tx) => acc + (tx.type === "income" && tx.baseEquivalent != null ? tx.baseEquivalent : 0), 0);
  const kpiExpenses = filtered.reduce((acc, tx) => acc + (tx.type === "expense" && tx.baseEquivalent != null ? Math.abs(tx.baseEquivalent) : 0), 0);
  const kpiNet = kpiIncome - kpiExpenses;
  const filteredWithGbp = filtered.filter((tx): tx is typeof tx & { baseEquivalent: number } => tx.baseEquivalent != null);
  // The average is over the convertible rows only, so its render must be
  // gated on those — gating on filtered.length let an all-unconvertible
  // filter print a £0.00 average over a set it never measured.
  const kpiAvg: number | null =
    filteredWithGbp.length > 0
      ? filteredWithGbp.reduce((acc, tx) => acc + Math.abs(tx.baseEquivalent), 0) / filteredWithGbp.length
      : null;
  const kpiUnconvertible = filtered.length - filteredWithGbp.length;
  const kpiDateFrom = filtered.length > 0 ? filtered.reduce((a, b) => a.date < b.date ? a : b).date : null;
  const kpiDateTo = filtered.length > 0 ? filtered.reduce((a, b) => a.date > b.date ? a : b).date : null;

  return (
    <VStack gap={6}>
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onSuccess={() => { invalidate(); setCsvOpen(false); }}
      />

      <datalist id="tx-categories">
        {CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* ── Add dialog ── */}
      <MobileSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Transaction"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" form="add-tx-form" disabled={submitting}>{submitting ? "Adding…" : "Add Transaction"}</Button>
          </>
        }
      >
        <form id="add-tx-form" onSubmit={handleAdd}>
          {FormFields(false)}
        </form>
      </MobileSheet>

      {/* ── Edit dialog ── */}
      <MobileSheet
        open={editId !== null}
        onOpenChange={(o) => !o && setEditId(null)}
        title="Edit Transaction"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button type="submit" form="edit-tx-form" disabled={submitting}>{submitting ? "Saving…" : "Save Changes"}</Button>
          </>
        }
      >
        <form id="edit-tx-form" onSubmit={handleEdit}>
          {FormFields(true)}
        </form>
      </MobileSheet>

      {/* ── Split dialog ── */}
      <Dialog open={splitTxId !== null} onOpenChange={(o) => !o && setSplitTxId(null)}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>Split Transaction</DialogTitle></DialogHeader>
          {splitTx && (
            <form onSubmit={handleSplitSubmit}>
              <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--ft-dim)", marginBottom: 4 }}>ORIGINAL TRANSACTION</div>
                <HStack align="center" justify="between">
                  <div>
                    <div style={{ fontSize: 13, color: "var(--ft-text)", fontWeight: 600 }}>{splitTx.description}</div>
                    <Text as="div" size={11} color="var(--ft-muted)" mt={2}>{formatDate(splitTx.date)} · {splitTx.category}</Text>
                  </div>
                  <Text as="div" size={14} weight={700} color={splitTx.type === "income" ? "var(--ft-green)" : "var(--ft-red)"} numeric>
                    {formatNative(Math.abs(splitTx.nativeAmount), splitTx.currency)}
                  </Text>
                </HStack>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--ft-dim)", marginBottom: 8, letterSpacing: "0.4px", textTransform: "uppercase" }}>Split Lines</div>
                <div className="space-y-2">
                  {splitLines.map((line, idx) => (
                    <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Input
                        list="tx-categories"
                        placeholder="Category"
                        value={line.category}
                        onChange={(e) => setSplitLines((prev) => prev.map((l) => l.id === line.id ? { ...l, category: e.target.value } : l))}
                        required
                        style={{ flex: 1, fontSize: 12, height: 32, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)" }}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={line.amount}
                        onChange={(e) => setSplitLines((prev) => prev.map((l) => l.id === line.id ? { ...l, amount: e.target.value } : l))}
                        required
                        style={{ width: 100, fontSize: 12, height: 32, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-text)", textAlign: "right" }}
                      />
                      {splitLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setSplitLines((prev) => prev.filter((l) => l.id !== line.id))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", padding: "0 4px", fontSize: 14, lineHeight: 1 }}
                          aria-label={`Remove split line ${idx + 1}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>
                  Total split: <Text as="span" color="var(--ft-text)" numeric>{splitTx.currency} {splitTotal.toFixed(2)}</Text>
                </div>
                <Text as="div" size={11} color={splitRemaining === 0 ? "var(--ft-green)" : splitRemaining < 0 ? "var(--ft-red)" : "var(--ft-amber)"}>
                  {splitRemaining === 0 ? "Balanced" : splitRemaining > 0 ? `Remaining: ${splitTx.currency} ${splitRemaining.toFixed(2)}` : `Over by: ${splitTx.currency} ${Math.abs(splitRemaining).toFixed(2)}`}
                </Text>
              </div>

              <button
                type="button"
                onClick={() => setSplitLines((prev) => [...prev, { id: crypto.randomUUID(), category: "", amount: "" }])}
                style={{ background: "none", border: "1px dashed var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", fontSize: 11, cursor: "pointer", padding: "5px 10px", marginBottom: 16, width: "100%" }}
              >
                + Add line
              </button>

              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button
                  type="submit"
                  disabled={splitSubmitting || splitRemaining !== 0}
                  title={splitRemaining !== 0 ? "Split amounts must sum to original" : undefined}
                >
                  {splitSubmitting ? "Splitting…" : "Split Transaction"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI Categorize confirmation modal ── */}
      <Dialog open={aiCatConfirmOpen} onOpenChange={setAiCatConfirmOpen}>
        <DialogContent style={{ maxWidth: 420 }}>
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles className="w-4 h-4" style={{ color: "var(--ft-amber)" }} />
              AI Auto-Categorize
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding: "8px 0 16px" }}>
            {uncategorizedTxs.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ft-muted)" }}>
                All transactions already have categories assigned.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ft-muted)", lineHeight: 1.6 }}>
                Found <Text as="span" weight={700} color="var(--ft-amber)">{uncategorizedTxs.length}</Text>{" "}
                transaction{uncategorizedTxs.length !== 1 ? "s" : ""} without a category.
                Use AI to suggest categories for all of them?
              </p>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--ft-dim)", fontFamily: "var(--font-sans)" }}>
              Categories: Food & Drink, Transport, Shopping, Entertainment, Bills & Utilities, Health, Travel, Income, Savings, Other
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={uncategorizedTxs.length === 0}
              onClick={handleAiCategorize}
              style={{ background: "var(--ft-amber)", color: "var(--ft-base)", border: "none", borderRadius: 2, fontWeight: 700 }}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── KPI bar — Bloomberg-style 6-cell strip (desktop only) ── */}
      <div className="ft-hide-mobile">
        <div className="ft-kpi-bar" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {/* TX COUNT */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TX COUNT</div>
            <Text as="div" mono size={16} weight={700} color="var(--ft-text)" lineHeight={1} numeric>
              {filtered.length}
            </Text>
            {hasFilters && (
              <Text as="div" mono size={10} color="var(--ft-muted)">
                of {transactions?.length ?? 0}
              </Text>
            )}
          </div>
          {/* TOTAL IN */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TOTAL IN</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiIncome > 0 ? "var(--ft-green)" : "var(--ft-muted)", lineHeight: 1 }}>
              {formatBaseMoney(kpiIncome)}
            </div>
            {kpiUnconvertible > 0
              ? <Text as="div" size={10} color="var(--ft-amber)" letterSpacing="0.04em">income · <span className="pnum">{kpiUnconvertible}</span> tx no FX</Text>
              : <Text as="div" size={10} color="var(--ft-dim)" letterSpacing="0.04em">income</Text>}
          </div>
          {/* TOTAL OUT */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>TOTAL OUT</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiExpenses > 0 ? "var(--ft-red)" : "var(--ft-muted)", lineHeight: 1 }}>
              {formatBaseMoney(kpiExpenses)}
            </div>
            <Text as="div" size={10} color="var(--ft-dim)" letterSpacing="0.04em">expenses</Text>
          </div>
          {/* NET */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>NET</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: kpiNet !== 0 ? (kpiNet >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", lineHeight: 1 }}>
              {kpiNet >= 0 ? "+" : "−"}{formatBaseMoney(Math.abs(kpiNet))}
            </div>
            <div style={{ fontSize: 10, fontFamily: "var(--font-sans)", color: kpiNet !== 0 ? (kpiNet >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", letterSpacing: "0.04em" }}>
              {kpiNet > 0 ? "▲ surplus" : kpiNet < 0 ? "▼ deficit" : "net"}
            </div>
          </div>
          {/* AVG / TX */}
          <div style={{ padding: "10px 14px", borderRight: "1px solid var(--ft-border)", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>AVG / TX</div>
            <div className="pnum" style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "var(--ft-text)", lineHeight: 1 }}>
              {kpiAvg == null ? "—" : formatBaseMoney(kpiAvg)}
            </div>
            <Text as="div" size={10} color="var(--ft-dim)" letterSpacing="0.04em">per transaction</Text>
          </div>
          {/* DATE RANGE + ACTIONS */}
          <VStack gap={3} padding="10px 14px">
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ft-dim)" }}>DATE RANGE</div>
            <Text as="div" mono size={11} color="var(--ft-muted)" lineHeight={1.4} numeric>
              {kpiDateFrom && kpiDateTo
                ? kpiDateFrom === kpiDateTo
                  ? kpiDateFrom
                  : `${kpiDateFrom} → ${kpiDateTo}`
                : "—"}
            </Text>
            {/* Action buttons stacked — hidden on mobile (use FAB instead) */}
            <div className="ft-hide-mobile" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              <button
                type="button"
                onClick={openAdd}
                style={{ height: 20, padding: "0 8px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "var(--ft-accent)", border: "1px solid var(--ft-accent)", borderRadius: 2, color: "var(--ft-base)", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                + ADD
              </button>
              <button
                type="button"
                onClick={() => exportCsv(filtered)}
                style={{ height: 20, padding: "0 7px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                ↓ CSV
              </button>
              <button
                type="button"
                onClick={() => setCsvOpen(true)}
                style={{ height: 20, padding: "0 7px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-muted)", cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                ↑ CSV
              </button>
              <button
                type="button"
                onClick={() => setAiCatConfirmOpen(true)}
                disabled={aiCatRunning}
                style={{ height: 20, padding: "0 7px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "transparent", border: `1px solid ${aiCatRunning ? "var(--ft-border)" : "var(--ft-amber)"}`, borderRadius: 2, color: aiCatRunning ? "var(--ft-dim)" : "var(--ft-amber)", cursor: aiCatRunning ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const }}
              >
                {aiCatRunning ? "AI…" : "AI CAT"}
              </button>
            </div>
          </VStack>
        </div>
      </div>

      {/* Persona context strip */}
      {(() => {
        const pid = loadPersonaIds()[0];
        if (!pid || pid === "full") return null;
        const sr = summary?.savingsRate;
        const msgs: Record<string, string | null> = {
          budget:  `Categorize every transaction for accurate budget tracking. Use the AI Categorize button to auto-tag uncategorized entries in bulk.`,
          market:  sr != null ? `Savings rate this month: ${sr.toFixed(1)}%. Track income transactions to identify your investable surplus after all expenses.` : `Ensure income transactions are correctly typed to accurately calculate your investable surplus.`,
          wealth:  sr != null && sr >= 20 ? `${sr.toFixed(1)}% savings rate this month — solid wealth accumulation pace. Keep categorization clean for accurate FIRE progress tracking.` : `Clean categorization feeds accurate analytics and cashflow projections — key inputs for your FIRE timeline.`,
          social:  `Tag shared expenses with the correct category so Bill Split and Group Split can identify them automatically.`,
        };
        const msg = msgs[pid];
        if (!msg) return null;
        const color = PERSONA_COLORS[pid as keyof typeof PERSONA_COLORS] ?? "var(--ft-accent)";
        return (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--ft-dim)", border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "7px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>·</span>
            <span>{msg}</span>
          </div>
        );
      })()}

      {isSummaryError && !isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Summary unavailable</AlertTitle>
          <AlertDescription>Could not load the transaction summary. Transactions are still shown below.</AlertDescription>
        </Alert>
      )}


      {/* ── Desktop filter bar — compact single-row terminal style ── */}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)", padding: "0 10px" }}>
        {/* Single always-visible row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", flexWrap: "wrap" as const }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "0 0 200px" }}>
            <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ft-dim)", pointerEvents: "none" }} />
            <input
              ref={searchInputRef}
              placeholder="search…  ( / )"
              value={search}
              onChange={(e) => patchFilters({ q: e.target.value })}
              className="ft-filter-input"
              style={{ width: "100%", paddingLeft: 26, paddingRight: 8, height: 26, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ft-text)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none", boxSizing: "border-box" as const }}
            />
          </div>
          {/* One type control and one period control.
              Before this there were ten chips here, two of them labelled ALL
              — one meaning "any type", one meaning "any date". Two identical
              words a few pixels apart, each the default state of a different
              axis, which is a control that reads as a choice and is really
              just "off". A select says which axis it belongs to and shows the
              current value without spending a chip on every alternative. */}
          <select
            value={filterType}
            onChange={(e) => patchFilters({ type: e.target.value as LedgerFilters["type"] })}
            aria-label="Transaction type"
            style={{ height: 26, padding: "0 8px", fontFamily: "var(--font-sans)", fontSize: 11, cursor: "pointer", border: "1px solid", borderColor: filterType !== "all" ? "var(--ft-accent)" : "var(--ft-border2)", background: filterType !== "all" ? "color-mix(in srgb, var(--ft-accent) 12%, transparent)" : "var(--ft-raised)", color: filterType !== "all" ? "var(--ft-accent)" : "var(--ft-muted)" }}
          >
            <option value="all">ALL TYPES</option>
            <option value="income">INCOME</option>
            <option value="expense">EXPENSE</option>
            <option value="transfer">TRANSFER</option>
          </select>
          <select
            value={activeQuickRange ?? "custom"}
            onChange={(e) => {
              const v = e.target.value;
              // "Custom" is not a range to apply — it is where the range
              // already is, and the two date inputs that own it live in the
              // panel. Selecting it opens that panel rather than silently
              // doing nothing, which is the defect this whole task is about.
              if (v === "custom") { setFilterPanelOpen(true); return; }
              applyQuickRange(v as QuickRange);
            }}
            aria-label="Period"
            style={{ height: 26, padding: "0 8px", fontFamily: "var(--font-sans)", fontSize: 11, cursor: "pointer", border: "1px solid", borderColor: activeQuickRange === "all" ? "var(--ft-border2)" : "var(--ft-accent)", background: activeQuickRange === "all" ? "var(--ft-raised)" : "color-mix(in srgb, var(--ft-accent) 12%, transparent)", color: activeQuickRange === "all" ? "var(--ft-muted)" : "var(--ft-accent)" }}
          >
            {(Object.keys(QUICK_RANGE_LABEL) as QuickRange[]).map((k) => (
              <option key={k} value={k}>{QUICK_RANGE_LABEL[k].toUpperCase()}</option>
            ))}
            <option value="custom">CUSTOM…</option>
          </select>
          {/* Sort */}
          <select
            aria-label="Sort order"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{ height: 26, padding: "0 6px", fontFamily: "var(--font-sans)", fontSize: 9, color: "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", cursor: "pointer" }}
          >
            <option value="date-desc">DATE ↓</option>
            <option value="date-asc">DATE ↑</option>
            <option value="amount-high">AMOUNT ↓</option>
            <option value="amount-low">AMOUNT ↑</option>
          </select>
          {/* Filters toggle */}
          <button
            type="button"
            onClick={() => setFilterPanelOpen(o => !o)}
            style={{
              height: 26,
              padding: "0 10px",
              fontFamily: "var(--font-sans)",
              fontSize: 10,
              letterSpacing: "0.04em",
              cursor: "pointer",
              border: "1px solid",
              borderColor: filterPanelOpen ? "var(--ft-accent)" : "var(--ft-border2)",
              background: filterPanelOpen ? "color-mix(in srgb, var(--ft-accent) 10%, transparent)" : "transparent",
              color: filterPanelOpen ? "var(--ft-accent)" : "var(--ft-muted)",
              display: "flex",
              alignItems: "center",
              gap: 5,
              textTransform: "uppercase" as const,
            }}
          >
            <SlidersHorizontal style={{ width: 10, height: 10 }} />
            FILTERS{activeFilterCount > 0 ? ` ·${activeFilterCount}` : ""}
          </button>
          {/* Clear */}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setFilters(NO_FILTERS); setSortBy("date-desc"); }}
              style={{ height: 26, padding: "0 10px", fontFamily: "var(--font-sans)", fontSize: 9, letterSpacing: "0.08em", cursor: "pointer", border: "1px solid var(--ft-border2)", background: "transparent", color: "var(--ft-red)" }}
              aria-label="Clear all filters"
            >
              CLR
            </button>
          )}
        </div>
        {/* Active chips — one per active field, off the same list the count
            and `hasFilters` are derived from, so the row can never show four
            chips beside a badge reading 5. Shown only when the panel is
            closed; the panel shows the controls themselves. */}
        {!filterPanelOpen && activeFilterCount > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, paddingBottom: 6 }}>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => patchFilters(f.cleared)}
                aria-label={`Clear the ${f.key} filter`}
                style={{ height: 20, padding: "0 8px", fontFamily: "var(--font-sans)", fontSize: 9, border: "1px solid var(--ft-accent)", background: "color-mix(in srgb, var(--ft-accent) 10%, transparent)", color: "var(--ft-accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                {f.label(filters)} ×
              </button>
            ))}
          </div>
        )}
        {/* Expanded filter panel */}
        {filterPanelOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.5fr 1fr", gap: 12, padding: "8px 0 10px", borderTop: "1px solid var(--ft-border2)" }}>
            {/* Category */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ft-dim)", textTransform: "uppercase" as const }}>CATEGORY</span>
              <select value={filterCategory} onChange={(e) => patchFilters({ category: e.target.value })} style={{ height: 26, padding: "0 6px", fontFamily: "var(--font-sans)", fontSize: 10, color: filterCategory !== "all" ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)" }}>
                <option value="all">all</option>
                {(allCategories as string[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Account */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ft-dim)", textTransform: "uppercase" as const }}>ACCOUNT</span>
              <select value={filterAccount} onChange={(e) => patchFilters({ account: e.target.value })} style={{ height: 26, padding: "0 6px", fontFamily: "var(--font-sans)", fontSize: 10, color: filterAccount !== "all" ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)" }}>
                <option value="all">all</option>
                {(allAccounts as string[]).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {/* Tag */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ft-dim)", textTransform: "uppercase" as const }}>TAG</span>
              <input
                type="text"
                value={filterTag}
                onChange={(e) => patchFilters({ tag: e.target.value })}
                placeholder="#tag"
                className="ft-filter-input"
                style={{ height: 26, padding: "0 8px", fontFamily: "var(--font-sans)", fontSize: 10, color: filterTag ? "var(--ft-amber)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none" }}
              />
            </div>
            {/* Date range */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ft-dim)", textTransform: "uppercase" as const }}>DATE RANGE</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="date" value={filterDateFrom} onChange={(e) => patchFilters({ from: e.target.value })} style={{ flex: 1, height: 26, padding: "0 4px", fontFamily: "var(--font-mono)", fontSize: 9, color: filterDateFrom ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none" }} />
                <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>–</span>
                <input type="date" value={filterDateTo} onChange={(e) => patchFilters({ to: e.target.value })} style={{ flex: 1, height: 26, padding: "0 4px", fontFamily: "var(--font-mono)", fontSize: 9, color: filterDateTo ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => applyQuickRange("lastmonth")} style={{ height: 20, padding: "0 6px", fontFamily: "var(--font-sans)", fontSize: 9, border: "1px solid var(--ft-border2)", background: "transparent", color: "var(--ft-dim)", cursor: "pointer", textTransform: "uppercase" as const }}>LAST MO</button>
                <button type="button" onClick={() => applyQuickRange("3m")} style={{ height: 20, padding: "0 6px", fontFamily: "var(--font-sans)", fontSize: 9, border: "1px solid var(--ft-border2)", background: "transparent", color: "var(--ft-dim)", cursor: "pointer", textTransform: "uppercase" as const }}>3M</button>
              </div>
            </div>
            {/* Amount */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ft-dim)", textTransform: "uppercase" as const }}>AMOUNT</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="number" value={amountMin} onChange={(e) => patchFilters({ amountMin: e.target.value })} placeholder="min" min="0" step="0.01" style={{ flex: 1, height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: amountMin ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none", fontVariantNumeric: "tabular-nums" }} />
                <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>–</span>
                <input type="number" value={amountMax} onChange={(e) => patchFilters({ amountMax: e.target.value })} placeholder="max" min="0" step="0.01" style={{ flex: 1, height: 26, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: amountMax ? "var(--ft-text)" : "var(--ft-muted)", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", outline: "none", fontVariantNumeric: "tabular-nums" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating bulk action bar (bottom-center) ── */}
      {selectedIds.size > 0 && (
        <div
          // Appears with a selection and leaves with it: ephemeral (DESIGN.md §6).
          className="ft-float"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 14px",
            fontFamily: "var(--font-sans)",
            maxWidth: "calc(100vw - 32px)",
            overflowX: "auto",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ft-blue)", fontWeight: 700, minWidth: 70 }}>
            <span className="pnum">{selectedIds.size}</span> selected
          </span>
          <div style={{ width: 1, height: 18, background: "var(--ft-border2)" }} />
          {/* Category dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={bulkFormCat}
              onChange={(e) => setBulkFormCat(e.target.value)}
              disabled={bulkSubmitting}
              style={{
                fontSize: 11,
                padding: "4px 8px",
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-border2)",
                borderRadius: 2,
                color: bulkFormCat ? "var(--ft-text)" : "var(--ft-dim)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                minWidth: 130,
              }}
            >
              <option value="">Category (unchanged)</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {BULK_CATEGORIES.filter((c) => !allCategories.includes(c)).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          {/* Type dropdown */}
          <select
            value={bulkFormType}
            onChange={(e) => setBulkFormType(e.target.value as "" | TxType)}
            disabled={bulkSubmitting}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              background: "var(--ft-surface)",
              border: "1px solid var(--ft-border2)",
              borderRadius: 2,
              color: bulkFormType ? "var(--ft-text)" : "var(--ft-dim)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              minWidth: 110,
            }}
          >
            <option value="">Type (unchanged)</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
          </select>
          {/* Apply */}
          <button
            type="button"
            onClick={handleBulkApply}
            disabled={bulkSubmitting || (!bulkFormCat && !bulkFormType)}
            style={{
              fontSize: 11,
              padding: "4px 14px",
              background: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "var(--ft-raised)" : "var(--ft-accent)",
              border: "1px solid var(--ft-accent)",
              borderRadius: 2,
              color: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "var(--ft-dim)" : "#000",
              cursor: bulkSubmitting || (!bulkFormCat && !bulkFormType) ? "not-allowed" : "pointer",
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
            }}
          >
            {bulkSubmitting ? "Applying…" : "Apply"}
          </button>
          <div style={{ width: 1, height: 18, background: "var(--ft-border2)" }} />
          {/* Delete */}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkSubmitting}
            style={{ fontSize: 11, padding: "4px 10px", background: "var(--ft-red)22", border: "1px solid var(--ft-red)", borderRadius: 2, color: "var(--ft-red)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            Delete
          </button>
          {/* Clear */}
          <button
            type="button"
            onClick={() => { setSelectedIds(new Set()); setBulkFormCat(""); setBulkFormType(""); }}
            style={{ fontSize: 11, padding: "4px 8px", background: "none", border: "none", color: "var(--ft-muted)", cursor: "pointer" }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Transaction ledger ──*/}
      <div style={{ border: "1px solid var(--ft-border)", background: "var(--ft-surface)" }}>
        <PanelHeader right={(
          <HStack gap={4}>
            {/* One lens, three exclusive positions. A segmented control says
                "these are the same question answered differently"; two
                checkboxes said "these are independent", which they never
                were. */}
            <HStack gap={0}>
              {(Object.keys(GROUPING_LABEL) as Grouping[]).map((g, i) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grouping === g}
                  onClick={() => { setGrouping(g); if (g === "merchant") setExpandedMerchants(new Set()); }}
                  style={{
                    height: 22,
                    padding: "0 9px",
                    fontSize: 10,
                    fontFamily: "var(--font-sans)",
                    letterSpacing: "0.04em",
                    background: grouping === g ? "color-mix(in srgb, var(--ft-blue) 12%, transparent)" : "transparent",
                    border: `1px solid ${grouping === g ? "var(--ft-blue)" : "var(--ft-border2)"}`,
                    borderLeftWidth: i === 0 ? 1 : 0,
                    color: grouping === g ? "var(--ft-blue)" : "var(--ft-dim)",
                    cursor: "pointer",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {GROUPING_LABEL[g]}
                </button>
              ))}
            </HStack>
            <button
              type="button"
              onClick={() => exportJson(filtered)}
              style={{ height: 22, padding: "0 8px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", whiteSpace: "nowrap" as const }}
            >
              ↓ JSON
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{ height: 22, padding: "0 8px", fontSize: 10, fontFamily: "var(--font-sans)", letterSpacing: "0.04em", background: "transparent", border: "1px solid var(--ft-border2)", borderRadius: 2, color: "var(--ft-dim)", cursor: "pointer", whiteSpace: "nowrap" as const }}
            >
              PDF
            </button>
          </HStack>
        )}>
          Transaction Ledger
          <Text as="span" mono size={10} color="var(--ft-dim)">
            {hasFilters ? `${filtered.length} of ${transactions?.length ?? 0}` : `${filtered.length} entries`}
          </Text>
        </PanelHeader>

        <div
          className="ft-scroll-x"
          ref={tableContainerRef}
          tabIndex={0}
          onKeyDown={handleTableKeyDown}
          style={{ outline: "none", "--tx-amount-w": amountColW } as React.CSSProperties}
          aria-label="Transaction table — use ↑↓ or j/k to navigate, Enter to open the transaction, Escape to clear"
        >
          {/* Column headers */}
          <div style={{ display: "flex", background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border2)", minWidth: 546 }}>
            <div style={{ ...TH, width: 36, minWidth: 36, justifyContent: "center", padding: "0", borderRight: "1px solid var(--ft-border)" }}>
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                style={{ cursor: "pointer", accentColor: "var(--ft-accent)" }}
                aria-label="Select all"
              />
            </div>
            {([
              ["DATE",        "90px",  "left",    ""],
              ["DESCRIPTION", "1",     "left",    ""],
              ["CATEGORY",    "120px", "left",    ""],
              ["ACCOUNT",     "150px", "left",    ""],
              ["AMOUNT",      "var(--tx-amount-w)", "right",   ""],
            ] as [string, string, string, string][]).map(([h, w, align, extraClass], i) => (
              <div
                key={`${h}-${i}`}
                className={extraClass || undefined}
                style={{
                  ...TH,
                  flex: w === "1" ? 1 : undefined,
                  width: w !== "1" ? w : undefined,
                  minWidth: w === "1" ? 0 : w,
                  flexShrink: w === "1" ? undefined : 0,
                  overflow: w === "1" ? "hidden" : undefined,
                  justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
                  padding: h === "" ? "0 3px" : "0 12px",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Rows — flat, grouped by day, or grouped by merchant */}
          {grouping === "none" && (
            <>
              {visibleFiltered.map((tx, idx) => <TxRow key={tx.id} tx={tx} isKeyboardSelected={selectedRowIndex === idx} {...txRowProps} />)}
              {filtered.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxLedgerEmpty openAdd={openAdd} />
              )}
              {hasMoreFlat && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "3px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderRadius: 2 }}
                  >
                    LOAD MORE · {visibleCount} of {filtered.length}
                  </button>
                </div>
              )}
            </>
          )}

          {groupByDay && (
            <>
              {(() => {
                let flatIdx = 0;
                return visibleDayGroups.map((group) => (
                  <div key={group.date}>
                    {(() => {
                      const gd = new Date(group.date + "T00:00:00");
                      const nowD = new Date(); nowD.setHours(0,0,0,0);
                      const yesD = new Date(nowD); yesD.setDate(nowD.getDate() - 1);
                      const isToday = gd.toDateString() === nowD.toDateString();
                      const isYesterday = gd.toDateString() === yesD.toDateString();
                      const mobileLabel = isToday ? "Today" : isYesterday ? "Yesterday" : gd.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                      const desktopLabel = gd.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
                      return (
                        <div style={{ display: "flex", alignItems: "center", background: "var(--ft-base)", borderBottom: "1px solid var(--ft-border)", padding: "4px 10px 4px 48px", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
                          <Text as="span" mono size={9} weight={700} color="var(--ft-dim)" letterSpacing="0.1em">
                            {desktopLabel}
                          </Text>
                          <Text as="span" size={10} color="var(--ft-dim)" letterSpacing="0.04em"><span className="pnum">{group.txs.length}</span> tx</Text>
                          <span className="pnum" style={{ fontSize: 9, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: group.net >= 0 ? "var(--ft-green)" : "var(--ft-red)", marginLeft: "auto", letterSpacing: "0.04em" }}>
                            {group.net >= 0 ? "+" : "−"}{formatBaseMoney(Math.abs(group.net))}
                          </span>
                        </div>
                      );
                    })()}

                    {group.txs.map((tx) => {
                      const rowIdx = flatIdx++;
                      return <TxRow key={tx.id} tx={tx} indented isKeyboardSelected={selectedRowIndex === rowIdx} {...txRowProps} />;
                    })}
                  </div>
                ));
              })()}
              {dayGroups.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxLedgerEmpty openAdd={openAdd} />
              )}
              {hasMoreDayGroups && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", borderBottom: "1px solid var(--ft-border)" }}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: "var(--ft-accent)", background: "none", border: "1px solid var(--ft-border2)", padding: "3px 14px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderRadius: 2 }}
                  >
                    LOAD MORE · {Math.min(visibleCount, filtered.length)} of {filtered.length}
                  </button>
                </div>
              )}
            </>
          )}

          {groupByMerchant && (
            <>
              {merchantGroups.map((group) => {
                const groupTxs = filtered.filter((tx) => tx.description === group.description);
                return (
                  <div key={group.description}>
                    <div
                      className="flex items-center"
                      style={{ borderBottom: "1px solid var(--ft-border)", background: "var(--ft-raised)", cursor: "pointer" }}
                      onClick={() => {
                        setExpandedMerchants((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.description)) next.delete(group.description);
                          else next.add(group.description);
                          return next;
                        });
                      }}
                    >
                      <div style={{ width: 36, minWidth: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid var(--ft-border)", alignSelf: "stretch", color: "var(--ft-accent)", fontSize: 9, fontFamily: "var(--font-mono)" }}>
                        {group.expanded ? "▼" : "▶"}
                      </div>
                      <div style={{ width: 90, minWidth: 90, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-dim)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                      <div style={{ flex: 1, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)", color: "var(--ft-text)", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.description
                          ? <Drill href={merchantTransactionsHref(group.description)} title={`Every ${group.description} transaction, across accounts and months`}><PrivDesc>{group.description}</PrivDesc></Drill>
                          : <PrivDesc>{group.description}</PrivDesc>}
                      </div>
                      <div style={{ width: 120, minWidth: 120, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }}>
                        <span style={{ fontSize: 10, padding: "0 5px", borderRadius: 2, border: "1px solid var(--ft-border2)", color: "var(--ft-muted)", fontFamily: "var(--font-sans)", lineHeight: "16px" }}>
                          <span className="pnum">{group.count}</span> tx
                        </span>
                      </div>
                      <div style={{ width: 150, minWidth: 150, padding: "var(--ft-cell-py) 12px", borderRight: "1px solid var(--ft-border)" }} />
                      <div className="pnum" style={{ width: "var(--tx-amount-w)", minWidth: "var(--tx-amount-w)", padding: "var(--ft-cell-py) 12px", textAlign: "right", color: group.total >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
                        {group.total >= 0 ? "+" : "−"}{formatBaseMoney(Math.abs(group.total))}
                      </div>
                    </div>

                    {group.expanded && groupTxs.map((tx) => <TxRow key={tx.id} tx={tx} indented {...txRowProps} />)}
                  </div>
                );
              })}

              {merchantGroups.length === 0 && (
                hasFilters
                  ? <EmptyState title="No matches" description="No transactions match the current filters." minHeight="calc(100vh - 260px)" />
                  : <TxLedgerEmpty openAdd={openAdd} />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── the detail surface a row opens ── */}
      {detailTx && (
        <TxDetailDialog
          tx={detailTx}
          note={notes[detailTx.id] ?? ""}
          txTags={tags[detailTx.id] ?? []}
          allTagSuggestions={allTagSuggestions}
          onClose={() => setDetailTx(null)}
          onEdit={() => { const id = detailTx.id; setDetailTx(null); openEdit(id); }}
          onSplit={() => { const id = detailTx.id; setDetailTx(null); openSplit(id); }}
          onDelete={() => { const id = detailTx.id; setDetailTx(null); handleDelete(id); }}
          onSaveNote={(text) => { saveNote(detailTx.id, text); setDetailTx(null); }}
          onClearNote={() => clearNote(detailTx.id)}
          onAddTag={(t) => addTag(detailTx.id, t)}
          onRemoveTag={(t) => removeTag(detailTx.id, t)}
        />
      )}
    </VStack>
  );
}
