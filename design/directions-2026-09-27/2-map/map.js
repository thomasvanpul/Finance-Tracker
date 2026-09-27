// The map: everything held, as area. One px² is the same number of pounds
// everywhere on a screen, so a tile's size is its share of net worth.
window.WorthMap = (function () {
  const { money, accounts, positions, owing, change20d, squarify, sum } = N;

  function groups() {
    const acc = (a) => ({ key: a.name, name: a.name, value: a.baseEquivalent, cur: a.currency, native: a.balance, chg: change20d(a) });
    const of = (t) => accounts.filter((a) => a.type === t).map(acc);
    const owed = owing.filter((d) => d.direction === "they_owe_me" && d.status === "pending")
      .map((d) => ({ key: d.personName, name: d.personName.split(" ")[0], value: d.baseEquivalent, cur: d.currency, native: d.nativeAmount, promise: true }));
    return [
      { name: "PROPERTY", items: of("property") },
      { name: "PENSION", items: of("pension") },
      { name: "INVESTED", items: [...of("investment"), ...positions.map((p) => ({ key: p.ticker, name: p.ticker.replace(/\.L$/, ""), value: p.costBasisValueBase, cost: true }))] },
      { name: "CASH", items: of("cash") },
      { name: "OWED", items: owed },
    ].map((g) => ({ ...g, value: sum(g.items, (i) => i.value) }));
  }

  // Colour is the 20-day move only: grey did not move, green rose, red fell.
  function tint(chg) {
    if (!chg || Math.abs(chg.pct) < 0.05) return null;
    const k = Math.min(Math.abs(chg.pct) / 3, 1);
    const [r, g, b] = chg.pct > 0 ? [38, 140, 76] : [176, 52, 62];
    const base = [44, 49, 58];
    const mix = (i) => Math.round(base[i] + ([r, g, b][i] - base[i]) * (0.45 + 0.55 * k));
    return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
  }

  const MONO_W = 0.6; // JetBrains Mono advance width per px of font size
  function tileHTML(t, opts = {}) {
    const minSide = Math.min(t.w, t.h), area = t.w * t.h;
    let fs = Math.max(9, Math.min(opts.maxName ?? 30, Math.sqrt(area) / 6.5));
    const nameW = t.name.length * fs * 0.6;
    const lines = [];
    let vfs = Math.max(9, Math.min(opts.maxVal ?? 15, fs * 0.55));
    if (nameW < t.w - 8 && fs + 4 < t.h) lines.push(`<span class="tn" style="font-size:${fs.toFixed(1)}px">${t.name}</span>`);
    else if (minSide > 22) { fs = Math.min(fs, (t.w - 12) / (t.name.length * 0.6)); if (fs >= 8.5) lines.push(`<span class="tn" style="font-size:${fs.toFixed(1)}px">${t.name}</span>`); }
    const foreign = t.cur && t.cur !== "GBP";
    const nat = foreign ? money(t.native, t.cur) : money(t.value);
    const suffix = t.cost ? '<span class="cost">cost</span>' : "";
    // A figure is placed only if the whole string fits, else it is dropped.
    const fits = (str, size) => (str.length + 1.5) * size * MONO_W < t.w - 6;
    const room = t.h - (lines.length ? fs + 6 : 0);
    if (lines.length && fits(nat, vfs) && room > vfs * (foreign ? 2.4 : 1.3)) {
      lines.push(`<span class="tv" style="font-size:${vfs.toFixed(1)}px">${nat}${foreign ? "" : suffix}</span>`);
      if (foreign && fits(money(t.value) + "fx", vfs * 0.85)) lines.push(`<span class="tc" style="font-size:${(vfs * 0.85).toFixed(1)}px">${money(t.value)}<span class="fx">fx</span></span>`);
      if (t.chg && Math.abs(t.chg.pct) >= 0.05 && room > vfs * 3.6) lines.push(`<span class="tc" style="font-size:${(vfs * 0.85).toFixed(1)}px">${N.pct(t.chg.pct)} 20d</span>`);
    }
    const bg = t.promise || t.cost ? "" : tint(t.chg);
    return `<div class="tile${t.cost ? " cost" : ""}${t.promise ? " promise" : ""}" data-key="${t.key}" style="left:${t.x.toFixed(1)}px;top:${t.y.toFixed(1)}px;width:${t.w.toFixed(1)}px;height:${t.h.toFixed(1)}px;${bg ? `background-color:${bg}` : ""}">${lines.join("")}</div>`;
  }

  // Lay groups, then items inside each group, with a gap and a header band.
  function render(el, W, H, opts = {}) {
    const gap = opts.gap ?? 2, head = opts.head ?? 15;
    const gs = groups();
    const total = sum(gs, (g) => g.value);
    const rects = squarify(gs.map((g) => ({ ...g })), 0, 0, W, H);
    let html = "";
    for (const g of rects) {
      const gx = g.x + gap / 2, gy = g.y + gap / 2, gw = g.w - gap, gh = g.h - gap;
      const showHead = gw > 60 && gh > 60;
      const hh = showHead ? head : 0;
      html += `<div class="grp" style="left:${gx.toFixed(1)}px;top:${gy.toFixed(1)}px;width:${gw.toFixed(1)}px;height:${gh.toFixed(1)}px">`;
      if (showHead) html += `<div class="gh"><span>${g.name}</span>${gw > 150 ? `<span class="pnum">${(g.value / total * 100).toFixed(1)}%</span>` : ""}</div>`;
      for (const t of squarify(g.items, 0, hh, gw, gh - hh)) {
        html += tileHTML({ ...t, x: t.x + gap / 2, y: t.y + gap / 2, w: t.w - gap, h: t.h - gap }, opts);
      }
      html += `</div>`;
    }
    el.style.width = W + "px"; el.style.height = H + "px";
    el.innerHTML = html;
    return { total, pxPerPound: (W * H) / total, groups: rects };
  }
  return { groups, render, tileHTML, tint };
})();
