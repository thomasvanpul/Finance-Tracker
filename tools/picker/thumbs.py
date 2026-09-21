"""Cached downscales of the reference frames.

The board is fifty-odd JPEGs at 1600px, plus four Tron frames from the vault at
up to 8 MB and 3500px. Fine one per screen; wrong for the two closing grids that
show all of them at once — over Tailscale the grid alone would be a minute of
waiting, and a question nobody waits for is a question nobody answers.

`sips` rather than Pillow. The task says standard library only, and `subprocess`
is standard library; Pillow would be a dependency that has to exist on whatever
machine this is next run on. `sips` ships with macOS, which is the only machine
this runs on.

Derived files are cached under `.thumbs/` and regenerated when the source is
newer, so recapturing a screen is enough — nothing has to be cleared.
"""

import subprocess
import threading
from pathlib import Path

import questions

CACHE = Path(__file__).resolve().parent / ".thumbs"

# 400px reads as a thumbnail on a phone at 3x and tiles the board to a screen on the
# Mac. 2400px is past what either display can resolve, so the frame screen is
# never the limiting factor on a judgement about density or grain.
SIZES = {"thumb": 400, "view": 2400}

_lock = threading.Lock()


def path(name: str, size: str) -> Path | None:
    """The derived file for one frame, making it if it is missing or stale.

    Returns None when the frame is not on the board, or when `sips` fails —
    the caller then serves the original rather than serving nothing. A slow
    screen is a worse outcome than a blank one only until the blank one is the
    question he was meant to answer.
    """
    if name not in questions.all_images() or size not in SIZES:
        return None
    src = questions.REFERENCES / name
    dst = CACHE / size / name
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    with _lock:  # sips on fifty files at once thrashes; one at a time is fast enough
        if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            return dst
        try:
            r = subprocess.run(
                ["sips", "-Z", str(SIZES[size]), str(src), "--out", str(dst)],
                capture_output=True,
                timeout=60,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
    return dst if r.returncode == 0 and dst.exists() else None


def prewarm() -> None:
    """Build every thumbnail in the background while the first frames are being answered.

    He reaches the grid after the last screen at the earliest. Fifty `sips`
    calls take about twenty seconds, so starting them at boot means the grid is
    warm long before it is asked for, without making the first screen wait.
    """
    def run() -> None:
        made = sum(1 for n in questions.all_images() if path(n, "thumb"))
        print(f"  thumbnails ready · {made}/{len(questions.all_images())}")

    threading.Thread(target=run, daemon=True).start()
