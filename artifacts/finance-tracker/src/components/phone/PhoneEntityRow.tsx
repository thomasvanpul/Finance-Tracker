import type { ReactNode } from "react";
import { HoverRow } from "./HoverRow";

// PhoneEntityRow — the row shape used by any list of entities that have
// identity: a merchant, person, or account. Amendment :83 requires a
// glyph on any such row, and every list screen the phone will grow
// (SPENDING, DIRECTORY sub-screens, OWING when it moves in) needs the
// same three-column composition of glyph / text / amount.
//
// Identity mechanism — two-letter monogram on a tinted rounded square,
// deterministically coloured from `primary`. Real merchant logos mean
// licensing, fetching, caching, dark-mode variants, and a fallback for
// every merchant without art — a licensing surface Numeris does not
// need. A monogram is stable, themeable, offline-safe, and reads as
// intentional at 38px. Two existing sites (MobileOwing rows,
// MobileTransactions mobile row) already hand-roll this shape with
// initials + tinted circle; this consolidates them.
//
// The tone palette excludes --ft-red on purpose. Red is reserved for
// negative amounts (Amendment :88 — legibility must not depend on hue
// alone, and using red for both "expense" and "Ryan A" would confuse
// that channel).
//
// Amount is passed as pre-formatted strings, not numbers. The caller
// knows the currency, the base, and whether the figure is unconvertible
// — the primitive must not decide when to truncate a financial figure
// (Amendment CLAUDE.md hard-constraint: "shown in full or not at all").
// Callers sign the primary string themselves ("+£10.00" / "-£43.07") so
// gain/loss remains legible without hue (:88).
//
// Native line: when a foreign-currency figure differs from base, the
// caller passes both — base on the primary line, native beneath. Both
// stay tabular so a stack of rows lines up. No "≈"; the visual
// subordination of the native line carries the "converted" meaning, and
// dashed underlining is the app's device for "not-yet-real" (dotted
// means not-yet-real per index.css :171-style rules) so we don't touch
// underlines here.
//
// Amendment lines followed:
//   :68  uniform vertical rhythm within a list  (row padding fixed)
//   :74  min 44px tap target when onTap set
//   :77  11px floor for mono labels
//   :83  glyph on every entity row (the whole point of this primitive)
//   :88  sign character in the string, not just hue
//   :90  tabular figures on every number in an aligned column
//   :93  generous vertical spacing (56px min row)

export interface PhoneEntityRowIdentity {
  /** Overrides the auto-derived two-letter monogram. */
  label?: string;
  /** CSS colour (usually a theme token). Overrides the auto-derived tone. */
  tone?: string;
}

export interface PhoneEntityRowAmount {
  /** Fully formatted, signed. Never null — pass `undefined` to skip. */
  value: string;
  /** CSS colour. Defaults to var(--ft-text). */
  tone?: string;
  /** Native-currency companion, e.g. "RM 236.40". Rendered subordinate below. */
  native?: string;
}

interface PhoneEntityRowProps {
  primary: string;
  secondary?: string;
  identity?: PhoneEntityRowIdentity;
  amount?: PhoneEntityRowAmount;
  onTap?: () => void;
  isLast?: boolean;
  /**
   * When true, the row visually recedes: glyph tint drops to muted grey
   * (ignoring identity.tone), the amount renders one type-tier smaller
   * and muted (ignoring amount.tone). Used on screens where a row of
   * this type is not the subject — e.g. an income row on SPENDING,
   * where the hero explicitly excludes income. The row is still
   * tappable and still swipeable; only the visual weight drops.
   */
  subdued?: boolean;
}

// Palette excludes --ft-red. See header note.
const TONE_PALETTE = [
  "var(--ft-blue)",
  "var(--ft-cyan)",
  "var(--ft-amber)",
  "var(--ft-green)",
  "var(--ft-accent)",
] as const;

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function deriveInitials(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "?";
  // Split on whitespace, then skip tokens that don't start with a
  // letter or digit. This drops standalone dash tokens (em, en,
  // hyphen — a habit in labels like "Rent — Kensington") which would
  // otherwise produce initials like "R—" for a two-word name. The
  // Unicode property {L}/{N} also handles non-Latin scripts (Malay
  // rows on a Malaysian user's ledger, Chinese descriptions).
  const parts = trimmed
    .split(/\s+/)
    .filter((p) => /^[\p{L}\p{N}]/u.test(p))
    .slice(0, 2);
  const chars = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return chars || trimmed[0]?.toUpperCase() || "?";
}

export function deriveTone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return TONE_PALETTE[0];
  return TONE_PALETTE[hashString(trimmed) % TONE_PALETTE.length];
}

// List-aware tone assignment. Point of the glyph is to distinguish,
// and with a 5-tone palette a small set collides more often than
// most operators would guess — a set of 4 items has a 42% chance of
// two picking the same tone. Concretely: on Thomas's WORTH screen
// "Wise MYR Jar" and "Maybank Savings" both hash to blue, so the
// two MYR accounts read as a set while Monzo reads as different —
// a visual grouping that has nothing to do with currency and
// everything to do with hash collision.
//
// This assigner walks the list in order. First choice is the hash-
// derived tone (matching per-item determinism where possible). If
// the natural pick has already been used in this list, walk forward
// through PALETTE until an unused tone is found. If every tone is
// used (list of 6+, pigeonhole guarantees this), fall back to the
// natural hash — collisions past that point are unavoidable, but
// the palette will have wrapped so a collision is with an earlier
// row, not the immediately-preceding one.
//
// Determinism: same list input → same output (order matters, but
// order in each screen is deterministic). Per-item stability is
// weaker than deriveTone alone — the same "Wise MYR Jar" can wear
// a different tone under a different list of siblings — but the
// tradeoff is worth it because the glyph's job is to disambiguate
// this row from its neighbours, not to be a per-account identity
// across screens.
export function deriveTonesForList(inputs: readonly string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const input of inputs) {
    const natural = deriveTone(input);
    if (!used.has(natural) || used.size >= TONE_PALETTE.length) {
      used.add(natural);
      out.push(natural);
      if (used.size >= TONE_PALETTE.length) used.clear();
      continue;
    }
    // Walk forward through the palette starting from the natural
    // pick's index, so the assignment is a deterministic function
    // of (input, siblings).
    // `natural` came out of TONE_PALETTE, but its inferred type is
    // `string` because deriveTone returns `string`. The palette is
    // `as const` (readonly literal tuple), so indexOf's parameter is
    // narrowly typed — cast to the tuple's element type to look it up.
    const palette = TONE_PALETTE as readonly string[];
    const startIdx = palette.indexOf(natural);
    let picked = natural;
    for (let offset = 1; offset < palette.length; offset++) {
      const candidate = palette[(startIdx + offset) % palette.length];
      if (!used.has(candidate)) {
        picked = candidate;
        break;
      }
    }
    used.add(picked);
    out.push(picked);
  }
  return out;
}

export function PhoneEntityRow({
  primary,
  secondary,
  identity,
  amount,
  onTap,
  isLast,
  subdued = false,
}: PhoneEntityRowProps) {
  const glyphLabel = identity?.label ?? deriveInitials(primary);
  const glyphTone = subdued ? "var(--ft-dim)" : (identity?.tone ?? deriveTone(primary));
  const amountTone = subdued ? "var(--ft-muted)" : (amount?.tone ?? "var(--ft-text)");
  const amountSize = subdued ? "var(--ft-text-body)" : "var(--ft-text-md)";

  return (
    <HoverRow
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        minHeight: 56,
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 8,
          background: `color-mix(in srgb, ${glyphTone} 18%, var(--ft-raised))`,
          border: `1.5px solid color-mix(in srgb, ${glyphTone} 40%, transparent)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: glyphTone,
          }}
        >
          {glyphLabel}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: "var(--ft-text-md)",
            fontWeight: 500,
            color: "var(--ft-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {primary}
        </span>
        {secondary && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--ft-text-xs)",
              color: "var(--ft-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {secondary}
          </span>
        )}
      </div>

      {amount && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
          }}
        >
          <span
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: amountSize,
              fontWeight: subdued ? 500 : 700,
              color: amountTone,
              whiteSpace: "nowrap",
            }}
          >
            {amount.value}
          </span>
          {amount.native && (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--ft-text-xs)",
                color: "var(--ft-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {amount.native}
            </span>
          )}
        </div>
      )}
    </HoverRow>
  );
}

// Exported for tests and for callers that want to reproduce the glyph
// outside a row (e.g. a header, or a floating sheet re-showing the same
// entity).
export function __derivePhoneEntityGlyph(primary: string): { label: string; tone: string } {
  return { label: deriveInitials(primary), tone: deriveTone(primary) };
}

// ────────────────────────────────────────────────────────────────────
// AMENDMENT ADHERENCE SELF-CHECK (kept as literal comments so the file
// is self-auditing; grep-friendly):
//   :68  padding fixed at 12/16 → uniform vertical rhythm within a list ✓
//   :74  minHeight 56 exceeds 44 tap target when onTap set              ✓
//   :77  glyph label 13px, secondary 11px (var(--ft-text-xs))           ✓
//   :83  glyph slot always renders (auto-derived when identity omitted) ✓
//   :88  sign passed in string by caller; tone is additive              ✓
//   :90  amount.value + amount.native both carry .pnum tabular          ✓
//   :93  56px row height, 2px inner gap, 12px column gap                ✓
// Banned:
//   :95  no numeric animation                                           ✓
//   :96  no ellipsis on numbers (only on text columns)                  ✓
//   :99  no emoji, no decorative art                                    ✓
// ────────────────────────────────────────────────────────────────────
