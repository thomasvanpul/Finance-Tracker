// The book: claims on money above the spread, money held below it.
// Both lists run outward from the spread line, and each depth bar is the
// running total from the line to that row, on ONE scale shared by both sides.
window.SpreadBook = (function () {
  const { money, dayLabel, accounts, pastDue, dueToday, ahead, alloc, owing, positions, sum, change20d } = N;

  function build() {
    const asks = [];
    if (pastDue.length) {
      const first = pastDue[0].dueDate, last = pastDue[pastDue.length - 1].dueDate;
      asks.push({ when: dayLabel(first).split(" ")[0] + "–" + dayLabel(last).split(" ")[0], name: `${pastDue.length} past due`,
        gbp: sum(pastDue, (u) => u.baseEquivalent), cls: "crossed", dotted: true });
    }
    for (const u of dueToday) asks.push({ when: "today", name: u.description, gbp: u.baseEquivalent, dotted: true });
    for (const u of ahead) asks.push({ when: dayLabel(u.dueDate), name: u.description, gbp: u.baseEquivalent, dotted: true,
      native: u.currency !== "GBP" ? money(u.nativeAmount, u.currency) : null });
    for (const d of owing.filter((d) => d.direction === "i_owe_them" && d.status === "pending"))
      asks.push({ when: "owe", name: d.personName, gbp: d.baseEquivalent });
    asks.push({ when: "30d", name: "Goals", gbp: alloc.goalClaim, cls: "goal", dotted: true });
    for (const a of accounts.filter((a) => a.type === "liability"))
      asks.push({ when: "loan", name: a.name, gbp: a.baseEquivalent });

    const byType = (t) => accounts.filter((a) => a.type === t);
    const acc = (a) => ({ when: a.currency, name: a.name, gbp: a.baseEquivalent, id: a.id,
      native: a.currency !== "GBP" ? money(a.balance, a.currency) : null, chg: change20d(a) });
    const cash = byType("cash").sort((a, b) => a.baseEquivalent - b.baseEquivalent);
    // liquid first: current account, then foreign wallets, then savings
    const order = ["Monzo Current", "Wise EUR", "Maybank MYR", "Barclays Savings"];
    cash.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const owed = owing.filter((d) => d.direction === "they_owe_me" && d.status === "pending");
    const bids = [
      ...cash.map(acc),
      { when: "owed", name: owed.map((d) => d.personName.split(" ")[0]).join(", "), gbp: sum(owed, (d) => d.baseEquivalent), cls: "promise", dotted: true },
      ...byType("investment").map(acc),
      { when: "5 pos", name: positions.map((p) => p.ticker.replace(/[.-].*/, "")).join(" "), gbp: sum(positions, (p) => p.costBasisValueBase), cost: true },
      ...byType("pension").map(acc),
      ...byType("property").map(acc),
    ];
    for (const side of [asks, bids]) { let c = 0; for (const r of side) { c += r.gbp; r.cum = c; } }
    const scale = asks[asks.length - 1].cum; // the whole claim side is the ruler
    return { asks, bids, scale };
  }

  function render(el, rows, scale, width) {
    el.innerHTML = rows.map((r) => {
      const frac = r.cum / scale;
      const off = frac > 1;
      const w = Math.min(frac, 1) * width;
      const conv = r.native ? " conv" : "";
      const gbp = money(r.gbp) + (r.native ? '<span class="fx">fx</span>' : r.cost ? '<span class="cost">cost</span>' : "");
      return `<div class="row ${r.cls ?? ""}${conv}">
        <div class="depth${off ? " off" : ""}" style="width:${w.toFixed(1)}px"></div>
        <span class="when">${r.when}</span>
        <span class="name">${r.name}</span>
        <span class="native pnum">${r.native ?? ""}</span>
        <span class="gbp pnum${r.dotted ? " dotted" : ""}">${gbp}</span>
      </div>`;
    }).join("");
  }
  return { build, render };
})();
