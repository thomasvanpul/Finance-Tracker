import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";

export interface FtDropdownOption {
  value: string;
  label: string;
  prefix?: string; // e.g. flag or icon text before label
}

interface FtDropdownProps {
  options: FtDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;         // optional uppercase label shown before the selector
  minWidth?: number;
}

export function FtDropdown({ options, value, onChange, label, minWidth = 120 }: FtDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {label && (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          color: "var(--ft-dim)",
          textTransform: "uppercase",
          userSelect: "none",
        }}>
          {label}
        </span>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: open ? "var(--ft-raised)" : "var(--ft-surface)",
          border: `1px solid ${open ? "var(--ft-accent)" : "var(--ft-border2)"}`,
          color: "var(--ft-text)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          padding: "4px 8px",
          cursor: "pointer",
          outline: "none",
          letterSpacing: "0.02em",
          minWidth,
          transition: "border-color 0.1s, background 0.1s",
        }}
      >
        {selected?.prefix && (
          <span style={{ fontSize: 13, lineHeight: 1 }}>{selected.prefix}</span>
        )}
        <span style={{ flex: 1, textAlign: "left" }}>{selected?.label ?? "—"}</span>
        <ChevronDown
          size={10}
          color="var(--ft-dim)"
          style={{
            transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            flexShrink: 0,
          }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            zIndex: 999,
            background: "var(--ft-raised)",
            border: "1px solid var(--ft-accent)",
            minWidth: "100%",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {/* accent top stripe */}
          <div style={{ height: 1, background: "var(--ft-accent)", opacity: 0.4 }} />
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 12px",
                  background: isSelected ? "rgba(244,162,30,0.1)" : "transparent",
                  border: "none",
                  borderLeft: isSelected ? "2px solid var(--ft-accent)" : "2px solid transparent",
                  color: isSelected ? "var(--ft-accent)" : "var(--ft-text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  letterSpacing: "0.02em",
                  transition: "background 0.08s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                {opt.prefix && <span style={{ fontSize: 14, lineHeight: 1 }}>{opt.prefix}</span>}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
