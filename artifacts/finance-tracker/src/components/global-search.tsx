import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import {
  useListTransactions,
  useListAccounts,
  useListDebts,
} from "@workspace/api-client-react";
import { formatGbp, formatDate } from "@/lib/utils";

type ResultKind = "transaction" | "account" | "iou";

interface SearchResult {
  id: string;
  kind: ResultKind;
  primary: string;
  secondary: string;
  tertiary: string;
  amountColor?: string;
  navigateTo: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useGlobalSearch() {
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isEditable) return;

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return { open, openSearch, closeSearch };
}

const SECTION_ORDER: ResultKind[] = ["transaction", "account", "iou"];

const SECTION_LABELS: Record<ResultKind, string> = {
  transaction: "TRANSACTIONS",
  account: "ACCOUNTS",
  iou: "IOUs",
};

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query.trim().toLowerCase(), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transactions } = useListTransactions({} as any);
  const { data: accounts } = useListAccounts();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: debts } = useListDebts({} as any);

  const results: SearchResult[] = debouncedQuery
    ? [
        ...((transactions ?? [])
          .filter(
            (tx) =>
              tx.description.toLowerCase().includes(debouncedQuery) ||
              tx.category.toLowerCase().includes(debouncedQuery)
          )
          .slice(0, 5)
          .map((tx) => ({
            id: `tx-${tx.id}`,
            kind: "transaction" as ResultKind,
            primary: tx.description,
            secondary: tx.category,
            tertiary: `${formatDate(tx.date)} · ${tx.type === "income" ? "+" : "-"}${formatGbp(tx.gbpValue)}`,
            amountColor:
              tx.type === "income" ? "var(--ft-green)" : "var(--ft-red)",
            navigateTo: "/transactions",
          }))),
        ...((accounts ?? [])
          .filter((a) =>
            a.name.toLowerCase().includes(debouncedQuery)
          )
          .slice(0, 3)
          .map((a) => ({
            id: `acc-${a.id}`,
            kind: "account" as ResultKind,
            primary: a.name,
            secondary: a.currency,
            tertiary: formatGbp(a.balance),
            navigateTo: "/accounts",
          }))),
        ...((debts ?? [])
          .filter(
            (d) =>
              d.personName.toLowerCase().includes(debouncedQuery) ||
              d.description.toLowerCase().includes(debouncedQuery)
          )
          .slice(0, 3)
          .map((d) => ({
            id: `iou-${d.id}`,
            kind: "iou" as ResultKind,
            primary: d.personName,
            secondary: d.description,
            tertiary: formatGbp(d.gbpEquivalent),
            navigateTo: "/owing",
          }))),
      ]
    : [];

  const grouped = SECTION_ORDER.reduce<Record<ResultKind, SearchResult[]>>(
    (acc, kind) => {
      acc[kind] = results.filter((r) => r.kind === kind);
      return acc;
    },
    { transaction: [], account: [], iou: [] }
  );

  const flatResults = SECTION_ORDER.flatMap((k) => grouped[k]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const executeSelected = useCallback(() => {
    const result = flatResults[selectedIndex];
    if (!result) return;
    navigate(result.navigateTo);
    onClose();
  }, [flatResults, selectedIndex, navigate, onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, flatResults.length, executeSelected]);

  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLDivElement>(
      "[data-selected='true']"
    );
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = 0;
  const hasQuery = debouncedQuery.length > 0;
  const hasResults = flatResults.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 580,
          marginTop: 80,
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border2)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--ft-border)",
            background: "var(--ft-base)",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 14,
              display: "flex",
              alignItems: "center",
              color: "var(--ft-dim)",
              pointerEvents: "none",
            }}
          >
            <Search size={16} />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions, accounts, IOUs..."
            style={{
              flex: 1,
              height: 44,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--ft-text)",
              padding: "0 16px 0 44px",
              caretColor: "var(--ft-accent)",
            }}
          />
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 360,
            overflowY: "auto",
            padding: hasQuery ? "4px 0" : 0,
            scrollbarWidth: "none",
          }}
        >
          {!hasQuery && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ft-dim)",
              }}
            >
              Type to search transactions, accounts, and IOUs
            </div>
          )}

          {hasQuery && !hasResults && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--ft-dim)",
              }}
            >
              No results for '{query}'
            </div>
          )}

          {hasQuery &&
            hasResults &&
            SECTION_ORDER.map((kind) => {
              const sectionItems = grouped[kind];
              if (sectionItems.length === 0) return null;

              return (
                <div key={kind}>
                  <div
                    style={{
                      fontSize: 9,
                      fontFamily: "var(--font-mono)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--ft-dim)",
                      padding: "8px 12px 4px",
                      userSelect: "none",
                    }}
                  >
                    {SECTION_LABELS[kind]}
                  </div>

                  {sectionItems.map((result) => {
                    const itemIndex = flatIndex++;
                    const isSelected = itemIndex === selectedIndex;

                    return (
                      <ResultRow
                        key={result.id}
                        result={result}
                        isSelected={isSelected}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        onClick={() => {
                          navigate(result.navigateTo);
                          onClose();
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
        </div>

        {/* Footer hint */}
        <div
          style={{
            borderTop: "1px solid var(--ft-border)",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <HintItem keys="↑↓" label="navigate" />
          <HintItem keys="↵" label="open" />
          <HintItem keys="esc" label="close" />
        </div>
      </div>
    </div>
  );
}

type ResultRowProps = {
  result: SearchResult;
  isSelected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

function ResultRow({ result, isSelected, onMouseEnter, onClick }: ResultRowProps) {
  return (
    <div
      data-selected={isSelected ? "true" : "false"}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        cursor: "pointer",
        background: isSelected ? "var(--ft-raised)" : "transparent",
        borderLeft: isSelected
          ? "2px solid var(--ft-accent)"
          : "2px solid transparent",
        transition: "background 0.08s",
      }}
    >
      {/* Kind badge */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.06em",
          color: isSelected ? "var(--ft-accent)" : "var(--ft-dim)",
          background: isSelected
            ? "rgba(244,162,30,0.1)"
            : "var(--ft-base)",
          border: "1px solid",
          borderColor: isSelected ? "rgba(244,162,30,0.3)" : "var(--ft-border)",
          padding: "2px 5px",
          flexShrink: 0,
          minWidth: 28,
          textAlign: "center",
        }}
      >
        {result.kind === "transaction" ? "TX" : result.kind === "account" ? "ACC" : "IOU"}
      </span>

      {/* Primary label */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: isSelected ? "var(--ft-text)" : "var(--ft-muted)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {result.primary}
      </span>

      {/* Secondary label (category / currency) */}
      {result.secondary && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            background: "var(--ft-base)",
            border: "1px solid var(--ft-border)",
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          {result.secondary}
        </span>
      )}

      {/* Tertiary / amount */}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: result.amountColor ?? "var(--ft-muted)",
          flexShrink: 0,
        }}
      >
        {result.tertiary}
      </span>
    </div>
  );
}

function HintItem({ keys, label }: { keys: string; label: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--ft-dim)",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          background: "var(--ft-base)",
          border: "1px solid var(--ft-border2)",
          padding: "0 4px",
          color: "var(--ft-muted)",
        }}
      >
        {keys}
      </span>
      {label}
    </span>
  );
}
