import { useListAccounts } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatGbp } from "@/lib/utils";
import { MobileEmptyState } from "./mobile-ui";

// Header + total balance + per-account list. Every earlier widget on this
// screen (signals, cash-drag, yield-optimiser, projected-interest, 5y compound
// growth, FSCS, interest-rate sensitivity, ISA allowance, emergency-fund,
// concentration) rendered only when the account list was empty, so all of
// them were driven by fabricated data. Removed until the API can supply the
// underlying facts (APR per account, monthly-expense baseline, FSCS scheme,
// account category).

export function MobileAccounts() {
  const [, navigate] = useLocation();
  const { data: accounts = [], isLoading } = useListAccounts();

  if (!isLoading && accounts.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }} className="mobile-scroll">
        <MobileEmptyState
          label="NO ACCOUNTS"
          title="Nothing to show yet."
          description="Connect Wise or Revolut, or add an account by hand. Balances appear here as soon as the sync completes."
          ctaLabel="Manage accounts"
          onCta={() => navigate("/settings")}
        />
      </div>
    );
  }

  const total = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      <div style={{ padding: "16px 16px 0" }}>
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
          Accounts
        </div>
      </div>

      <div style={{ padding: "12px 16px 4px" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          TOTAL BALANCE · £
        </div>
        <div
          className="pnum"
          style={{
            fontSize: 34,
            lineHeight: "34px",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            marginTop: 6,
          }}
        >
          {formatGbp(total)}
        </div>
      </div>

      <div style={{ padding: "18px 16px 0" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
            marginBottom: 6,
          }}
        >
          {accounts.length} {accounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </div>
        {accounts.map((a, i) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              minHeight: 44,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              ...(i === accounts.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span>{a.name}</span>
            {a.currency === "GBP" ? (
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {formatGbp(a.gbpEquivalent)}
              </span>
            ) : (
              <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span
                  className="pnum"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}
                >
                  {a.currency} {a.balance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ≈
                </span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  {formatGbp(a.gbpEquivalent)}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
