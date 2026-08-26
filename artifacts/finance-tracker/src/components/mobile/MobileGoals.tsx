import { useListGoals } from "@workspace/api-client-react";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { nfmt } from "./mobile-format";

// Per-goal savings progress.
//
// Design signature devices applied:
//   - Premium-tier 34px SAVED · £ · TOTAL headline with overall bar.
//   - Per-row proportional bar: solid fill = money that's arrived,
//     dotted continuation = the target ahead (not-yet-real). Completed
//     goals show a solid full green bar with a DONE tag, no dotted tail.
//   - Zero-state (per MOBILE-CONCEPT § "Zero and loading are not the
//     same"): full-width dotted rule, no baseline, £0.00 label.
//   - Deadline countdown in mono (IN 240D / 12D OVERDUE) per row.
//   - Monthly contribution shown when the API supplies one, dropped
//     entirely when it doesn't — never derived.

const BAR_H = 4;

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T12:00:00");
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function MobileGoals() {
  const { data: goals = [], isLoading } = useListGoals();

  if (!isLoading && goals.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Goals" />
        <MobileEmptyState
          scope="section"
          label="NO GOALS"
          title="No savings goals yet."
          description="Set a savings target and Numeris tracks how far you've come and how far to go."
        />
      </div>
    );
  }

  type Row = {
    id: number | string;
    name: string;
    current: number;
    target: number;
    pct: number;
    complete: boolean;
    deadline?: string | null;
    monthly?: number | null;
  };
  const rows: Row[] = goals.map((g, i) => {
    const current = parseFloat(String(g.current ?? 0)) || 0;
    const target = parseFloat(String(g.target ?? 0)) || 0;
    const pct = target > 0 ? (current / target) * 100 : 0;
    const monthly = g.monthlyContribution != null ? parseFloat(String(g.monthlyContribution)) : null;
    return {
      id: g.id ?? i,
      name: g.name,
      current,
      target,
      pct,
      complete: target > 0 && current >= target,
      deadline: g.deadline,
      monthly: monthly && monthly > 0 ? monthly : null,
    };
  });

  const totalSaved = rows.reduce((s, r) => s + r.current, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const overallPct = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
  const complete = rows.filter((r) => r.complete).length;

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(var(--ft-tab-bar-h) + env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <MobileScreenHeader title="Goals" />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {rows.length} {rows.length === 1 ? "GOAL" : "GOALS"}
          {complete > 0 && ` · ${complete} DONE`}
        </MonoLabel>
      </HStack>

      <VStack paddingX={18} marginBottom={14}>
        <MonoLabel size={11} letterSpacing="0.16em">
          SAVED · £ · TOTAL
        </MonoLabel>
        <HStack align="baseline" gap={4} marginTop={6}>
          <Text as="span" size={17} color="var(--ft-dim)">£</Text>
          <Text as="span" size={34} weight={600} letterSpacing="-0.035em" numeric>
            {nfmt(totalSaved, { decimals: 2 })}
          </Text>
          <Text as="span" mono size={13} color="var(--ft-dim)" numeric>
            / £{nfmt(totalTarget, { decimals: 2 })}
          </Text>
        </HStack>
        <div style={{ marginTop: 10, position: "relative", height: BAR_H }}>
          <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
          <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, overallPct)}%`, background: "var(--ft-accent)" }} />
        </div>
      </VStack>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px 6px",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        <MonoLabel as="span" size={9}>GOAL</MonoLabel>
        <div style={{ flex: 1 }} />
        <MonoLabel as="span" size={9}>SAVED · OF</MonoLabel>
      </div>

      {rows.map((r) => {
        const isZero = r.current === 0;
        const displayPct = Math.min(100, r.pct);
        const days = r.deadline ? daysUntil(r.deadline) : null;
        return (
          <div
            key={r.id}
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--ft-border)",
            }}
          >
            <HStack justify="between" align="baseline" gap={10}>
              <HStack gap={8} align="baseline">
                <Text as="span" size={14}>{r.name}</Text>
                {r.complete && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 5px",
                      borderRadius: 2,
                      background: "var(--ft-raised)",
                      color: "var(--ft-green)",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    DONE
                  </span>
                )}
              </HStack>
              <HStack gap={4} align="baseline">
                <Text
                  as="span"
                  mono
                  size={13}
                  weight={600}
                  color={r.complete ? "var(--ft-green)" : "var(--ft-text)"}
                  numeric
                >
                  £{nfmt(r.current, { decimals: 2 })}
                </Text>
                <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
                  / £{nfmt(r.target, { decimals: 0 })}
                </Text>
              </HStack>
            </HStack>
            <div style={{ marginTop: 8, position: "relative", height: BAR_H }}>
              {isZero ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: BAR_H,
                    borderTop: "1px dotted var(--ft-dim)",
                  }}
                />
              ) : (
                <>
                  <div style={{ position: "absolute", inset: 0, background: "var(--ft-border)" }} />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${displayPct}%`,
                      background: r.complete ? "var(--ft-green)" : "var(--ft-accent)",
                    }}
                  />
                  {!r.complete && r.pct < 100 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${displayPct}%`,
                        right: 0,
                        height: BAR_H,
                        borderTop: "1px dotted var(--ft-dim)",
                      }}
                    />
                  )}
                </>
              )}
            </div>
            <HStack justify="between" align="baseline" marginTop={4} gap={10}>
              <HStack gap={10} align="baseline">
                <Text as="span" mono size={9} letterSpacing="0.1em" color="var(--ft-dim)">
                  {Math.round(r.pct)}%
                </Text>
                {typeof r.monthly === "number" && (
                  <Text as="span" mono size={9} letterSpacing="0.08em" color="var(--ft-dim)">
                    +£{nfmt(r.monthly, { decimals: 0 })}/MO
                  </Text>
                )}
              </HStack>
              {days !== null && !r.complete && (
                <Text
                  as="span"
                  mono
                  size={9}
                  letterSpacing="0.1em"
                  color={days < 0 ? "var(--ft-red)" : "var(--ft-dim)"}
                >
                  {days < 0 ? `${-days}D OVERDUE` : `IN ${days}D`}
                </Text>
              )}
            </HStack>
          </div>
        );
      })}
    </div>
  );
}
