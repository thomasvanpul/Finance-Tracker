import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { PERSONAS, PERSONA_GLYPHS, PERSONA_COLORS } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";

interface ShortcutSection {
  label: string;
  rows: [string, string][];
  accent?: string;
}

const STATIC_SECTIONS: ShortcutSection[] = [
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
      ["G E", "Year Review"],
    ],
  },
  {
    label: "ACTIONS",
    rows: [
      ["⌘ K / Ctrl K", "Command palette"],
      ["N", "New transaction (dashboard)"],
      ["A", "Toggle alerts panel"],
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
  {
    label: "POWER USER",
    rows: [
      ["G X", "Bill Split"],     ["G 8", "Decisions"],
      ["G M", "Mortgage"],
      ["G P", "Pension"],        ["G 0", "FIRE Calc"],
      ["G 5", "Projection"],
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: Props) {
  const activePersonaId = useActivePersona();
  const primaryPersona = useMemo(
    () => PERSONAS.find((p) => p.id === activePersonaId) ?? null,
    [activePersonaId, open]
  );

  const personaSection = useMemo((): ShortcutSection => {
    if (!primaryPersona) {
      return {
        label: "TERMINAL PROFILE",
        accent: "var(--ft-dim)",
        rows: [
          ["—", "No profile active"],
          ["⌘K", "Switch via command palette"],
          ["G S", "Settings → Terminal Profile"],
        ],
      };
    }
    const color = PERSONA_COLORS[primaryPersona.id];
    const glyph = PERSONA_GLYPHS[primaryPersona.id];
    // useActivePersona returns a single id; the panel treats
    // additional personas as decorative, so "secondary" is empty in
    // the reactive world. Kept as a hook of the row so a future
    // multi-persona layer can restore it.
    const secondary = "";
    return {
      label: "TERMINAL PROFILE",
      accent: color,
      rows: [
        [`${glyph} ${primaryPersona.code}`, primaryPersona.label + (secondary ? ` + ${secondary}` : "")],
        ["⌘K", "Switch profile (palette)"],
        ["G S", "Settings → Terminal Profile"],
        ["— —", primaryPersona.tagline],
      ],
    };
  }, [primaryPersona, activePersonaId]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const allSections = [...STATIC_SECTIONS, personaSection];

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
          {allSections.map((sec) => {
            const accent = "accent" in sec ? sec.accent : undefined;
            return (
              <div
                key={sec.label}
                style={{
                  borderRight: "1px solid var(--ft-border)",
                  borderBottom: "1px solid var(--ft-border)",
                }}
              >
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.12em", color: accent ?? "var(--ft-dim)",
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
                      color: accent ?? "var(--ft-accent)", background: "var(--ft-raised)",
                      border: "1px solid var(--ft-border)", padding: "2px 6px",
                      letterSpacing: "0.06em", whiteSpace: "nowrap",
                    }}>{key}</kbd>
                  </div>
                ))}
              </div>
            );
          })}
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
