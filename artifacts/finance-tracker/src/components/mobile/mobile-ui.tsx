import { ChevronLeft } from "lucide-react";

export function PageHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 0", marginBottom: 16, flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", display: "flex", padding: 12, marginLeft: -12 }}>
          <ChevronLeft size={20} />
        </button>
      )}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ft-text)" }}>
        {title}
      </div>
    </div>
  );
}

export function EmptyState({ message, cta, ctaHref }: { message: string; cta?: string; ctaHref?: string }) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, padding: "32px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--ft-dim)", marginBottom: cta ? 16 : 0, lineHeight: 1.6 }}>{message}</div>
      {cta && ctaHref && (
        <a href={ctaHref} style={{ display: "inline-block", background: "var(--ft-accent)", color: "var(--ft-base)", borderRadius: 8, padding: "10px 22px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none" }}>
          {cta}
        </a>
      )}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 12, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ft-dim)", padding: "12px 16px 4px" }}>
      {children}
    </div>
  );
}

export function Row({ children, isLast, style }: { children: React.ReactNode; isLast?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: isLast ? "none" : "1px solid var(--ft-border)", ...style }}>
      {children}
    </div>
  );
}
