// Notification kinds + the persona → kinds filter table.
//
// Split out of components/notifications-panel.tsx so unit tests can
// exercise the pure lookup without loading the panel component's
// full import graph (which pulls window-touching modules).

import type { PersonaId } from "@/lib/persona";

// Alert `kind` gates which persona sees which alerts. Adding a new
// kind: add it here, tag emitters in notifications-panel.tsx, add it
// to the persona table below. If tagged with a kind that no persona
// accepts, the alert is dead code by construction.
export type AlertKind =
  | "budget"          // budget-exceeded / budget-approaching
  | "transaction"     // large-tx, anomaly detection
  | "bill"            // upcoming payment due
  | "debt"            // IOU overdue
  | "goal"            // savings goal achieved / savings-rate praise
  | "balance"         // low account balance
  | "market"          // portfolio-side (none today; reserved)
  | "shared-expense"; // F4: someone acted on a bill you're on, or
                      //     you owe on a bill someone else paid

// Persona → allowed AlertKind. Read like a table. If a kind is
// missing for a persona it's dropped from the notifications panel.
//
//   market  → balance + transaction + market. No budget nag, no bill,
//             no goal, no shared-expense — market users are here
//             for holdings, not for the other-people dimension.
//   budget  → the day-to-day: budget, transaction, bill, balance,
//             shared-expense (a split IS a spending event to
//             acknowledge or settle).
//   wealth  → big-picture: goal, balance, market. Drop budget/transaction/
//             shared-expense — a wealth user does not want a "coffee
//             anomaly" ping and does not treat a £24.50 dinner split
//             as long-horizon signal.
//   social  → debt + bill + balance + shared-expense. Shared-expense
//             is the whole *point* of the social persona; it sorts
//             first (see result.sort in useAlerts).
//   full    → every kind.
export function alertKindsForPersona(persona: PersonaId): Set<AlertKind> {
  switch (persona) {
    case "market": return new Set(["balance", "transaction", "market"]);
    case "budget": return new Set(["budget", "transaction", "bill", "balance", "shared-expense"]);
    case "wealth": return new Set(["goal", "balance", "market"]);
    case "social": return new Set(["debt", "bill", "balance", "shared-expense"]);
    case "full":
    default:
      return new Set(["budget", "transaction", "bill", "debt", "goal", "balance", "market", "shared-expense"]);
  }
}
