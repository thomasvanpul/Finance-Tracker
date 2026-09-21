#!/usr/bin/env python3
"""Write README.md for the board from board.json and status.json.

Generated, so the numbering, the `why` lines and the capture outcome are the
same ones the picker shows. Run after the capture script.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
board = json.loads((HERE / "board.json").read_text())
status = {r["id"]: r for r in json.loads((HERE / "status.json").read_text())}

lines = [
    "# Numeris reference board",
    "",
    "Screens from outside the generic fintech template, gathered 19 Sep 2026 after",
    "Thomas rejected all five rendered directions as \"vibe coded finance appy\".",
    "Each is one image here, numbered as below, and one screen in the picker",
    "(`python3 tools/picker/serve.py`), where he taps love / like / neutral / wrong",
    "for Numeris. His answers land in the vault at `Efforts/Numeris-Taste.md`.",
    "",
    "The `why` line is the reason the screen is on the board, written before the",
    "capture and checked against it. Captured headless at 1600x1000 by",
    "`scripts/src/reference-board-capture.ts`; the four Tron frames are copied from",
    "`Atlas/Projects/Atrium/References/` in the vault. `status.json` records every",
    "outcome, including the ones that failed.",
    "",
]
ok = fail = 0
for group in board["groups"]:
    lines += [f"## {group}", ""]
    for n, s in enumerate(board["screens"], start=1):
        if s["group"] != group:
            continue
        st = status.get(s["id"], {})
        src = s.get("url") or f"vault: {s.get('copy')}"
        if st.get("ok"):
            ok += 1
            lines.append(f"{n}. **{s['title']}** — {s['why']}  ")
            lines.append(f"    `{st['file']}` · {src}")
        else:
            fail += 1
            lines.append(f"{n}. ~~{s['title']}~~ — not captured: {st.get('error', 'no status')}. {s['why']}  ")
            lines.append(f"    {src}")
    lines.append("")
lines += [f"{ok} screens captured, {fail} not, of {ok + fail} listed.", ""]
(HERE / "README.md").write_text("\n".join(lines))
print(f"README.md: {ok} ok, {fail} failed")
