"use client";
import { useState } from "react";
import { PERSONAS, applyPersonas, PERSONA_COLORS, PERSONA_GLYPHS, PERSONA_INSIGHT_PREVIEWS, PERSONA_BG, type PersonaId } from "@/lib/persona";


const ASCII: Record<PersonaId, string> = {
  market:  "╔══════════╗\n║  ▲ ▲ ▲   ║\n║  MKTS    ║\n╚══════════╝",
  budget:  "╔══════════╗\n║ [███░░░] ║\n║  BUDGET  ║\n╚══════════╝",
  wealth:  "╔══════════╗\n║  /  /  / ║\n║  GROWTH  ║\n╚══════════╝",
  social:  "╔══════════╗\n║ A ⟷ B ⟷C║\n║  SPLIT   ║\n╚══════════╝",
  full:    "╔══════════╗\n║ ≡ ALL ≡  ║\n║ TERMINAL ║\n╚══════════╝",
};

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [selected, setSelected] = useState<Set<PersonaId>>(new Set());
  const [hoveredId, setHoveredId] = useState<PersonaId | null>(null);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [launching, setLaunching] = useState(false);

  function toggle(id: PersonaId) {
    if (id === "full") {
      setSelected(new Set(["full"]));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete("full");
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleLaunch() {
    const ids = selected.size > 0 ? Array.from(selected) : (["full"] as PersonaId[]);
    setLaunching(true);
    setTimeout(() => {
      applyPersonas(ids);
      onComplete();
    }, 900);
  }

  function handleSkip() {
    applyPersonas(["full"]);
    onComplete();
  }

  const selectedPersonas = PERSONAS.filter((p) => selected.has(p.id));
  const canLaunch = selected.size > 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--ft-base, #0a0a0f)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--ft-border, rgba(255,255,255,0.08))",
          background: "rgba(0,0,0,0.3)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: "0.15em",
              color: "var(--ft-text, #e8e8e8)",
            }}
          >
            FINANCETRACKER
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 9,
              color: "var(--ft-dim, #666)",
              letterSpacing: "0.12em",
              padding: "2px 6px",
              border: "1px solid var(--ft-border, rgba(255,255,255,0.08))",
            }}
          >
            INIT·v2
          </div>
        </div>
        <button
          onClick={handleSkip}
          style={{
            background: "none",
            border: "1px solid var(--ft-border, rgba(255,255,255,0.08))",
            color: "var(--ft-dim, #666)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Skip → Full Access
        </button>
      </div>

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          overflowY: "auto",
          padding: "32px 24px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32, maxWidth: 560 }}>
          <div
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 9,
              letterSpacing: "0.2em",
              color: "var(--ft-accent, #ef4444)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            ◈ Terminal Initialization
          </div>
          <h1
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--ft-text, #e8e8e8)",
              letterSpacing: "0.02em",
              margin: 0,
              marginBottom: 10,
              lineHeight: 1.2,
            }}
          >
            How do you use finance?
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              color: "var(--ft-dim, #888)",
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            Select one or more profiles. The terminal will configure your navigation,
            default page, and layout. You can change this anytime in Settings.
          </p>
        </div>

        {/* Persona grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
            width: "100%",
            maxWidth: 900,
            marginBottom: 28,
          }}
        >
          {PERSONAS.map((persona) => {
            const isSelected = selected.has(persona.id);
            const isHovered = hoveredId === persona.id;
            const color = PERSONA_COLORS[persona.id];
            const bg = PERSONA_BG[persona.id];
            const glyph = PERSONA_GLYPHS[persona.id];

            return (
              <button
                key={persona.id}
                onClick={() => toggle(persona.id)}
                onMouseEnter={() => setHoveredId(persona.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  background: isSelected ? bg : "var(--ft-surface, rgba(255,255,255,0.03))",
                  border: `1px solid ${isSelected ? color : "var(--ft-border, rgba(255,255,255,0.08))"}`,
                  borderTop: `2px solid ${isSelected ? color : (isHovered ? color : "var(--ft-border, rgba(255,255,255,0.08))")}`,
                  borderRadius: 2,
                  padding: "16px 18px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s, transform 0.1s",
                  transform: isHovered && !isSelected ? "translateY(-1px)" : "none",
                  position: "relative",
                  outline: "none",
                }}
              >
                {/* Selection indicator */}
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 12,
                    width: 16,
                    height: 16,
                    border: `1px solid ${isSelected ? color : "var(--ft-border2, rgba(255,255,255,0.12))"}`,
                    background: isSelected ? color : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: isSelected ? "#fff" : "transparent",
                    transition: "all 0.15s",
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </div>

                {/* Code badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 16,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {glyph}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 8,
                      color: isSelected ? color : "var(--ft-dim, #666)",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      border: `1px solid ${isSelected ? color : "var(--ft-border, rgba(255,255,255,0.08))"}`,
                      padding: "1px 5px",
                      transition: "all 0.15s",
                    }}
                  >
                    {persona.code}
                  </span>
                </div>

                {/* Title */}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 13,
                    fontWeight: 700,
                    color: isSelected ? color : "var(--ft-text, #e8e8e8)",
                    marginBottom: 4,
                    letterSpacing: "0.02em",
                    transition: "color 0.15s",
                    paddingRight: 20,
                  }}
                >
                  {persona.label}
                </div>

                {/* Tagline */}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "var(--ft-dim, #666)",
                    marginBottom: 12,
                    letterSpacing: "0.04em",
                    lineHeight: 1.5,
                  }}
                >
                  {persona.tagline}
                </div>

                {/* Description */}
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 10,
                    color: "var(--ft-muted, #999)",
                    lineHeight: 1.65,
                    marginBottom: 14,
                  }}
                >
                  {persona.description}
                </div>

                {/* Feature list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                  {persona.highlights.map((h) => (
                    <div
                      key={h}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 9,
                        color: isSelected ? "var(--ft-muted, #999)" : "var(--ft-dim, #666)",
                        transition: "color 0.15s",
                      }}
                    >
                      <span style={{ color, flexShrink: 0, fontSize: 8 }}>›</span>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Page count badge */}
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 8,
                  color: isSelected ? color : "var(--ft-dim, #555)",
                  border: `1px solid ${isSelected ? color + "60" : "rgba(255,255,255,0.06)"}`,
                  padding: "2px 7px",
                  letterSpacing: "0.1em",
                  transition: "all 0.15s",
                  opacity: 0.85,
                }}>
                  {persona.id === "full" ? "ALL" : persona.visibleHrefs.length} {persona.id === "full" ? "PAGES" : persona.visibleHrefs.length === 1 ? "PAGE" : "PAGES"}
                </div>

                {/* ASCII art (shown when selected) */}
                {isSelected && (
                  <pre
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 7,
                      color,
                      opacity: 0.35,
                      position: "absolute",
                      bottom: 10,
                      right: 12,
                      margin: 0,
                      lineHeight: 1.4,
                      pointerEvents: "none",
                    }}
                  >
                    {ASCII[persona.id]}
                  </pre>
                )}
              </button>
            );
          })}
        </div>

        {/* Insight preview — shown when hovering a persona card */}
        {hoveredId && (
          <div
            style={{
              width: "100%",
              maxWidth: 900,
              marginBottom: 16,
              background: "var(--ft-surface, rgba(255,255,255,0.03))",
              border: `1px solid ${PERSONA_COLORS[hoveredId]}44`,
              borderLeft: `3px solid ${PERSONA_COLORS[hoveredId]}`,
              padding: "12px 16px",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 8, letterSpacing: "0.14em", color: PERSONA_COLORS[hoveredId], textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
              {PERSONA_GLYPHS[hoveredId]} {PERSONAS.find(p => p.id === hoveredId)?.label} — What you'll see
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {PERSONA_INSIGHT_PREVIEWS[hoveredId].map((preview) => (
                <div key={preview.page} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9, letterSpacing: "0.12em", color: PERSONA_COLORS[hoveredId], border: `1px solid ${PERSONA_COLORS[hoveredId]}44`, padding: "2px 6px", flexShrink: 0, lineHeight: 1.6, fontWeight: 700 }}>
                    {preview.page.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9, color: "var(--ft-dim, #888)", lineHeight: 1.6 }}>
                    {preview.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selection summary + Launch */}
        <div
          style={{
            width: "100%",
            maxWidth: 900,
            background: "var(--ft-surface, rgba(255,255,255,0.03))",
            border: "1px solid var(--ft-border, rgba(255,255,255,0.08))",
            borderTop: `2px solid ${canLaunch ? "var(--ft-accent, #ef4444)" : "var(--ft-border, rgba(255,255,255,0.08))"}`,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            transition: "border-color 0.12s",
          }}
        >
          <div>
            {canLaunch ? (
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "var(--ft-dim, #666)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Configuring for:
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {selectedPersonas.map((p) => (
                    <span
                      key={p.id}
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 10,
                        fontWeight: 700,
                        color: PERSONA_COLORS[p.id],
                        padding: "2px 7px",
                        border: `1px solid ${PERSONA_COLORS[p.id]}`,
                        background: PERSONA_BG[p.id],
                      }}
                    >
                      {PERSONA_GLYPHS[p.id]} {p.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 10,
                  color: "var(--ft-dim, #666)",
                }}
              >
                Select at least one profile to continue.
              </div>
            )}
          </div>

          <button
            onClick={handleLaunch}
            disabled={!canLaunch || launching}
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "10px 28px",
              background: canLaunch
                ? (launching ? "rgba(239,68,68,0.15)" : "var(--ft-accent, #ef4444)")
                : "transparent",
              border: `1px solid ${canLaunch ? "var(--ft-accent, #ef4444)" : "var(--ft-border, rgba(255,255,255,0.08))"}`,
              color: canLaunch ? "#fff" : "var(--ft-dim, #666)",
              cursor: canLaunch ? "pointer" : "not-allowed",
              transition: "all 0.15s",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 2,
            }}
          >
            {launching ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    animation: "spin 1s linear infinite",
                    fontSize: 12,
                  }}
                >
                  ◌
                </span>
                Initializing…
              </>
            ) : (
              <>Initialize Terminal →</>
            )}
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 16,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 9,
            color: "var(--ft-dim, #555)",
            textAlign: "center",
            letterSpacing: "0.06em",
          }}
        >
          Your choice only affects navigation — all data and features remain fully accessible.
          Change anytime in Settings → Terminal Profile.
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
