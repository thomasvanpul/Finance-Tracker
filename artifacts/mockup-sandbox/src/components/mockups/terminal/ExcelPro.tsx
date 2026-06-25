export function ExcelPro() {
  const nav = ["OVERVIEW","ACCOUNTS","TRANSACTIONS","UPCOMING","INVESTMENTS","SETTINGS"];
  const positions = [
    { ticker: "VOO", name: "Vanguard S&P 500 ETF", qty: 12, cost: "£3,782.00", price: "£532.14", value: "£6,385.68", pl: 1842.10, pct: 40.49, up: true },
    { ticker: "AAPL", name: "Apple Inc.", qty: 15, cost: "£1,315.85", price: "£147.22", value: "£2,208.30", pl: 892.45, pct: 67.91, up: true },
    { ticker: "MSFT", name: "Microsoft Corp.", qty: 8, cost: "£1,354.93", price: "£317.44", value: "£2,539.52", pl: 1184.59, pct: 87.45, up: true },
    { ticker: "GOOGL", name: "Alphabet Inc.", qty: 5, cost: "£720.12", price: "£127.18", value: "£635.90", pl: -84.22, pct: -11.70, up: false },
    { ticker: "AMZN", name: "Amazon.com Inc.", qty: 3, cost: "£435.02", price: "£134.28", value: "£402.84", pl: -32.18, pct: -7.40, up: false },
  ];
  const accounts = [
    { row: "A2", name: "HSBC Current Account", type: "Chequing", ccy: "GBP", balance: 4250.00, gbp: 4250.00 },
    { row: "A3", name: "Maybank Savings", type: "Savings", ccy: "MYR", balance: 18500.00, gbp: 3410.52 },
    { row: "A4", name: "Chase Checking", type: "Chequing", ccy: "USD", balance: 3200.00, gbp: 2429.06 },
  ];

  const colW = ["3%","16%","10%","8%","10%","10%","10%","10%","10%","9%"];

  return (
    <div style={{ fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif", background: "#0D1117", color: "#C9D1D9", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: 12 }}>
      {/* Ribbon */}
      <div style={{ background: "#161B22", borderBottom: "1px solid #21262D", display: "flex", alignItems: "center" }}>
        <div style={{ padding: "8px 16px", borderRight: "1px solid #21262D", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#1F6FEB,#0D419D)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>F</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#E6EDF3" }}>Fintrack</span>
          <span style={{ fontSize: 10, color: "#6E7681", marginLeft: 4 }}>Portfolio Manager</span>
        </div>
        {nav.map((n, i) => (
          <div key={n} style={{ padding: "8px 14px", fontSize: 11, cursor: "pointer", color: i === 0 ? "#58A6FF" : "#6E7681", borderBottom: i === 0 ? "2px solid #1F6FEB" : "2px solid transparent", fontWeight: i === 0 ? 600 : 400 }}>
            {n}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "6px 16px", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#3FB950" }}>● All data current</span>
          <span style={{ fontSize: 10, color: "#6E7681" }}>25/06/2026 10:37</span>
        </div>
      </div>

      {/* Formula bar */}
      <div style={{ background: "#161B22", borderBottom: "1px solid #21262D", padding: "4px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 60, fontSize: 11, color: "#58A6FF", background: "#0D1117", border: "1px solid #30363D", padding: "2px 6px", textAlign: "center" }}>A1</span>
        <span style={{ color: "#30363D" }}>fx</span>
        <span style={{ flex: 1, fontSize: 11, color: "#8B949E" }}>="Dashboard Overview — Net Worth: £22,261.73 | Portfolio: £12,172.15 | Cash: £10,089.58"</span>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Row numbers sidebar */}
        <div style={{ width: 36, background: "#161B22", borderRight: "1px solid #21262D", flexShrink: 0, paddingTop: 24 }}>
          {Array.from({length: 22}, (_, i) => (
            <div key={i} style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#484F58", borderBottom: "1px solid rgba(33,38,45,0.3)" }}>{i + 1}</div>
          ))}
        </div>

        {/* Spreadsheet grid */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* Column headers */}
          <div style={{ display: "flex", background: "#161B22", borderBottom: "2px solid #21262D", position: "sticky", top: 0, zIndex: 10 }}>
            {["", "A", "B", "C", "D", "E", "F", "G", "H", "I"].map((c, i) => (
              <div key={c + i} style={{ flex: i === 0 ? "0 0 3%" : 1, textAlign: "center", padding: "4px 0", fontSize: 10, color: "#6E7681", borderRight: "1px solid #21262D", fontWeight: 500 }}>{c}</div>
            ))}
          </div>

          {/* Row 1: Section header */}
          <div style={{ display: "flex", borderBottom: "1px solid #21262D", background: "#0D419D" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid rgba(255,255,255,0.1)", padding: "3px 6px", fontSize: 10, color: "#8B949E", textAlign: "center" }}>1</div>
            <div style={{ flex: 1, padding: "4px 8px", color: "#E6EDF3", fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }} colSpan={9}>▼ PORTFOLIO POSITIONS — Live Market Data (GBP)</div>
          </div>

          {/* Header row */}
          <div style={{ display: "flex", borderBottom: "2px solid #30363D", background: "#161B22" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "5px 6px", fontSize: 9, color: "#484F58", textAlign: "center" }}>2</div>
            {["TICKER","SECURITY NAME","QTY","COST BASIS","LAST PRICE","MARKET VALUE","GAIN / LOSS","RETURN %","ALLOCATION"].map((h, i) => (
              <div key={h} style={{ flex: 1, padding: "5px 8px", fontSize: 10, color: "#8B949E", fontWeight: 600, borderRight: "1px solid #21262D", textAlign: i > 1 ? "right" : "left", letterSpacing: 0.3 }}>{h}</div>
            ))}
          </div>

          {/* Data rows */}
          {positions.map((p, i) => (
            <div key={p.ticker} style={{ display: "flex", borderBottom: "1px solid rgba(33,38,45,0.6)", background: i % 2 === 0 ? "#0D1117" : "#111820" }}>
              <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "5px 6px", fontSize: 10, color: "#484F58", textAlign: "center" }}>{i + 3}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#58A6FF", fontWeight: 700, borderRight: "1px solid #21262D" }}>{p.ticker}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#C9D1D9", borderRight: "1px solid #21262D" }}>{p.name}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#C9D1D9", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>{p.qty}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#8B949E", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>{p.cost}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#C9D1D9", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>{p.price}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#E6EDF3", textAlign: "right", fontWeight: 600, borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>{p.value}</div>
              <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums", color: p.up ? "#3FB950" : "#F85149", background: p.up ? "rgba(63,185,80,0.05)" : "rgba(248,81,73,0.05)" }}>
                {p.up ? "+" : ""}{p.pl.toFixed(2)}
              </div>
              <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ background: p.up ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: p.up ? "#3FB950" : "#F85149", padding: "1px 5px", borderRadius: 2, fontSize: 11 }}>
                  {p.up ? "▲" : "▼"} {Math.abs(p.pct).toFixed(2)}%
                </span>
              </div>
              <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", color: "#8B949E" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 40, height: 6, background: "#21262D", borderRadius: 1 }}>
                    <div style={{ width: `${[52.5,18.1,20.9,5.2,3.3][i]}%`, height: "100%", background: "#1F6FEB", borderRadius: 1 }} />
                  </div>
                  <span style={{ fontSize: 10 }}>{[52.5,18.1,20.9,5.2,3.3][i]}%</span>
                </div>
              </div>
            </div>
          ))}

          {/* Totals row */}
          <div style={{ display: "flex", borderBottom: "2px solid #30363D", background: "#161B22" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "6px", fontSize: 10, color: "#484F58", textAlign: "center" }}>8</div>
            <div style={{ flex: 1, padding: "6px 8px", color: "#6E7681", fontWeight: 600, borderRight: "1px solid #21262D", fontSize: 10 }}>TOTAL</div>
            <div style={{ flex: 1, padding: "6px 8px", borderRight: "1px solid #21262D" }} />
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", borderRight: "1px solid #21262D", color: "#E6EDF3", fontWeight: 700 }}>43</div>
            <div style={{ flex: 1, padding: "6px 8px", borderRight: "1px solid #21262D" }} />
            <div style={{ flex: 1, padding: "6px 8px", borderRight: "1px solid #21262D" }} />
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", borderRight: "1px solid #21262D", color: "#E6EDF3", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>£12,172.15</div>
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", borderRight: "1px solid #21262D", color: "#3FB950", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>+£3,802.74</div>
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", color: "#3FB950", fontWeight: 700, borderRight: "1px solid #21262D" }}>▲ 45.42%</div>
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", color: "#8B949E" }}>100%</div>
          </div>

          {/* Gap row */}
          <div style={{ height: 12, borderBottom: "1px solid #21262D" }} />

          {/* Accounts section */}
          <div style={{ display: "flex", borderBottom: "1px solid #21262D", background: "#1A3A1A" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid rgba(255,255,255,0.1)", padding: "3px 6px", fontSize: 10, color: "#8B949E", textAlign: "center" }}>10</div>
            <div style={{ flex: 1, padding: "4px 8px", color: "#3FB950", fontWeight: 700, fontSize: 11 }}>▼ CASH ACCOUNTS — Multi-Currency (GBP Base)</div>
          </div>
          <div style={{ display: "flex", borderBottom: "2px solid #30363D", background: "#161B22" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "5px 6px", textAlign: "center" }} />
            {["ACCOUNT NAME","TYPE","CURRENCY","BALANCE (NATIVE)","BALANCE (GBP)","","","",""].map((h, i) => (
              <div key={i} style={{ flex: 1, padding: "5px 8px", fontSize: 10, color: "#8B949E", fontWeight: 600, borderRight: "1px solid #21262D", textAlign: i > 1 ? "right" : "left" }}>{h}</div>
            ))}
          </div>
          {accounts.map((a, i) => (
            <div key={a.name} style={{ display: "flex", borderBottom: "1px solid rgba(33,38,45,0.6)", background: i % 2 === 0 ? "#0D1117" : "#111820" }}>
              <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "5px 6px", fontSize: 10, color: "#484F58", textAlign: "center" }}>{i + 11}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#C9D1D9", borderRight: "1px solid #21262D" }}>{a.name}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#8B949E", borderRight: "1px solid #21262D" }}>{a.type}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#58A6FF", fontWeight: 600, borderRight: "1px solid #21262D" }}>{a.ccy}</div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#C9D1D9", textAlign: "right", borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>
                {a.balance.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ flex: 1, padding: "6px 8px", color: "#3FB950", textAlign: "right", fontWeight: 600, borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>
                {a.gbp.toLocaleString("en-GB", { style: "currency", currency: "GBP" })}
              </div>
              {[6,7,8].map(j => <div key={j} style={{ flex: 1, borderRight: "1px solid #21262D" }} />)}
            </div>
          ))}
          <div style={{ display: "flex", borderBottom: "2px solid #30363D", background: "#161B22" }}>
            <div style={{ flex: "0 0 3%", borderRight: "1px solid #21262D", padding: "6px", fontSize: 10, color: "#484F58", textAlign: "center" }}>14</div>
            <div style={{ flex: 1, padding: "6px 8px", color: "#6E7681", fontWeight: 600, borderRight: "1px solid #21262D", fontSize: 10 }}>TOTAL CASH</div>
            {[1,2,3].map(j => <div key={j} style={{ flex: 1, borderRight: "1px solid #21262D" }} />)}
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", color: "#3FB950", fontWeight: 700, borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>=SUM(E11:E13)</div>
            <div style={{ flex: 1, padding: "6px 8px", textAlign: "right", color: "#3FB950", fontWeight: 700, borderRight: "1px solid #21262D", fontVariantNumeric: "tabular-nums" }}>£10,089.58</div>
            {[6,7,8].map(j => <div key={j} style={{ flex: 1, borderRight: "1px solid #21262D" }} />)}
          </div>

          {/* Monthly summary */}
          <div style={{ display: "flex", marginTop: 12, borderTop: "1px solid #21262D", background: "#161B22", padding: "8px 0" }}>
            <div style={{ flex: "0 0 3%" }} />
            <div style={{ display: "flex", gap: 0, flex: 1 }}>
              {[
                { label: "Net Worth", val: "£22,261.73", color: "#58A6FF" },
                { label: "Jun Income", val: "+£5,107.26", color: "#3FB950" },
                { label: "Jun Expenses", val: "-£99.64", color: "#F85149" },
                { label: "Net Savings", val: "+£5,007.62", color: "#3FB950" },
                { label: "Savings Rate", val: "98.05%", color: "#3FB950" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, padding: "6px 12px", borderRight: "1px solid #21262D" }}>
                  <div style={{ fontSize: 9, color: "#6E7681", marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, color: s.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
