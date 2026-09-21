/* The Numeris picker (adapted from ~/dev/atrium-design/tools/picker).
 *
 * One question per screen. Every tap is POSTed before the next screen is drawn,
 * so the file on disk is never behind what is on the glass. Nothing is held in
 * memory waiting for a submit button, because there isn't one — the run has no
 * end state that matters, only a growing file.
 *
 * Questions are never written here. They arrive from /api/questions, which reads
 * them out of design/reference-board/board.json and tools/picker/questions.py. A string of Thomas's own words hardcoded in this file
 * would be a second copy of the question, and the second copy goes stale.
 */

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};

const state = {
  data: null,
  answers: {},   // key -> answer text
  screens: [],
  at: 0,
};

/* ---- writing ------------------------------------------------------------ */

let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("bad", bad);
  t.classList.add("up");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("up"), 1400);
}

async function write(key, subject, question, answer) {
  if (state.answers[key] === answer) return true;   // no duplicate line for a re-tap
  try {
    const r = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, subject, question, answer }),
    });
    if (!r.ok) throw new Error((await r.json()).error || r.statusText);
    state.answers[key] = answer;
    toast("written");
    bar();
    return true;
  } catch (e) {
    // Loud, because the entire promise of this page is that the answer landed.
    // A silent failure here means he taps fifty times into nothing.
    toast("NOT WRITTEN — " + e.message, true);
    return false;
  }
}

/* ---- pieces ------------------------------------------------------------- */

function options({ key, subject, question, choices, onPick }) {
  const row = el("div", { className: "row" });
  for (const choice of choices) {
    const b = el("button", { type: "button", className: "opt" });
    b.setAttribute("aria-pressed", String(state.answers[key] === choice));
    b.append(el("span", { className: "key" }), el("span", { textContent: choice }));
    b.onclick = async () => {
      if (!(await write(key, subject, question, choice))) return;
      for (const other of row.querySelectorAll(".opt"))
        other.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-pressed", "true");
      onPick?.();
    };
    row.append(b);
  }
  return row;
}

function noteField({ key, subject, question, label }) {
  const input = el("input", {
    type: "text",
    value: state.answers[key] || "",
    placeholder: "optional — one line",
    autocapitalize: "sentences",
    autocomplete: "off",
    spellcheck: true,
  });
  if (state.answers[key]) input.classList.add("saved");
  const save = async () => {
    const v = input.value.trim();
    if (!v || state.answers[key] === v) return;
    if (await write(key, subject, `${question} — ${label}`, v)) input.classList.add("saved");
  };
  input.onblur = save;
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
  };
  const wrap = el("div", { className: "note" }, [
    el("label", { textContent: label }),
    input,
  ]);
  wrap.dataset.key = key;
  return wrap;
}

function labelled(text, row) {
  row.prepend(el("div", { className: "row-label", textContent: text }));
  return row;
}

/* ---- screens ------------------------------------------------------------ */

function screenIntro() {
  const done = Object.keys(state.answers).length;
  const stale = state.data.stale || [];
  const kids = [
    el("h1", { textContent: "The Numeris board" }),
    el("p", {}, [
      el("strong", { textContent: `${state.data.frames.length} screens` }),
      document.createTextNode(", two closing picks, then "),
      el("strong", { textContent: `${state.data.taste.length} about money` }),
      document.createTextNode("."),
    ]),
    el("p", {
      textContent:
        "Tap an answer. It is written to the vault before the next screen draws, " +
        "so stopping halfway leaves half the answers behind rather than none.",
    }),
    el("p", {
      textContent:
        "Number keys pick. Arrow keys move. Notes are optional everywhere — " +
        "a verdict with no note still counts.",
    }),
  ];
  if (done) kids.push(el("p", {}, [
    el("strong", { textContent: `${done} answers already on file. ` }),
    document.createTextNode("Picking again writes a new line; the newest one wins."),
  ]));
  if (stale.length) kids.push(el("p", { className: "warn" }, [
    el("strong", { textContent: "Some prompts have moved in the vault: " }),
    document.createTextNode(stale.join(" · ")),
  ]));
  return el("div", { className: "prose" }, kids);
}

function screenFrame(frame) {
  const subject = frame.image;
  const plate = el("div", { className: "plate" }, [
    el("img", { src: `/frames/view/${encodeURIComponent(frame.image)}`, alt: frame.id }),
  ]);
  if (frame.aside) plate.append(el("div", { className: "aside", textContent: frame.aside }));
  plate.append(el("a", {
    className: "full",
    href: `/frames/original/${encodeURIComponent(frame.image)}`,
    target: "_blank",
    rel: "noopener",
    textContent: "full size",
  }));

  const vKey = `frame/${frame.id}/verdict`;
  const maybeAdvance = () => {
    if (!state.answers[vKey]) return;
    const typing = document.activeElement?.tagName === "INPUT";
    const written = [...ask.querySelectorAll(".note input")].some((i) => i.value.trim());
    // Only when there is nothing half-typed. Advancing out from under a note he
    // is still writing would lose it, and losing one is worse than a tap.
    if (!typing && !written) setTimeout(() => go(state.at + 1), 420);
  };

  const ask = el("div", { className: "ask" }, [
    el("h2", { className: "q" }, [
      document.createTextNode(frame.question),
      el("span", { className: "quiet", textContent: `${frame.n} · ${frame.title} · ${frame.group}` }),
    ]),
    labelled("verdict", options({
      key: vKey, subject, question: frame.question,
      choices: state.data.verdict, onPick: maybeAdvance,
    })),
    el("div", { className: "notes" }, [
      noteField({ key: `frame/${frame.id}/steal`, subject, question: frame.question, label: "Steal" }),
      noteField({ key: `frame/${frame.id}/ignore`, subject, question: frame.question, label: "Ignore" }),
    ]),
  ]);

  return [plate, ask];
}

function screenPick(q) {
  const key = `closing/${q.id}`;
  const grid = el("div", { className: "grid" });
  for (const name of state.data.images) {
    const cell = el("button", { type: "button", className: "cell" });
    cell.setAttribute("aria-pressed", String(state.answers[key] === name));
    cell.append(
      el("img", { src: `/frames/thumb/${encodeURIComponent(name)}`, loading: "lazy", alt: name }),
      el("figcaption", { textContent: name.replace(/\.jpg$/, "").replace(/^(\d+)-/, "$1 · ") }),
    );
    cell.onclick = async () => {
      if (!(await write(key, name, q.question, name))) return;
      for (const other of grid.querySelectorAll(".cell"))
        other.setAttribute("aria-pressed", "false");
      cell.setAttribute("aria-pressed", "true");
    };
    grid.append(cell);
  }
  const ask = el("div", { className: "ask" }, [
    el("h2", { className: "q" }, [
      document.createTextNode(q.question),
      el("span", { className: "quiet", textContent: q.note }),
    ]),
  ]);
  return [ask, grid];
}

function screenChoice(q) {
  const key = `closing/${q.id}`;
  const ask = el("div", { className: "ask" }, [
    el("h2", { className: "q" }, [
      document.createTextNode(q.question),
      el("span", { className: "quiet", textContent: q.note }),
    ]),
    options({ key, subject: "the board", question: q.question, choices: q.options }),
    el("div", { className: "notes" }, [
      noteField({ key: `${key}/why`, subject: "the board", question: q.question, label: "Why" }),
    ]),
  ]);
  return el("div", { className: "prose" }, [ask]);
}

function screenTaste(q) {
  const key = `taste/${q.id}`;
  const kids = [
    el("h2", { className: "q" }, [
      document.createTextNode(q.prompt),
      q.question ? el("span", { className: "quiet", textContent: q.question }) : "",
    ]),
  ];
  if (q.options) {
    kids.push(options({ key, subject: q.source, question: q.prompt, choices: q.options }));
  }
  if (q.note_label) {
    kids.push(el("div", { className: "notes" }, [
      noteField({ key: `${key}/note`, subject: q.source, question: q.prompt, label: q.note_label }),
    ]));
  }
  if (q.fields) {
    const notes = el("div", { className: "notes" });
    for (const f of q.fields) {
      notes.append(noteField({
        key: `${key}/${f.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        subject: q.source, question: q.prompt, label: f,
      }));
    }
    kids.push(notes);
  }
  if (q.source !== "Numeris") kids.push(el("p", { className: "quiet", textContent: `from ${q.source}` }));
  return el("div", { className: "prose" }, [el("div", { className: "ask" }, kids)]);
}

function screenDone() {
  const total = state.screens.filter((s) => s.kind !== "intro" && s.kind !== "done").length;
  const done = state.screens.filter(isDone).length - 1; // the intro is always "done"
  return el("div", { className: "prose" }, [
    el("h1", { textContent: done >= total ? "All of them." : "Stopped here." }),
    el("p", {}, [
      el("strong", { textContent: `${Object.keys(state.answers).length} answers ` }),
      document.createTextNode(`across ${done} of ${total} questions, already in the vault.`),
    ]),
    el("p", {}, [
      document.createTextNode("They are in "),
      el("code", { textContent: "Efforts/Numeris-Taste.md" }),
      document.createTextNode(", one line each, oldest first."),
    ]),
    el("p", {
      textContent:
        done >= total
          ? "Nothing else to do. Close the tab; the file is already written."
          : "Come back to any screen with the arrow keys — nothing here has to be finished in one go.",
    }),
  ]);
}

/* ---- assembly ----------------------------------------------------------- */

function build() {
  const s = [{ kind: "intro", where: "start" }];
  for (const f of state.data.frames) s.push({ kind: "frame", frame: f, where: f.group });
  for (const q of state.data.closing)
    s.push({ kind: q.kind === "pick-frame" ? "pick" : "choice", q, where: "the two" });
  for (const q of state.data.taste) s.push({ kind: "taste", q, where: "money" });
  s.push({ kind: "done", where: "end" });
  state.screens = s;
}

function isDone(s) {
  if (s.kind === "intro" || s.kind === "done") return true;
  if (s.kind === "frame") return !!state.answers[`frame/${s.frame.id}/verdict`];
  if (s.kind === "pick" || s.kind === "choice") return !!state.answers[`closing/${s.q.id}`];
  if (s.kind === "taste") {
    const k = `taste/${s.q.id}`;
    return Object.keys(state.answers).some((x) => x === k || x.startsWith(k + "/"));
  }
  return false;
}

function bar() {
  const s = state.screens[state.at];
  const asked = state.screens.filter((x) => x.kind !== "intro" && x.kind !== "done");
  const done = asked.filter(isDone).length;
  $("#where").textContent = s.where;
  $("#count").textContent = `${done} / ${asked.length}`;
  $("#track-fill").style.width = `${(done / asked.length) * 100}%`;
  $("#prev").disabled = state.at === 0;
  $("#next").disabled = state.at === state.screens.length - 1;
  $("#next").textContent = state.at === state.screens.length - 2 ? "Finish →" : "Next →";
}

function go(i) {
  state.at = Math.max(0, Math.min(state.screens.length - 1, i));
  const s = state.screens[state.at];
  const root = $("#screen");
  root.replaceChildren();
  if (s.kind === "intro") root.append(screenIntro());
  else if (s.kind === "frame") root.append(...screenFrame(s.frame));
  else if (s.kind === "pick") root.append(...screenPick(s.q));
  else if (s.kind === "choice") root.append(screenChoice(s.q));
  else if (s.kind === "taste") root.append(screenTaste(s.q));
  else root.append(screenDone());
  // Number the tappable options in document order, so "3" is unambiguous even
  // when a screen carries two rows of them.
  [...root.querySelectorAll(".opt .key")].forEach((k, n) => (k.textContent = n + 1));
  bar();
  root.scrollTop = 0;
  root.focus({ preventScroll: true });
  history.replaceState(null, "", `#${state.at}`);
}

function keys(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = e.target.tagName === "INPUT";
  if (e.key === "ArrowRight" && !typing) { e.preventDefault(); return go(state.at + 1); }
  if (e.key === "ArrowLeft" && !typing) { e.preventDefault(); return go(state.at - 1); }
  if (typing) return;
  if (/^[1-9]$/.test(e.key)) {
    const opts = $("#screen").querySelectorAll(".opt");
    const pick = opts[Number(e.key) - 1];
    if (pick) { e.preventDefault(); pick.click(); }
  }
}

async function boot() {
  try {
    const [q, a] = await Promise.all([
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/answers").then((r) => r.json()),
    ]);
    state.data = q;
    state.answers = a.answered || {};
  } catch (e) {
    $("#screen").append(el("div", { className: "prose" }, [
      el("h1", { textContent: "The server is not answering." }),
      el("p", { textContent: String(e) }),
      el("p", { textContent: "Is tools/picker/serve.py still running in the terminal?" }),
    ]));
    return;
  }
  build();
  $("#prev").onclick = () => go(state.at - 1);
  $("#next").onclick = () => go(state.at + 1);
  document.addEventListener("keydown", keys);
  const at = Number(location.hash.slice(1));
  go(Number.isInteger(at) && at > 0 ? at : 0);
}

boot();
