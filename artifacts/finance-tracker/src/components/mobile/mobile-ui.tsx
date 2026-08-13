import { ChevronLeft } from "lucide-react";

// Screen title bar. `onBack` is the sub-screen back chevron (Analytics,
// Owing etc. accept it via prop). Not shown if omitted.
export function MobileScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "16px 16px 0",
        marginBottom: 12,
        flexShrink: 0,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ft-dim)",
            display: "flex",
            padding: 12,
            marginLeft: -12,
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ft-text)",
        }}
      >
        {title}
      </div>
    </div>
  );
}

// ── Shared mobile primitives ────────────────────────────────────────────────
// A finance app must never fabricate data. When a screen has nothing real to
// show, it renders <MobileEmptyState/> — a single component whose shape is:
//   NAME.OF.MISSING.THING (mono uppercase, dim)
//   Short human-readable line explaining what is empty and what to do
//   CTA button (--ft-text bg, --ft-base text, borderRadius 2)
// Anti-vibe compliant: no rounded card, no accent-tinted surface, no pill CTA.

interface MobileEmptyStateProps {
  label: string;         // e.g. "NO ACCOUNTS"
  title: string;         // e.g. "Nothing to show yet."
  description: string;   // one-line body
  ctaLabel?: string;     // e.g. "Add an account"
  onCta?: () => void;
}

export function MobileEmptyState({
  label,
  title,
  description,
  ctaLabel,
  onCta,
}: MobileEmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.16em",
          color: "var(--ft-dim)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 21,
          lineHeight: "28px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--ft-text)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: "20px",
          color: "var(--ft-muted)",
        }}
      >
        {description}
      </div>
      {ctaLabel && onCta && (
        <div
          onClick={onCta}
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "flex-start",
            minHeight: 44,
            padding: "0 18px",
            background: "var(--ft-text)",
            color: "var(--ft-base)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            userSelect: "none",
            borderRadius: 2,
          }}
        >
          {ctaLabel}
        </div>
      )}
    </div>
  );
}
