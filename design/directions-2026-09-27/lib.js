// Shared helpers for the 27 Sep direction stills.
// Every figure is read or summed from window.NUMERIS_DATA (data.js, a verbatim
// wrapper of data.json fetched from the dev API). Nothing here invents a value.
(function () {
  const D = window.NUMERIS_DATA;
  const SYM = { GBP: "£", EUR: "€", USD: "$", MYR: "RM " };

  function money(v, cur = "GBP", opts = {}) {
    const n = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = v < 0 ? "−" : opts.signed && v > 0 ? "+" : "";
    return sign + (SYM[cur] ?? cur + " ") + n;
  }
  function pct(v, dp = 2) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(dp) + "%"; }
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function dayLabel(iso) { const [, m, d] = iso.split("-"); return `${+d} ${MON[+m - 1]}`; }
  function days(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

  const today = D.allocation.today;
  const dash = D.dashboard;
  const accounts = D.accounts;
  const drift = D["accounts/fx-drift"].accounts;
  const driftById = Object.fromEntries(drift.map((a) => [a.accountId, a]));
  function change20d(acc) {
    const d = driftById[acc.id];
    if (!d) return null;
    const base = d.baselineBalance * d.baselineRate;
    return { delta: d.totalDeltaBase, fx: d.fxDeltaBase, pct: base ? (d.totalDeltaBase / base) * 100 : 0 };
  }

  const upcoming = D.upcoming.filter((u) => u.status === "pending" && u.type === "expense");
  const pastDue = upcoming.filter((u) => u.dueDate < today);
  const dueToday = upcoming.filter((u) => u.dueDate === today);
  const ahead = upcoming.filter((u) => u.dueDate > today);
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

  // Spending by month and category, from the transaction rows (expenses only).
  const tx = D.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const spendByMonth = {};
  for (const t of tx) {
    if (t.type !== "expense") continue;
    const m = t.date.slice(0, 7);
    spendByMonth[m] ??= {};
    spendByMonth[m][t.category] = (spendByMonth[m][t.category] ?? 0) + Math.abs(t.baseEquivalent);
  }

  // Squarified treemap (Bruls, Huizing, van Wijk 2000). items: [{value,...}]
  function squarify(items, x, y, w, h) {
    const total = sum(items, (i) => i.value);
    const scale = (w * h) / total;
    const nodes = items.map((i) => ({ ...i, area: i.value * scale })).sort((a, b) => b.area - a.area);
    const out = [];
    let row = [], rect = { x, y, w, h };
    const worst = (r, side) => {
      const s = sum(r, (n) => n.area), mx = Math.max(...r.map((n) => n.area)), mn = Math.min(...r.map((n) => n.area));
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    const layRow = (r) => {
      const s = sum(r, (n) => n.area);
      if (rect.w >= rect.h) {
        const cw = s / rect.h; let cy = rect.y;
        for (const n of r) { const ch = n.area / cw; out.push({ ...n, x: rect.x, y: cy, w: cw, h: ch }); cy += ch; }
        rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
      } else {
        const ch = s / rect.w; let cx = rect.x;
        for (const n of r) { const cw = n.area / ch; out.push({ ...n, x: cx, y: rect.y, w: cw, h: ch }); cx += cw; }
        rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
      }
    };
    for (const n of nodes) {
      const side = Math.min(rect.w, rect.h);
      if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) row.push(n);
      else { layRow(row); row = [n]; }
    }
    if (row.length) layRow(row);
    return out;
  }

  window.N = {
    D, money, pct, dayLabel, days, today, dash, accounts, change20d, driftById,
    upcoming, pastDue, dueToday, ahead, sum, tx, spendByMonth, squarify,
    alloc: D.allocation, attrib: D["accounts/change-attribution"], budgets: D.budgets,
    positions: D.investments, owing: D.debts, fx: D["market/fx-rates"],
    history: dash.monthlyHistory,
  };
})();
