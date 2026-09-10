import { useGetAllocation } from "@workspace/api-client-react";
import { formatBaseMoney } from "@/lib/utils";
import { allowanceState, waitingLine } from "@/lib/allocation-view";

// SPENDING's forward-looking half. The hero above it states what has gone
// out this month; this states what can go out today.
//
// ONE FIGURE, per the brief. The decomposition — what is committed, what
// each goal claims, what drift discounts — is the desktop's job. A phone
// held at arm's length gets the answer, not the working.
//
// Three states, and only one of them carries a number:
//
//   figure   — the allowance.
//   waiting  — the drift sample is shorter than the engine's floor. EVERY
//              new account is here for its first week: snapshots cannot be
//              backfilled (schema/account-balance-snapshots.ts:41-43), so
//              this is the first thing anyone ever sees on this screen.
//   blocked  — something missing that time alone will not fix.
//
// There is deliberately no provisional figure, no greyed-out figure, no
// zero and no asterisked number in the waiting state. The engine has no
// partial figure to give (allocation.ts: "There is deliberately no
// drift-free allowance for the first week") and inventing one on the client
// would be the fabricated-number defect CLAUDE.md bans outright.
//
// Not a drill. §14 excludes a projection explicitly — a figure computed
// from rows opens those rows, and this one is
// (cash + income − commitments − goals − drift) ÷ 30, which is a forecast,
// not a sum with a list behind it. Drawing it as pressable would teach the
// affordance means nothing. The legs that ARE sums over rows carry their
// drills on the desktop surface, where they are shown.
export function AllowanceBand() {
  const { data, isLoading, isError } = useGetAllocation();

  // No band at all rather than a skeleton that resolves into an apology.
  // The screen below it is the ledger and stands on its own.
  if (isError) return null;
  if (isLoading || !data) return null;

  const state = allowanceState(data);

  return (
    <div
      style={{
        padding: "0 16px 14px",
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "var(--ft-border)",
        marginBottom: 2,
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
        SAFE TO SPEND · TODAY
      </div>

      {state.kind === "figure" ? (
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-primary-num)",
            fontWeight: 700,
            lineHeight: "34px",
            letterSpacing: "-0.02em",
            marginTop: 6,
            whiteSpace: "nowrap",
            // Negative is a real answer — commitments can exceed what is
            // there — and it is the one a user most needs to read as
            // negative. formatBaseMoney signs it; the colour is the second
            // carrier, never the only one (§7).
            color: state.value < 0 ? "var(--ft-red)" : "var(--ft-text)",
          }}
        >
          {formatBaseMoney(state.value)}
        </div>
      ) : (
        // No figure line at all. Not "—", not a greyed number: the label
        // above already names what is absent, and a dash in the figure slot
        // at 30px reads as a value that failed to load rather than as a
        // measurement that has not been made yet.
        <div
          style={{
            fontSize: "var(--ft-text-body)",
            lineHeight: "20px",
            color: "var(--ft-text)",
            marginTop: 8,
            maxWidth: 320,
          }}
        >
          {state.kind === "waiting" ? waitingLine(state) : state.reason}
        </div>
      )}

      {state.kind === "blocked" && state.fix != null && (
        <div
          style={{
            fontSize: "var(--ft-text-xs)",
            lineHeight: "16px",
            color: "var(--ft-dim)",
            marginTop: 4,
            maxWidth: 320,
          }}
        >
          {state.fix}
        </div>
      )}
    </div>
  );
}
