// Currency + country marks. One inline-SVG set, themed via
// currentColor so every one of the 11 themes (arctic included)
// picks up the mark in the ambient text colour without a per-theme
// asset.
//
// Replaces the two emoji-flag surfaces the app carried before:
//   - CURRENCY_FLAGS in widgets/net-worth.tsx and widgets/accounts-
//     summary.tsx (same map twice; both deleted at migration).
//   - WORLD_CITIES `flag` fields in components/layout.tsx (rendered
//     via <CountryMark code=… />).
//
// Rendered shape: a hairline rectangle with a 2- or 3-letter code
// inside. Reads as an instrument label rather than a flag, matching
// the terminal-shape of the rest of the app. currentColor + a fixed
// SVG viewBox mean it aligns with mono figures at any font-size.

import type { CSSProperties } from "react";

interface MarkProps {
  /** Currency ISO 4217 code (e.g. USD, GBP, EUR, MYR, SGD) or a 2-letter
   *  country code (see CountryMark). */
  code: string;
  /** Height in px. Width is derived from viewBox so 2-letter marks are
   *  narrower than 3-letter marks. Default 11px — the smallest size the
   *  stroke reads cleanly at. */
  size?: number;
  /** Extra style (rarely needed; kept escape-hatch narrow — most callers
   *  should let the mark inherit currentColor). */
  style?: CSSProperties;
  /** Screen-reader label. Defaults to the code. */
  title?: string;
}

// One SVG for both currency (3 chars) and country (2 chars). viewBox
// width scales with letter count so glyph density stays roughly
// constant.
function Mark({ code, size = 11, style, title }: MarkProps) {
  const chars = code.length;
  // Padding one char on each side of text so the rect is roomier for
  // 2-char codes than 3-char, without a per-mode viewBox.
  const boxW = chars === 2 ? 18 : 22;
  const boxH = 12;
  const width = (size * boxW) / boxH;
  // Font size sized to leave a hairline of padding vertically.
  const fs = boxH * 0.62;
  return (
    <svg
      viewBox={`0 0 ${boxW} ${boxH}`}
      width={width}
      height={size}
      role="img"
      aria-label={title ?? code}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...(style ?? {}) }}
    >
      <rect x="0.5" y="0.5" width={boxW - 1} height={boxH - 1} fill="none" stroke="currentColor" strokeWidth={0.75} />
      <text
        x={boxW / 2}
        y={boxH / 2 + fs / 3}
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
        fontSize={fs}
        fontWeight={700}
        letterSpacing={0.15}
      >
        {code}
      </text>
    </svg>
  );
}

/** Currency mark. `code` is an ISO 4217 currency code. */
export function CurrencyMark(props: MarkProps) {
  return <Mark {...props} />;
}

/** Country mark. `code` is a 2-letter country code (ISO 3166-1 alpha-2).
 *  Used by the market-hours strip in components/layout.tsx and any other
 *  city-list caller. */
export function CountryMark(props: MarkProps) {
  return <Mark {...props} />;
}

/** Convenience map: WORLD_CITIES entries carried an emoji flag alongside
 *  the label. Callers migrating from `flag` should look up the country
 *  code via this table and render <CountryMark code={COUNTRY_FOR_CITY[city]} />.
 *  Kept here rather than beside the city list so a future adjustment to
 *  the mark visual doesn't require touching the layout file too. */
export const COUNTRY_FOR_CITY: Record<string, string> = {
  "London": "GB",
  "New York": "US",
  "Chicago": "US",
  "Los Angeles": "US",
  "Toronto": "CA",
  "São Paulo": "BR",
  "Frankfurt": "DE",
  "Paris": "FR",
  "Amsterdam": "NL",
  "Zurich": "CH",
  "Dubai": "AE",
  "Mumbai": "IN",
  "Singapore": "SG",
  "Hong Kong": "HK",
  "Shanghai": "CN",
  "Tokyo": "JP",
  "Seoul": "KR",
  "Sydney": "AU",
};
