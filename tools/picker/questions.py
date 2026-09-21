"""What the Numeris picker asks, read from the board manifest rather than typed twice.

The screens come from `design/reference-board/board.json`, which is also what the
capture script reads. One manifest, so a screen added or dropped there appears
or disappears here with no second edit, and the `why` line under each image is
the same line the README carries.

The five taste questions are the money-specific ones the task asked for. They
are declared here, verbatim, because there is no vault note yet that poses them:
the answers file this picker writes (`Efforts/Numeris-Taste.md`) is where they
first land.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
BOARD = REPO / "design" / "reference-board"
MANIFEST = BOARD / "board.json"
REFERENCES = BOARD          # thumbs.py reads this name; the images sit beside the manifest

VAULT = Path(
    "~/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault_general"
).expanduser()

# Four points, not five: an odd number invites the middle, and "neutral" is
# already the shrug. Same scale as the Atrium run so the two files compare.
VERDICT = ["love", "like", "neutral", "wrong for Numeris"]

FRAME_QUESTION = "If Numeris looked like this, what would be wrong?"


def _manifest() -> dict:
    try:
        return json.loads(MANIFEST.read_text())
    except (OSError, ValueError) as exc:
        raise SystemExit(f"{MANIFEST}: cannot read the board manifest: {exc}") from exc


def _status() -> dict[str, dict]:
    """Capture status by id. A screen whose capture failed has no image to judge."""
    try:
        rows = json.loads((BOARD / "status.json").read_text())
    except (OSError, ValueError):
        return {}
    return {r["id"]: r for r in rows}


def frames() -> list[dict]:
    """Every screen with an image on disk, in manifest order, numbered as the files are."""
    status = _status()
    out: list[dict] = []
    for n, s in enumerate(_manifest()["screens"], start=1):
        image = f"{n:02d}-{s['id']}.jpg"
        if not (BOARD / image).exists():
            continue
        if status.get(s["id"], {}).get("ok") is False:
            continue
        out.append({
            "id": s["id"],
            "n": n,
            "group": s["group"],
            "title": s["title"],
            "aside": s["why"],
            "source": s.get("url") or s.get("copy", ""),
            "question": FRAME_QUESTION,
            "image": image,
        })
    return out


def all_images() -> list[str]:
    """The board's images, for the two pick-a-screen closers and the thumbnailer."""
    return [f["image"] for f in frames()]


def closing() -> list[dict]:
    return [
        {
            "id": "trying-to-be",
            "question": "Which single screen is Numeris trying to be?",
            "note": "One, not a list. The next task draws from this one first.",
            "kind": "pick-frame",
        },
        {
            "id": "beautiful-but-wrong",
            "question": "Which screen is beautiful and would be wrong for money?",
            "note": "There is at least one.",
            "kind": "pick-frame",
        },
    ]


# The five money questions. `options` are tapped; `note_label` is an optional
# one-liner under them; `fields` are typed answers with no options.
TASTE: list[dict] = [
    {
        "id": "dense-or-calm",
        "source": "Numeris",
        "prompt": "Dense or calm?",
        "question": "When Numeris opens, is the first screen everything at once, small "
                    "and dense, or one figure with air around it?",
        "options": ["dense", "calm", "dense on the Mac, calm on the phone", "depends on the hour"],
        "note_label": "What decides it?",
    },
    {
        "id": "numbers-or-shapes",
        "source": "Numeris",
        "prompt": "Numbers or shapes?",
        "question": "A figure like £11,371: is it best shown as the number, or as a "
                    "shape (a bar, a length, an area) with the number second?",
        "options": ["the number, always", "the shape, number second", "both, number wins",
                    "a shape only when it says something a number cannot"],
        "note_label": "Name a chart you have never wanted in a money app.",
    },
    {
        "id": "net-worth-feel",
        "source": "Numeris",
        "prompt": "How should seeing your net worth feel?",
        "question": "Not what it shows. What it feels like to look at.",
        "options": ["a readout on an instrument", "a line in a ledger", "a score",
                    "a landscape I move through"],
        "note_label": "What should it never feel like?",
    },
    {
        "id": "phone-glance-or-work",
        "source": "Numeris",
        "prompt": "The phone: a glance, or a place to work?",
        "question": "A glance answers one question in ten seconds. Work is entering, "
                    "categorising, planning, moving money.",
        "options": ["a glance", "a place to work", "a glance by default, work when I tap in"],
        "note_label": "What is the one question the glance answers?",
    },
    {
        "id": "colour",
        "source": "Numeris",
        "prompt": "Colour in a money app.",
        "question": "Numeris has eleven themes. Which of these is actually right?",
        "options": ["monochrome, one signal colour", "red and green for direction, nothing else",
                    "a full palette, colour as category", "dark ground, light-emitting data"],
        "note_label": "Which of the eleven themes have you actually used, and why that one?",
    },
]


def payload() -> dict:
    """Everything the page needs, in the order it is asked."""
    f = frames()
    return {
        "verdict": VERDICT,
        "frames": f,
        "closing": closing(),
        "taste": TASTE,
        "images": [x["image"] for x in f],
        "groups": _manifest().get("groups", []),
    }


if __name__ == "__main__":
    f = frames()
    print(f"{f and len(f)} screens on the board, {len(TASTE)} taste questions")
    for g in dict.fromkeys(x["group"] for x in f):
        print(f"  {g}: {sum(1 for x in f if x['group'] == g)}")
