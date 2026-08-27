import { formatBaseMoney } from "@/lib/utils";

// Shared Recharts tooltip that puts every value inside a `.pnum` span, so
// numbers get tabular figure alignment AND respect privacy-mode blur. Use
// with `<Tooltip content={...}>`, NOT with `<Tooltip formatter={...}>` —
// the formatter prop returns arrays that Recharts renders itself, bypassing
// the `.pnum` treatment.

export type TooltipEntry = {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
};

export const monoTooltipStyle: React.CSSProperties = {
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  boxShadow: "none",
  padding: "8px 12px",
  borderRadius: 3,
};

export function MonoTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number, name: string) => [string, string];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={monoTooltipStyle}>
      {label && (
        <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
      )}
      {payload.map((entry, i) => {
        const rawVal = typeof entry.value === "number" ? entry.value : 0;
        const name = String(entry.name ?? "");
        const [displayVal, displayName] = formatter ? formatter(rawVal, name) : [formatBaseMoney(rawVal), name];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {entry.color && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
            )}
            {displayName && <span style={{ color: "var(--ft-dim)", fontSize: 9 }}>{displayName}</span>}
            <span className="pnum" style={{ color: "var(--ft-text)", fontWeight: 700 }}>{displayVal}</span>
          </div>
        );
      })}
    </div>
  );
}
