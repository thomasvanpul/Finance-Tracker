#!/usr/bin/env python3
"""The Numeris reference picker: one screen per page, tapped rather than typed.

Adapted from `~/dev/atrium-design/tools/picker`, which is where the shape was
proved: Thomas rated forty frames and answered taste questions in minutes, and
every answer landed in the vault as he tapped. Same constraint here. Every
answer is appended to `Efforts/Numeris-Taste.md` the moment it is given, so a
run abandoned at screen nine has left nine answers behind.

Two listeners rather than one on 0.0.0.0: the loopback for the Mac, and the
Tailscale address by name for the phone, and nothing else. Binding every
interface would put the board on whatever Wi-Fi the laptop next joins.

    python3 tools/picker/serve.py
"""

import http.server
import json
import re
import socket
import subprocess
import threading
from datetime import datetime
from pathlib import Path

import questions
import thumbs

HERE = Path(__file__).resolve().parent
ANSWERS = questions.VAULT / "Efforts" / "Numeris-Taste.md"

PORT = 8741          # first choice; `pick_port` walks up from here if it is taken
PORT_TRIES = 10
LOOPBACK = "127.0.0.1"
PORT_FILE = HERE / ".port"   # the port actually taken, for whoever opens the browser

# Appended to every answer line and hidden by Obsidian's renderer, so the file
# reads as prose to Thomas and parses as a record to `/api/answers`.
_MARK = re.compile(r"→ \*\*(.*?)\*\* <!-- id:(\S+) -->")

HEADER = """---
type: effort
status: active
updated: {today}
tags: [numeris, finance-tracker, design, thomas-answers, taste]
protection: append
---

# Numeris taste: Thomas's verdicts on the reference board

Written by `tools/picker` in `~/Developer/Finance-Tracker`, one line at a time,
as he taps. Append-only: nothing here is ever rewritten, so a half-finished run
still counts, and a changed mind writes a second line (the newest wins).

The board is `design/reference-board/` in that repo: the images, `board.json`
with one line on why each screen is there, and `README.md`. The picker asks
love / like / neutral / wrong for Numeris on each screen, two closing picks, then
five questions about money: dense or calm, numbers or shapes, how net worth
should feel, phone as glance or work, colour.

Why this exists: on 19 Sep Thomas rejected all five rendered directions (A, B,
C, D1, D2) as "vibe coded finance appy". No new direction is drawn until the
answers below are in. Companion to [[Thomas-Answers-Frames]] (the Atrium run,
same scale) and [[Style-AI-Slop-Tells]]. Feeds [[Numeris-Roadmap]].

## Answers

"""


def tailscale_ip() -> str | None:
    for cli in ("/Applications/Tailscale.app/Contents/MacOS/Tailscale", "tailscale"):
        try:
            out = subprocess.run(
                [cli, "ip", "-4"], capture_output=True, text=True, timeout=5
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        ip = out.stdout.strip().splitlines()
        if out.returncode == 0 and ip:
            return ip[0].strip()
    return None


def ensure_answers_file() -> None:
    if ANSWERS.exists():
        return
    ANSWERS.parent.mkdir(parents=True, exist_ok=True)
    ANSWERS.write_text(HEADER.format(today=datetime.now().strftime("%Y-%m-%d")))


def answered() -> dict[str, str]:
    """Answer key to answer, newest winning, so a run resumes showing what was picked."""
    if not ANSWERS.exists():
        return {}
    out: dict[str, str] = {}
    for line in ANSWERS.read_text().splitlines():
        if m := _MARK.search(line):
            out[m.group(2)] = m.group(1)
    return out


def append(key: str, subject: str, question: str, answer: str) -> None:
    """One line, written and flushed before the request returns."""
    ensure_answers_file()
    stamp = datetime.now().strftime("%H:%M")
    q = re.sub(r"\s+", " ", question).strip()
    a = re.sub(r"\s+", " ", answer).strip()
    line = f"- `{stamp}` · **{subject}** · {q} → **{a}** <!-- id:{key} -->\n"
    with ANSWERS.open("a", encoding="utf-8") as fh:
        fh.write(line)
        fh.flush()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter than the default one-line-per-asset
        if "api/answer" in (args[0] if args else ""):
            print(f"  {self.address_string()} {args[0]}")

    def _send(self, body: bytes, ctype: str, code: int = 200) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code: int = 200) -> None:
        self._send(json.dumps(obj).encode(), "application/json", code)

    def _file(self, path: Path, ctype: str) -> None:
        try:
            self._send(path.read_bytes(), ctype)
        except OSError:
            self._json({"error": f"missing: {path.name}"}, 404)

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            return self._file(HERE / "index.html", "text/html; charset=utf-8")
        if path == "/picker.css":
            return self._file(HERE / "picker.css", "text/css; charset=utf-8")
        if path == "/picker.js":
            return self._file(HERE / "picker.js", "text/javascript; charset=utf-8")
        if path == "/tokens.css":
            return self._file(HERE / "tokens.css", "text/css; charset=utf-8")
        if path == "/api/questions":
            return self._json(questions.payload())
        if path == "/api/answers":
            return self._json({"answered": answered()})
        if path.startswith("/frames/"):
            size, _, name = path[len("/frames/"):].partition("/")
            # Whitelisted against the board rather than sanitised: a claim about
            # which files exist, which is the thing actually being protected.
            if name not in questions.all_images():
                return self._json({"error": "not on the board"}, 404)
            if size == "original":
                return self._file(questions.REFERENCES / name, "image/jpeg")
            derived = thumbs.path(name, size) or questions.REFERENCES / name
            return self._file(derived, "image/jpeg")
        self._json({"error": "no such path"}, 404)

    def do_POST(self) -> None:
        if self.path != "/api/answer":
            return self._json({"error": "no such path"}, 404)
        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
            key, subject = body["key"], body["subject"]
            question, answer = body["question"], body["answer"]
        except (ValueError, KeyError) as exc:
            return self._json({"error": f"bad answer: {exc}"}, 400)
        if not str(answer).strip():
            return self._json({"error": "empty answer not written"}, 400)
        append(key, subject, question, answer)
        print(f"  written · {key} → {answer[:60]}")
        self._json({"ok": True, "key": key, "count": len(answered())})


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def serve_on(host: str, port: int) -> Server | None:
    try:
        return Server((host, port), Handler)
    except OSError as exc:
        print(f"  cannot bind {host}:{port} — {exc}")
        return None


def free(port: int, hosts: list[str]) -> bool:
    """True when every host can be bound at this port AND nothing answers on it.

    A bind that succeeds is not evidence the port is usable: a wildcard IPv6
    listener answers IPv4 too while the specific binds all succeed. The probe
    settles it.
    """
    socks = []
    try:
        for h in hosts:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind((h, port))
            socks.append(sock)
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.settimeout(0.3)
        shadowed = probe.connect_ex((LOOPBACK, port)) == 0
        probe.close()
        return not shadowed
    except OSError:
        return False
    finally:
        for sock in socks:
            sock.close()


def pick_port(hosts: list[str]) -> int | None:
    for port in range(PORT, PORT + PORT_TRIES):
        if free(port, hosts):
            return port
    return None


def main() -> int:
    frames = questions.frames()
    if not frames:
        print(f"no images in {questions.BOARD}; run the capture script first.")
        return 1
    ensure_answers_file()
    done = answered()

    print(f"numeris-picker · {len(frames)} screens · {len(questions.TASTE)} taste questions")
    print(f"  answers → {ANSWERS}")
    print(f"  {len(done)} already answered" if done else "  nothing answered yet")

    thumbs.prewarm()
    ts = tailscale_ip()
    hosts = [LOOPBACK] + ([ts] if ts and ts != LOOPBACK else [])
    port = pick_port(hosts)
    if port is None:
        print(f"\nports {PORT}-{PORT + PORT_TRIES - 1} are taken or shadowed; nothing started.")
        return 1
    if port != PORT:
        print(f"  {PORT} was taken — using {port}")

    servers = [s for s in (serve_on(h, port) for h in hosts) if s]
    if not servers:
        print("nothing is listening; nothing started.")
        return 1

    PORT_FILE.write_text(str(port))
    print(f"\n  Mac    http://{LOOPBACK}:{port}/")
    if len(servers) > 1:
        print(f"  Phone  http://{ts}:{port}/   (Tailscale, {socket.gethostname()})")
    else:
        print("  Phone  unavailable — Tailscale reported no address")
    print("\n  ctrl-C to stop. Every tap is written before the next screen.\n")

    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        print(f"\nstopped · {len(answered())} answers in {ANSWERS.name}")
    finally:
        PORT_FILE.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
