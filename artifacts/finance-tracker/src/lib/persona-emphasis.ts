// Persona-tailored ORDER on HOME and WORTH. Same screen, same sections,
// different sequence — the persona changes emphasis, never content
// (vault §23). The tab bar's slot (lib/tab-slot.ts) does the same job
// one level up; this is the in-screen counterpart.
//
// One place decides "is this a markets persona", so the two screens can
// never disagree. Only `market` leads with markets: `wealth` holds
// property and pensions more than tickers, and everyone else budgets.

import type { PersonaId } from "./persona";

export type WorthSection = "cash" | "holdings";
export type HomeSection = "cashflow" | "markets";

export function isMarketsPersona(persona: PersonaId): boolean {
  return persona === "market";
}

// WORTH: a markets persona sees HOLDINGS above CASH; everyone else the reverse.
export function worthSectionOrder(persona: PersonaId): readonly WorthSection[] {
  return isMarketsPersona(persona) ? ["holdings", "cash"] : ["cash", "holdings"];
}

// HOME: a markets persona sees market movement above the cashflow chart;
// everyone else the reverse. News travels with the markets pane.
export function homeSectionOrder(persona: PersonaId): readonly HomeSection[] {
  return isMarketsPersona(persona) ? ["markets", "cashflow"] : ["cashflow", "markets"];
}
