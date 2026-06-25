export function BloombergDark() {
  const nav = ["DASHBOARD", "ACCOUNTS", "POSITIONS", "TRANSACTIONS", "UPCOMING", "INVESTMENTS"];
  const metrics = [
    { label: "NET WORTH", value: "£22,261.73", change: "+2.41%", up: true },
    { label: "PORTFOLIO", value: "£12,172.15", change: "+67.82%", up: true },
    { label: "CASH", value: "£10,089.58", change: "+0.00%", up: true },
    { label: "P&L TODAY", value: "+£184.22", change: "+1.53%", up: true },
  ];
  const positions = [
    { ticker: "VOO", name: "Vanguard S&P 500 ETF", shares: "12.00", price: "£532.14", value: "£6,385.68", pl: "+£1,842.10", pct: "+40.49%", up: true },
    { ticker: "AAPL", name: "Apple Inc.", shares: "15.00", price: "£147.22", value: "£2,208.30", pl: "+£892.45", pct: "+67.91%", up: true },
    { ticker: "MSFT", name: "Microsoft Corp.", shares: "8.00", price: "£317.44", value: "£2,539.52", pl: "+£1,184.59", pct: "+87.45%", up: true },
    { ticker: "GOOGL", name: "Alphabet Inc.", shares: "5.00", price: "£127.18", value: "£635.90", pl: "-£84.22", pct: "-11.70%", up: false },
    { ticker: "AMZN", name: "Amazon.com Inc.", shares: "3.00", price: "£134.28", value: "£402.84", pl: "-£32.18", pct: "-7.40%", up: false },
  ];
  const transactions = [
    { date: "25 JUN", desc: "HSBC Direct Debit", type: "DEBIT", amount: "-£42.00", cat: "UTILITIES" },
    { date: "24 JUN", desc: "Salary Credit", type: "CREDIT", amount: "+£3,200.00", cat: "INCOME" },
    { date: "23 JUN", desc: "Amazon Purchase", type: "DEBIT", amount: "-£18.99", cat: "SHOPPING" },
    { date: "22 JUN", desc: "Dividend VOO", type: "CREDIT", amount: "+£24.36", cat: "DIVIDEND" },
  ];

  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", background: "#080A0C", color: "#C8C8C8", minHeight: "100vh", fontSize: 12 }}>
      {/* Top bar */}
      <div style={{ background: "#0F1318", borderBottom: "1px solid #1E2A35", padding: "6px 16px", display: "flex", alignItems: "center", gap: 24 }}>
        <span style={{ color: "#F59E0B", fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>FINTRACK</span>
        <span style={{ color: "#4A5568", fontSize: 10 }}>TERMINAL v2.0</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "#F59E0B", fontSize: 10 }}>● LIVE</span>
        <span style={{ color: "#4A5568", fontSize: 10 }}>GBP BASE</span>
        <span style={{ color: "#4A5568", fontSize: 10 }}>25 JUN 2026 10:37:14</span>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 33px)" }}>
        {/* Sidebar */}
        <div style={{ width: 160, background: "#0A0D10", borderRight: "1px solid #1E2A35", padding: "8px 0", flexShrink: 0 }}>
          {nav.map((item, i) => (
            <div key={item} style={{
              padding: "8px 16px",
              fontSize: 10,
              letterSpacing: 1,
              cursor: "pointer",
              color: i === 0 ? "#F59E0B" : "#5A6A7A",
              background: i === 0 ? "#141A22" : "transparent",
              borderLeft: i === 0 ? "2px solid #F59E0B" : "2px solid transparent",
              marginBottom: 1,
            }}>
              {item}
            </div>
          ))}
          <div style={{ margin: "16px 12px", borderTop: "1px solid #1E2A35" }} />
          <div style={{ padding: "4px 16px", fontSize: 9, color: "#2D3F50", letterSpacing: 1 }}>FX RATES</div>
          {[["USD/GBP","0.7594"],["MYR/GBP","0.1838"],["CNY/GBP","0.1116"]].map(([p, v]) => (
            <div key={p} style={{ padding: "3px 16px", fontSize: 10, display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#4A5568" }}>{p}</span>
              <span style={{ color: "#68C9A0" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Metric strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {metrics.map(m => (
              <div key={m.label} style={{ background: "#0D1117", border: "1px solid #1E2A35", padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 1, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 20, color: "#E2E8F0", fontWeight: 700, lineHeight: 1 }}>{m.value}</div>
                <div style={{ fontSize: 10, marginTop: 4, color: m.up ? "#68C9A0" : "#FC8181" }}>{m.change}</div>
              </div>
            ))}
          </div>

          {/* Two column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 10, flex: 1, minHeight: 0 }}>

            {/* Positions table */}
            <div style={{ background: "#0D1117", border: "1px solid #1E2A35" }}>
              <div style={{ padding: "6px 12px", borderBottom: "1px solid #1E2A35", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#F59E0B", fontSize: 10, letterSpacing: 1 }}>PORTFOLIO POSITIONS</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: "#2D3F50", fontSize: 9 }}>UPDATED 10:37:09</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1A2230" }}>
                    {["TICKER","NAME","SHARES","PRICE","VALUE","P&L","RETURN"].map(h => (
                      <th key={h} style={{ padding: "5px 12px", textAlign: "right", fontSize: 9, color: "#3A5068", letterSpacing: 1, fontWeight: 400, borderRight: "1px solid #111820" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <tr key={p.ticker} style={{ background: i % 2 === 0 ? "#0D1117" : "#0A0E13", borderBottom: "1px solid #111820" }}>
                      <td style={{ padding: "6px 12px", color: "#F59E0B", textAlign: "right", borderRight: "1px solid #111820" }}>{p.ticker}</td>
                      <td style={{ padding: "6px 12px", color: "#8A9BAC", textAlign: "right", borderRight: "1px solid #111820" }}>{p.name}</td>
                      <td style={{ padding: "6px 12px", color: "#C8D4DE", textAlign: "right", borderRight: "1px solid #111820" }}>{p.shares}</td>
                      <td style={{ padding: "6px 12px", color: "#C8D4DE", textAlign: "right", borderRight: "1px solid #111820" }}>{p.price}</td>
                      <td style={{ padding: "6px 12px", color: "#C8D4DE", textAlign: "right", borderRight: "1px solid #111820", fontWeight: 600 }}>{p.value}</td>
                      <td style={{ padding: "6px 12px", color: p.up ? "#68C9A0" : "#FC8181", textAlign: "right", borderRight: "1px solid #111820" }}>{p.pl}</td>
                      <td style={{ padding: "6px 12px", color: p.up ? "#68C9A0" : "#FC8181", textAlign: "right" }}>{p.pct}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid #1E2A35", background: "#0A0D10" }}>
                    <td colSpan={4} style={{ padding: "6px 12px", color: "#4A5568", fontSize: 9, letterSpacing: 1 }}>TOTAL</td>
                    <td style={{ padding: "6px 12px", color: "#E2E8F0", textAlign: "right", fontWeight: 700, borderLeft: "1px solid #111820" }}>£12,172.15</td>
                    <td style={{ padding: "6px 12px", color: "#68C9A0", textAlign: "right", fontWeight: 700, borderLeft: "1px solid #111820" }}>+£3,802.74</td>
                    <td style={{ padding: "6px 12px", color: "#68C9A0", textAlign: "right", fontWeight: 700, borderLeft: "1px solid #111820" }}>+45.42%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Account summary */}
              <div style={{ background: "#0D1117", border: "1px solid #1E2A35" }}>
                <div style={{ padding: "6px 12px", borderBottom: "1px solid #1E2A35" }}>
                  <span style={{ color: "#F59E0B", fontSize: 10, letterSpacing: 1 }}>CASH ACCOUNTS</span>
                </div>
                {[
                  { name: "HSBC CURRENT", ccy: "GBP", bal: "£4,250.00", gbp: "£4,250.00" },
                  { name: "MAYBANK SAVINGS", ccy: "MYR", bal: "18,500.00", gbp: "£3,410.52" },
                  { name: "CHASE CHECKING", ccy: "USD", bal: "3,200.00", gbp: "£2,429.06" },
                ].map(a => (
                  <div key={a.name} style={{ padding: "7px 12px", borderBottom: "1px solid #111820", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#C8D4DE" }}>{a.name}</div>
                      <div style={{ fontSize: 9, color: "#3A5068" }}>{a.ccy} · {a.bal}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#E2E8F0", fontWeight: 600 }}>{a.gbp}</div>
                  </div>
                ))}
                <div style={{ padding: "6px 12px", background: "#0A0D10", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "#4A5568", letterSpacing: 1 }}>TOTAL CASH</span>
                  <span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 700 }}>£10,089.58</span>
                </div>
              </div>

              {/* Recent transactions */}
              <div style={{ background: "#0D1117", border: "1px solid #1E2A35", flex: 1 }}>
                <div style={{ padding: "6px 12px", borderBottom: "1px solid #1E2A35" }}>
                  <span style={{ color: "#F59E0B", fontSize: 10, letterSpacing: 1 }}>RECENT TRANSACTIONS</span>
                </div>
                {transactions.map((t, i) => (
                  <div key={i} style={{ padding: "7px 12px", borderBottom: "1px solid #111820", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#B0BEC5" }}>{t.desc}</div>
                      <div style={{ fontSize: 9, color: "#3A5068" }}>{t.date} · {t.cat}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.type === "CREDIT" ? "#68C9A0" : "#FC8181" }}>{t.amount}</div>
                  </div>
                ))}
              </div>

              {/* This Month */}
              <div style={{ background: "#0D1117", border: "1px solid #1E2A35", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#4A5568", letterSpacing: 1, marginBottom: 8 }}>JUN 2026 SUMMARY</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "#8A9BAC" }}>INCOME</span>
                  <span style={{ fontSize: 12, color: "#68C9A0", fontWeight: 600 }}>+£5,107.26</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "#8A9BAC" }}>EXPENSES</span>
                  <span style={{ fontSize: 12, color: "#FC8181", fontWeight: 600 }}>-£99.64</span>
                </div>
                <div style={{ borderTop: "1px solid #1E2A35", paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "#8A9BAC" }}>NET SAVINGS</span>
                  <span style={{ fontSize: 14, color: "#68C9A0", fontWeight: 700 }}>+£5,007.62</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
