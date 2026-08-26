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

// ── PhoneSectionError ───────────────────────────────────────────────────────
// Renders when one section of a screen fails but the rest is fine — the
// "partial" case (SPENDING's breakdown fails, transaction list still loads).
// Sized to its slot via block layout; never a full-viewport error page.
//
// Mobile Amendment lines followed (src/index.css:47–94):
//   :54  border-radius 16-24 on buttons — retry button uses 16
//   :74  min 44x44 tappable — retry button min-height 44
//   :78  no dead space rule — the error IS the label of the emptiness
//   :82  every screen has at least one thing the user can do — the
//        retry button, when present, satisfies that
//   :88  BANNED: delaying data behind a transition — on retry, the
//        section swaps back to a skeleton in one frame (TanStack Query's
//        isFetching flip); no crossfade between error and loading
//
// Retry rule: `onRetry` present only for idempotent operations (GETs).
// Retrying a POST / PUT / DELETE blind is how you double-charge. For
// mutation failures, omit onRetry — the copy should tell the user to
// go back to the previous screen and try there.

interface PhoneSectionErrorProps {
  label: string;              // "COULDN'T LOAD" — 11px mono, small status caption
  title: string;              // one sentence, plain, present tense
  description?: string;       // one line, ONLY when a real cause is known
  onRetry?: () => void;       // present only when the underlying request is idempotent
  retryLabel?: string;        // default "Try again"
}

export function PhoneSectionError({
  label,
  title,
  description,
  onRetry,
  retryLabel = "Try again",
}: PhoneSectionErrorProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "var(--ft-space-8) var(--ft-space-6)",
        gap: "var(--ft-space-3)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-xs)",
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
      {description && (
        <div
          style={{
            fontSize: "var(--ft-text-body)",
            lineHeight: "20px",
            color: "var(--ft-muted)",
          }}
        >
          {description}
        </div>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: "var(--ft-space-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "flex-start",
            minHeight: 44,
            padding: "0 18px",
            background: "var(--ft-text)",
            color: "var(--ft-base)",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            userSelect: "none",
            borderRadius: 16,
          }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
