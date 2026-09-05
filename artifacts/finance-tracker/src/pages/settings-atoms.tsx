import { useState } from "react";

// Row atoms and small primitives for the Settings page.
// Extracted from pages/settings.tsx. Pure, prop-driven; no shared state.

export const PANEL_STYLE = { background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" } as const;

export const HEADER_STYLE = {
  background: "var(--ft-raised)", borderBottom: "1px solid var(--ft-border)",
  padding: "0 14px", height: 34, display: "flex", alignItems: "center", gap: 8,
  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--ft-muted)",
} as const;

export const ROW = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexWrap: "wrap" as const, gap: 8,
  padding: "10px 14px", borderBottom: "1px solid var(--ft-border)",
  fontFamily: "var(--font-mono)", fontSize: 12,
} as const;

export function RowLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--ft-text)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>{title}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--ft-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        flexShrink: 0, width: 38, height: 20, borderRadius: 10,
        border: `1px solid ${on ? "var(--ft-accent)" : "var(--ft-border2)"}`,
        background: on ? "var(--ft-accent)" : "var(--ft-raised)",
        cursor: "pointer", position: "relative", transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 14, height: 14, borderRadius: "50%",
        background: on ? "var(--ft-base)" : "var(--ft-dim)", transition: "left 0.15s",
      }} />
    </button>
  );
}

export function ActionBtn({ label, variant = "accent", onClick, disabled }: { label: string; variant?: "accent" | "muted" | "danger"; onClick: () => void; disabled?: boolean }) {
  const [hov, setHov] = useState(false);
  const color = variant === "danger" ? "var(--ft-red)" : variant === "muted" ? "var(--ft-muted)" : "var(--ft-accent)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => { if (!disabled) setHov(true); }}
      onMouseLeave={() => setHov(false)}
      style={{
        fontFamily: "var(--font-mono)", fontSize: 11, color,
        background: hov ? `color-mix(in srgb, ${color} 8%, transparent)` : "transparent",
        border: `1px solid ${color}`,
        padding: "7px 18px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.12s",
      }}
    >&gt; {label}</button>
  );
}

// ── Hover-aware row sub-components ───────────────────────────────────────────

export function SettingsActionRow({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <RowLabel title={title} sub={sub} />
      <div>{children}</div>
    </div>
  );
}

export function SettingsInputRow({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <RowLabel title={title} sub={sub} />
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export function SettingsInfoRow({ label, value, accent = "var(--ft-text)" }: { label: string; value: React.ReactNode; accent?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 14px", borderBottom: "1px solid var(--ft-border)",
        fontFamily: "var(--font-mono)", fontSize: 10,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <span style={{ color: "var(--ft-muted)", fontSize: 10 }}>{label}</span>
      <span style={{ color: accent, fontSize: 10 }}>{value}</span>
    </div>
  );
}

export function SettingsDataResetRow({ label, description, onReset }: { label: string; description: string; onReset: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        flexWrap: "wrap",
        gap: 8,
        background: hov ? "color-mix(in srgb, var(--ft-red) 4%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)" }}>{description}</div>
      </div>
      <button
        onClick={onReset}
        style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--ft-red)", background: "transparent", border: "1px solid var(--ft-red)", padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
      >
        Reset
      </button>
    </div>
  );
}

export function SettingsToggleRow({ title, sub, on, onChange }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <RowLabel title={title} sub={sub} />
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

export function SettingsSelectRow({ title, sub, value, onChange, children }: { title: string; sub?: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <RowLabel title={title} sub={sub} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-text)", padding: "4px 8px", flexShrink: 0 }}
      >
        {children}
      </select>
    </div>
  );
}

export function SettingsNavItemRow({ label, visible, onChange }: { label: string; visible: boolean; onChange: (v: boolean) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: visible ? "var(--ft-text)" : "var(--ft-dim)" }}>{label}</span>
      <Toggle on={visible} onChange={onChange} />
    </div>
  );
}

export function SettingsWidgetRow({
  label,
  span,
  description,
  enabled,
  onToggle,
  recommended = false,
}: {
  label: string;
  span: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  // Item 13: whether this widget is in the active persona's
  // recommended set. Rendered as a small mono tag next to the size
  // label so the user can see at a glance which widgets the persona
  // pre-selected without having to compare against the on/off toggle.
  recommended?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ft-text)", marginBottom: 2 }}>
          {label}
          <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--ft-dim)", letterSpacing: "0.06em" }}>
            {span === "full" ? "FULL WIDTH" : "HALF"}
          </span>
          {recommended && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                color: "var(--ft-accent)",
                letterSpacing: "0.08em",
                border: "1px solid var(--ft-accent)44",
                padding: "1px 5px",
                textTransform: "uppercase",
              }}
            >
              For your persona
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--ft-muted)" }}>{description}</div>
      </div>
      <Toggle on={enabled} onChange={onToggle} />
    </div>
  );
}

export function SettingsThemeEffectRow({ label, accent, on, onChange }: { label: string; accent: string; on: boolean; onChange: (v: boolean) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-text)" }}>{label}</span>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

// ── Storage KPI strip ─────────────────────────────────────────────────────────

export function StorageKpiStrip({ keyCount, sizeKb, nrKeyCount }: { keyCount: number; sizeKb: number; nrKeyCount: number }) {
  const cells: { value: React.ReactNode; label: string }[] = [
    { value: <span className="pnum">{keyCount}</span>, label: "Keys (ft- + nr-)" },
    { value: <><span className="pnum">{sizeKb}</span><span style={{ fontSize: 11, color: "var(--ft-muted)", fontWeight: 400, marginLeft: 3 }}>KB</span></>, label: "Estimated size" },
    { value: <span className="pnum">{nrKeyCount}</span>, label: "App prefs (nr-)" },
  ];
  return (
    <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ background: "var(--ft-surface)", padding: "14px 16px", borderRight: i < cells.length - 1 ? "1px solid var(--ft-border)" : undefined }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--ft-text)", lineHeight: 1 }}>{c.value}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginTop: 4 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}
