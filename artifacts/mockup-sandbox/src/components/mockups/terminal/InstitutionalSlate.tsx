export function InstitutionalSlate() {
  const nav = [
    { label: "Dashboard", icon: "⬡" },
    { label: "Accounts", icon: "◈" },
    { label: "Transactions", icon: "⇄" },
    { label: "Upcoming", icon: "◷" },
    { label: "Investments", icon: "◬" },
  ];
  const metrics = [
    { label: "Net Worth", value: "£22,261.73", sub: "All assets", change: "+£522.40 today", up: true },
    { label: "Portfolio", value: "£12,172.15", sub: "5 positions", change: "+67.82% total", up: true },
    { label: "Cash", value: "£10,089.58", sub: "3 accounts", change: "Across GBP/USD/MYR", up: true },
    { label: "Net Savings", value: "+£5,007.62", sub: "Jun 2026", change: "98.05% savings rate", up: true },
  ];
  const positions = [
    { ticker: "VOO", name: "Vanguard S&P 500", shares: 12, price: "£532.14", value: "£6,385.68", pl: "+£1,842.10", pct: 40.49, up: true, weight: 52.5 },
    { ticker: "AAPL", name: "Apple Inc.", shares: 15, price: "£147.22", value: "£2,208.30", pl: "+£892.45", pct: 67.91, up: true, weight: 18.1 },
    { ticker: "MSFT", name: "Microsoft", shares: 8, price: "£317.44", value: "£2,539.52", pl: "+£1,184.59", pct: 87.45, up: true, weight: 20.9 },
    { ticker: "GOOGL", name: "Alphabet", shares: 5, price: "£127.18", value: "£635.90", pl: "-£84.22", pct: -11.70, up: false, weight: 5.2 },
    { ticker: "AMZN", name: "Amazon", shares: 3, price: "£134.28", value: "£402.84", pl: "-£32.18", pct: -7.40, up: false, weight: 3.3 },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#0B0F19", color: "#CBD5E1", minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <div style={{ width: 200, background: "#080C14", borderRight: "1px solid rgba(51,65,85,0.4)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid rgba(51,65,85,0.3)" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#38BDF8", letterSpacing: -0.5 }}>Fintrack</div>
          <div style={{ fontSize: 10, color: "#334155", marginTop: 2, letterSpacing: 1 }}>PRIVATE WEALTH</div>
        </div>
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {nav.map((item, i) => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 20px",
              fontSize: 13, cursor: "pointer",
              color: i === 0 ? "#38BDF8" : "#475569",
              background: i === 0 ? "rgba(56,189,248,0.06)" : "transparent",
              borderLeft: i === 0 ? "2px solid #38BDF8" : "2px solid transparent",
            }}>
              <span style={{ fontSize: 14, opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(51,65,85,0.3)" }}>
          <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1, marginBottom: 8 }}>FX RATES (LIVE)</div>
          {[["USD", "1.317"],["MYR", "5.445"],["CNY", "8.967"]].map(([c, r]) => (
            <div key={c} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>{c}/GBP</span>
              <span style={{ fontSize: 11, color: "#22D3EE", fontVariantNumeric: "tabular-nums" }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: -0.5 }}>Dashboard</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>25 Jun 2026 — Base currency: GBP</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "6px 14px", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", color: "#38BDF8", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>
              Sync Data
            </button>
            <button style={{ padding: "6px 14px", background: "#38BDF8", border: "none", color: "#0B0F19", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Link Bank
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {metrics.map(m => (
            <div key={m.label} style={{ background: "#0F1420", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 6, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: m.up ? "linear-gradient(90deg,#38BDF8,#0891B2)" : "linear-gradient(90deg,#EF4444,#B91C1C)" }} />
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>{m.value}</div>
              <div style={{ fontSize: 11, color: m.up ? "#38BDF8" : "#EF4444" }}>{m.change}</div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Portfolio table + sidebar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>
          <div style={{ background: "#0F1420", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(51,65,85,0.4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>Investment Positions</span>
              <span style={{ fontSize: 11, color: "#38BDF8", background: "rgba(56,189,248,0.1)", padding: "2px 8px", borderRadius: 10 }}>5 positions</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "rgba(15,20,32,0.8)" }}>
                  {["Ticker", "Name", "Shares", "Price", "Market Value", "P&L", "Return", "Weight"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "right", fontSize: 10, color: "#475569", fontWeight: 500, letterSpacing: 0.3, borderBottom: "1px solid rgba(51,65,85,0.3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={p.ticker} style={{ borderBottom: "1px solid rgba(51,65,85,0.2)", background: i % 2 === 0 ? "transparent" : "rgba(15,20,32,0.3)" }}>
                    <td style={{ padding: "10px 14px", color: "#38BDF8", textAlign: "right", fontWeight: 600 }}>{p.ticker}</td>
                    <td style={{ padding: "10px 14px", color: "#94A3B8", textAlign: "right" }}>{p.name}</td>
                    <td style={{ padding: "10px 14px", color: "#CBD5E1", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.shares}</td>
                    <td style={{ padding: "10px 14px", color: "#CBD5E1", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.price}</td>
                    <td style={{ padding: "10px 14px", color: "#F1F5F9", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{p.value}</td>
                    <td style={{ padding: "10px 14px", color: p.up ? "#34D399" : "#F87171", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.pl}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 3, background: p.up ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: p.up ? "#34D399" : "#F87171", fontSize: 11 }}>{p.pct.toFixed(2)}%</span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <div style={{ width: 50, height: 4, background: "rgba(51,65,85,0.5)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${p.weight}%`, height: "100%", background: "#38BDF8", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748B", fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{p.weight}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(56,189,248,0.04)", borderTop: "1px solid rgba(56,189,248,0.2)" }}>
                  <td colSpan={4} style={{ padding: "10px 14px", color: "#475569", fontSize: 11 }}>TOTAL</td>
                  <td style={{ padding: "10px 14px", color: "#F1F5F9", textAlign: "right", fontWeight: 700 }}>£12,172.15</td>
                  <td style={{ padding: "10px 14px", color: "#34D399", textAlign: "right", fontWeight: 700 }}>+£3,802.74</td>
                  <td style={{ padding: "10px 14px", color: "#34D399", textAlign: "right", fontWeight: 700 }}>+45.42%</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#475569", fontSize: 10 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Right panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#0F1420", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(51,65,85,0.4)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0" }}>Cash Accounts</span>
              </div>
              {[
                { name: "HSBC Current", ccy: "GBP", native: "£4,250.00", gbp: "£4,250.00" },
                { name: "Maybank Savings", ccy: "MYR", native: "18,500.00", gbp: "£3,410.52" },
                { name: "Chase Checking", ccy: "USD", native: "3,200.00", gbp: "£2,429.06" },
              ].map(a => (
                <div key={a.name} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(51,65,85,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#CBD5E1" }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{a.ccy} {a.native}</div>
                  </div>
                  <span style={{ fontSize: 13, color: "#F1F5F9", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.gbp}</span>
                </div>
              ))}
              <div style={{ padding: "10px 16px", background: "rgba(56,189,248,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#475569" }}>Total Cash</span>
                <span style={{ fontSize: 16, color: "#38BDF8", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>£10,089.58</span>
              </div>
            </div>

            <div style={{ background: "#0F1420", border: "1px solid rgba(51,65,85,0.5)", borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 12 }}>Jun 2026</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#475569" }}>Income</span>
                <span style={{ fontSize: 14, color: "#34D399", fontWeight: 600 }}>+£5,107.26</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: "#475569" }}>Expenses</span>
                <span style={{ fontSize: 14, color: "#F87171", fontWeight: 600 }}>-£99.64</span>
              </div>
              <div style={{ height: 1, background: "rgba(51,65,85,0.4)", margin: "8px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#475569" }}>Net Savings</span>
                <span style={{ fontSize: 18, color: "#38BDF8", fontWeight: 700 }}>+£5,007.62</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: "#334155", textAlign: "right" }}>98.05% savings rate</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
