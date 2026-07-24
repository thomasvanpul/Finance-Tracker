import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SECTIONS = [
  {
    label: "NAVIGATION",
    rows: [
      ["G D", "Dashboard"],      ["G A", "Accounts"],
      ["G T", "Transactions"],   ["G I", "Portfolio"],
      ["G W", "Net Worth"],      ["G B", "Budget"],
      ["G L", "Goals"],          ["G N", "Analytics"],
      ["G O", "Debts"],          ["G C", "Subscriptions"],
      ["G H", "Health Score"],   ["G V", "Cash Flow"],
      ["G Y", "Tax"],            ["G K", "Calendar"],
      ["G F", "Calculators"],    ["G J", "Import"],
      ["G S", "Settings"],       ["G G", "AI Coach"],
      ["G Q", "Learn"],          ["G E", "Year Review"],
    ],
  },
  {
    label: "ACTIONS",
    rows: [
      ["⌘ K / Ctrl K", "Command palette"],
      ["N", "New transaction (dashboard)"],
      ["P", "Toggle privacy mode"],
      ["?", "This shortcut reference"],
      ["Esc", "Close any overlay"],
    ],
  },
  {
    label: "COMMAND PALETTE",
    rows: [
      ["↑ ↓", "Navigate results"],
      ["↵", "Execute selected"],
      ["3+ chars", "Search transactions & accounts"],
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-start",
        justifyContent: "center", paddingTop: "8vh", overflowY: "auto",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680, margin: "0 20px 40px",
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: "1px solid var(--ft-border)",
          background: "var(--ft-raised)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "var(--ft-dim)" }}>
            KEYBOARD SHORTCUTS
          </span>
          <span
            onClick={onClose}
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", cursor: "pointer", letterSpacing: "0.08em" }}
          >
            ESC TO CLOSE
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {SECTIONS.map(sec => (
            <div key={sec.label} style={{ borderRight: "1px solid var(--ft-border)", borderBottom: "1px solid var(--ft-border)" }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.12em", color: "var(--ft-dim)",
                padding: "8px 14px", background: "var(--ft-raised)",
                borderBottom: "1px solid var(--ft-border)",
              }}>
                {sec.label}
              </div>
              {sec.rows.map(([key, label]) => (
                <div key={key} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 14px", borderBottom: "1px solid var(--ft-border)",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{label}</span>
                  <kbd style={{
                    fontFamily: "var(--font-mono)", fontSize: 9,
                    color: "var(--ft-accent)", background: "var(--ft-raised)",
                    border: "1px solid var(--ft-border)", padding: "2px 6px",
                    letterSpacing: "0.06em", whiteSpace: "nowrap",
                  }}>{key}</kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useKeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  return { open, openShortcuts: () => setOpen(true), closeShortcuts: () => setOpen(false) };
}
