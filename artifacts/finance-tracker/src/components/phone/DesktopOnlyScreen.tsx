import { useLocation } from "wouter";

// A phone user who follows a deep link to a desktop-only route lands here.
// NOT a 404 (the URL is a real URL — the feature exists, just not for
// phone yet). NOT a redirect (redirects hide the state change and confuse
// the back button). NOT the wrapped desktop page (that's the fallthrough
// the D5 ratchet is closing route-by-route).
//
// The screen is honest about what's happening — this feature lives on
// desktop right now, and the user has a clear way back. Same visual
// family as MobileEmptyState / PhoneSectionError so the app reads as
// one product across states.
//
// Amendment lines followed (src/index.css:47–94):
//   :54  border-radius 16 on the CTA (button, not table cell)
//   :74  44 min tap target on the CTA
//   :78  the desktop-only-ness IS the message, and is labelled
//   :82  one thing the user can do — go back to /directory
//   :92  no decorative artwork

interface DesktopOnlyScreenProps {
  title: string;               // "Business", "Family", "Trading", …
  body: string;                // one-line explanation. Route-specific.
}

export function DesktopOnlyScreen({ title, body }: DesktopOnlyScreenProps) {
  const [, navigate] = useLocation();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "var(--ft-base)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 4px",
          minHeight: 44,
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate("/directory")}
          aria-label="Back to directory"
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "var(--ft-muted)",
            fontSize: 13,
            padding: 0,
            cursor: "pointer",
            minHeight: 44,
            minWidth: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--ft-dim)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: "var(--ft-space-8) var(--ft-space-6)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--ft-space-3)",
            flex: 1,
            minHeight: 0,
            justifyContent: "center",
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
            DESKTOP FOR NOW
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
            {title} lives on desktop.
          </div>
          <div
            style={{
              fontSize: "var(--ft-text-body)",
              lineHeight: "20px",
              color: "var(--ft-muted)",
            }}
          >
            {body}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/directory")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "stretch",
            marginTop: "var(--ft-space-6)",
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
          Back to directory
        </button>
      </div>
    </div>
  );
}
