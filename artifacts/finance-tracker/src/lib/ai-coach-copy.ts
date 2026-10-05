// The AI Coach's opening line, kept out of the page so the string the page
// renders can be locked by a test (ai-switch-honest.lock.test.ts).
//
// It used to be `Focused on ${tagline.toLowerCase()}.`, which rendered
// "Focused on the complete bloomberg experience." for ANL·05 (audit A1,
// 5 Oct 2026): a competitor's trademark, lower-cased, in the product's own
// voice. The tagline is now the product's own words, and it is shown as
// written, never re-cased: a tagline is copy, and lower-casing copy
// destroys every proper noun in it.

export interface CoachPersona {
  label: string;
  tagline: string;
}

export const COACH_INTRO_NO_PERSONA =
  "Ask anything about your finances. I have access to your current month's spending, budgets, and account balances.";

export function coachIntro(persona: CoachPersona | undefined): string {
  if (!persona) return COACH_INTRO_NO_PERSONA;
  return `${persona.label}: ${persona.tagline}. I have full access to your spending, budgets, investments, and goals.`;
}
