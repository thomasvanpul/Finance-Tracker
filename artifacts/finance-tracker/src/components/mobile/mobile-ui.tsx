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
// A finance app must never fabricate data. When a screen (or a section of
// one) has nothing real to show, it renders <MobileEmptyState/>.
//
// Two scopes, distinct contracts (Mobile Amendment :47 onward):
//
//   scope="screen"   — the empty state IS the whole screen. Amendment :82
//                      requires every screen has one thing the user can
//                      do, so ctaLabel + onCta are REQUIRED at the type
//                      level. Amendment :75 requires the primary action
//                      be reachable in the bottom third of the screen —
//                      the CTA pins to the bottom of the slot via flex
//                      column with the top block flex:1.
//
//   scope="section"  — the empty state is one section inside a populated
//                      screen (e.g. "no upcoming bills" inside SPENDING,
//                      while the transaction list underneath still
//                      renders). Amendment :82 is satisfied by the
//                      screen's other actions; ctaLabel + onCta stay
//                      OPTIONAL. Layout is inline — CTA (if present)
//                      sits directly under the description, not pinned.
//
// Shape (both scopes):
//   NAME.OF.MISSING.THING (mono uppercase, 11px, dim)
//   Short human-readable line explaining what is empty
//   Description line (14px sans, muted)
//   CTA button (borderRadius 16 per Amendment :54 — was 2, which was
//   the desktop terminal rule; the Amendment permits 16-24 on buttons)
//
// STILL BANNED (Amendment :92): decorative illustration, empty-state
// artwork, particle effects, emoji. This component has none; do not add
// an icon "for warmth".

interface EmptyStateCommonProps {
  label: string;                       // "NO ACCOUNTS"
  title: string;                       // "Nothing to show yet."
  description: string;                 // one-line body
  align?: "center" | "top";            // default center; top for section-in-drilldown
}

interface EmptyStateScreenScopeProps extends EmptyStateCommonProps {
  scope: "screen";
  ctaLabel: string;                    // REQUIRED (Amendment :82)
  onCta: () => void;                   // REQUIRED (Amendment :82)
}

interface EmptyStateSectionScopeProps extends EmptyStateCommonProps {
  scope: "section";
  ctaLabel?: string;                   // optional inside a populated screen
  onCta?: () => void;
}

type MobileEmptyStateProps = EmptyStateScreenScopeProps | EmptyStateSectionScopeProps;

export function MobileEmptyState(props: MobileEmptyStateProps) {
  const { scope, label, title, description, align = "center" } = props;
  const ctaLabel = props.ctaLabel;
  const onCta = props.onCta;
  const showCta = !!ctaLabel && !!onCta;

  const rootStyle: React.CSSProperties = scope === "screen"
    ? {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: "var(--ft-space-8) var(--ft-space-6)",
      }
    : {
        display: "flex",
        flexDirection: "column",
        justifyContent: align === "top" ? "flex-start" : "center",
        padding: "var(--ft-space-8) var(--ft-space-6)",
        gap: "var(--ft-space-3)",
      };

  // Screen scope: top block owns label+title+description in a centred
  // stack; flex:1 pushes the CTA sibling to the bottom of the slot,
  // satisfying Amendment :75 without hard-coded margin math.
  const topBlockStyle: React.CSSProperties = scope === "screen"
    ? {
        display: "flex",
        flexDirection: "column",
        gap: "var(--ft-space-3)",
        flex: 1,
        minHeight: 0,
        justifyContent: align === "top" ? "flex-start" : "center",
      }
    : { display: "contents" };

  const labelEl = (
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
  );
  const titleEl = (
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
  );
  const descriptionEl = (
    <div
      style={{
        fontSize: "var(--ft-text-body)",
        lineHeight: "20px",
        color: "var(--ft-muted)",
      }}
    >
      {description}
    </div>
  );

  // CTA — same visual for both scopes; layout position differs.
  // Screen scope: full-width, pinned in the bottom third by parent flex.
  // Section scope: inline under description, self-aligned to start.
  const ctaEl = showCta ? (
    <button
      type="button"
      onClick={onCta}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: scope === "screen" ? "stretch" : "flex-start",
        marginTop: scope === "screen" ? "var(--ft-space-6)" : "var(--ft-space-2)",
        minHeight: 44,
        padding: "0 18px",
        background: "var(--ft-text)",
        color: "var(--ft-base)",
        border: "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        userSelect: "none",
        borderRadius: 16,   // Amendment :54 — 16-24 on buttons
      }}
    >
      {ctaLabel}
    </button>
  ) : null;

  return (
    <div style={rootStyle}>
      <div style={topBlockStyle}>
        {labelEl}
        {titleEl}
        {descriptionEl}
      </div>
      {ctaEl}
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
