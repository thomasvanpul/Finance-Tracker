import { useState } from "react";
import { Settings2 } from "lucide-react";
import type { WidgetDef } from "@/hooks/use-widget-visibility";

interface Props {
  widgets: WidgetDef[];
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
  hiddenCount: number;
}

export function WidgetManagerButton({ widgets, visible, onToggle, onReset, hiddenCount }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Manage widgets"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: hiddenCount > 0 ? "color-mix(in srgb, var(--ft-accent) 14%, transparent)" : "var(--ft-raised)",
          border: `1px solid ${hiddenCount > 0 ? "var(--ft-accent)" : "var(--ft-border)"}`,
          borderRadius: 4, padding: "5px 8px", cursor: "pointer",
          color: hiddenCount > 0 ? "var(--ft-accent)" : "var(--ft-dim)",
          flexShrink: 0,
        }}
      >
        <Settings2 size={11} strokeWidth={2} />
        {hiddenCount > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            display: "flex", alignItems: "flex-end",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              background: "var(--ft-base)",
              borderTop: "1px solid var(--ft-border)",
              borderRadius: "14px 14px 0 0",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
              maxHeight: "78vh",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
              <div style={{ width: 36, height: 3, background: "var(--ft-border)", borderRadius: 2 }} />
            </div>

            {/* Header row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 16px 12px", borderBottom: "1px solid var(--ft-border)",
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-text)" }}>
                  Manage widgets
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 2 }}>
                  {hiddenCount === 0 ? "All visible" : `${hiddenCount} hidden`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => { onReset(); }}
                  style={{
                    background: "none", border: "1px solid var(--ft-border)", borderRadius: 4,
                    cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)",
                    letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 10px",
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: "var(--ft-accent)", border: "none", borderRadius: 4,
                    cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
                    fontWeight: 700, color: "var(--ft-base)", padding: "5px 14px", letterSpacing: "0.04em",
                  }}
                >
                  Done
                </button>
              </div>
            </div>

            {/* Widget rows */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {widgets.map((w, i) => {
                const on = visible[w.id] !== false;
                return (
                  <button
                    key={w.id}
                    onClick={() => onToggle(w.id)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "14px 16px",
                      background: "none", border: "none",
                      borderBottom: i < widgets.length - 1 ? "1px solid var(--ft-border)" : "none",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 4, height: 4, borderRadius: 2, background: on ? "var(--ft-accent)" : "var(--ft-border)", flexShrink: 0 }} />
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 12,
                        color: on ? "var(--ft-text)" : "var(--ft-dim)",
                        letterSpacing: "0.02em",
                      }}>
                        {w.label}
                      </span>
                    </div>
                    {/* Toggle pill */}
                    <div style={{
                      width: 38, height: 22, borderRadius: 11, position: "relative", flexShrink: 0,
                      background: on ? "var(--ft-accent)" : "var(--ft-raised)",
                      border: `1px solid ${on ? "var(--ft-accent)" : "var(--ft-border)"}`,
                    }}>
                      <div style={{
                        position: "absolute", top: 3, left: on ? 17 : 3,
                        width: 14, height: 14, borderRadius: 7,
                        background: on ? "var(--ft-base)" : "var(--ft-dim)",
                        transition: "left 100ms ease",
                      }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ padding: "8px 16px 0", borderTop: "1px solid var(--ft-border)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.04em" }}>
                Hidden widgets are saved and persist across sessions
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
