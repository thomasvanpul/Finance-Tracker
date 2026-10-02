// Tester report: a bug or an idea, with the screen it is about, into the
// testers' group chat.
//
// The group chat is the one channel (Thomas, 27 Sep). So the report does not
// go to a server: it goes through the phone's own share sheet, where the
// tester picks the group, and the screenshot and the text arrive in the chat
// together. Where the browser cannot share a file (most desktop browsers),
// the text is copied, the image is saved, and the group link is opened.
//
// The screenshot is taken BEFORE the sheet opens, so it shows the screen the
// tester was looking at. Figures are masked by default because the image
// lands in a chat with other testers; the tester can unmask it when the bug
// is about a number.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { domToBlob } from "modern-screenshot";
import { MobileSheet } from "@/components/mobile-sheet";
import { BUILD_COMMIT } from "@/build-info";
import { buildReportText, reportFileName, type ReportKind } from "@/lib/tester-report";

const MASK_CLASS = "ft-report-mask";
const GROUP_URL: string | undefined = import.meta.env.VITE_TESTER_GROUP_URL || undefined;

interface Shots {
  masked: Blob | null;
  clear: Blob | null;
}

interface TesterReportApi {
  begin: () => Promise<void>;
}

const TesterReportContext = createContext<TesterReportApi | null>(null);

export function useTesterReport(): TesterReportApi | null {
  return useContext(TesterReportContext);
}

async function captureViewport(masked: boolean): Promise<Blob | null> {
  const root = document.documentElement;
  if (masked) root.classList.add(MASK_CLASS);
  try {
    return await domToBlob(document.body, {
      width: window.innerWidth,
      height: window.innerHeight,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      type: "image/png",
    });
  } catch (err) {
    console.error("[tester-report] screenshot failed", err);
    return null;
  } finally {
    if (masked) root.classList.remove(MASK_CLASS);
  }
}

function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TesterReportProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [shots, setShots] = useState<Shots>({ masked: null, clear: null });
  const [route, setRoute] = useState("/");
  const busy = useRef(false);

  const begin = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const masked = await captureViewport(true);
      const clear = await captureViewport(false);
      setShots({ masked, clear });
      setRoute(location);
      setOpen(true);
    } finally {
      busy.current = false;
    }
  }, [location]);

  const api = useMemo(() => ({ begin }), [begin]);

  return (
    <TesterReportContext.Provider value={api}>
      {children}
      {open && <ReportSheet shots={shots} route={route} onClose={() => setOpen(false)} />}
    </TesterReportContext.Provider>
  );
}

const label: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

function Segment({ value, onChange }: { value: ReportKind; onChange: (k: ReportKind) => void }) {
  const kinds: ReportKind[] = ["bug", "idea"];
  return (
    <div role="radiogroup" aria-label="Kind" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--ft-border)", position: "relative" }}>
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, bottom: 0, width: "50%",
          background: "var(--ft-accent-tint)", borderRight: "1px solid var(--ft-accent-edge)", borderLeft: "1px solid var(--ft-accent-edge)",
          transform: value === "bug" ? "translateX(0)" : "translateX(100%)",
          transition: "transform var(--ft-motion-base) var(--ft-ease)",
        }}
      />
      {kinds.map(k => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          style={{ ...label, position: "relative", minHeight: 44, background: "none", border: "none", cursor: "pointer", color: value === k ? "var(--ft-text)" : "var(--ft-muted)", transition: "color var(--ft-motion-base) var(--ft-ease)" }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function ReportSheet({ shots, route, onClose }: { shots: Shots; route: string; onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind>("bug");
  const [note, setNote] = useState("");
  const [showFigures, setShowFigures] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const shot = showFigures ? shots.clear : shots.masked;
  const preview = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const send = async () => {
    const at = new Date();
    const text = buildReportText({
      kind,
      note,
      route,
      commit: BUILD_COMMIT,
      at,
      device: {
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        installed: isInstalled(),
      },
    });
    const files = shot ? [new File([shot], reportFileName({ kind, at }), { type: "image/png" })] : [];
    const payload: ShareData = files.length ? { files, text } : { text };

    if (navigator.canShare?.(payload)) {
      try {
        await navigator.share(payload);
        onClose();
      } catch (err) {
        // AbortError is the tester closing the share sheet; keep the draft.
        if ((err as Error).name !== "AbortError") setStatus("Could not open the share sheet");
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setStatus("Could not copy the text");
      return;
    }
    if (files.length) saveBlob(files[0], files[0].name);
    if (GROUP_URL) window.open(GROUP_URL, "_blank", "noopener");
    setStatus(files.length ? "Text copied, image saved. Paste both into the group." : "Text copied. Paste it into the group.");
  };

  return (
    <MobileSheet
      open
      onOpenChange={o => { if (!o) onClose(); }}
      title="Report to the testers group"
      footer={
        <button
          type="button"
          onClick={send}
          disabled={note.trim().length === 0}
          className="ft-report-send"
          style={{ ...label, width: "100%", minHeight: 48, border: "1px solid var(--ft-accent-edge)", background: "var(--ft-accent-tint)", color: "var(--ft-text)", cursor: "pointer", opacity: note.trim().length === 0 ? 0.45 : 1, transition: "opacity var(--ft-motion-base) var(--ft-ease), transform 120ms var(--ft-ease)" }}
        >
          Send to group
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Segment value={kind} onChange={setKind} />
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={kind === "bug" ? "What went wrong" : "What would make it better"}
          rows={3}
          autoFocus
          style={{ width: "100%", resize: "vertical", padding: 10, fontFamily: "var(--font-sans)", fontSize: 15, color: "var(--ft-text)", background: "var(--ft-base)", border: "1px solid var(--ft-border)", outline: "none" }}
        />
        {preview && (
          <button
            type="button"
            onClick={() => setShowFigures(s => !s)}
            aria-pressed={showFigures}
            style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "center", padding: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <img src={preview} alt="The screen this report is about" style={{ width: 72, border: "1px solid var(--ft-border)", display: "block" }} />
            <span style={{ ...label, color: "var(--ft-muted)" }}>{showFigures ? "Figures shown" : "Figures hidden"}</span>
          </button>
        )}
        {status && <span role="status" style={{ ...label, color: "var(--ft-muted)" }}>{status}</span>}
      </div>
    </MobileSheet>
  );
}

// Long-press on an element (the phone tab bar) begins a report. The element
// gets a line that fills while held, so the hold reads as charging something
// rather than a stuck tap; a completed hold swallows the click that follows.
const HOLD_MS = 650;

export function useReportHold() {
  const report = useTesterReport();
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  const handlers = useMemo(() => ({
    onPointerDown: () => {
      if (!report) return;
      fired.current = false;
      setHolding(true);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        setHolding(false);
        void report.begin();
      }, HOLD_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (report) e.preventDefault(); },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; }
    },
  }), [report, cancel]);

  return { handlers, holding, holdMs: HOLD_MS };
}

// Desktop header entry. Same family as SIGN OUT beside it; the label turns
// to a moving bar while the screen is captured, so the pause before the
// sheet opens reads as work rather than a missed click.
export function ReportButton() {
  const report = useTesterReport();
  const [capturing, setCapturing] = useState(false);
  if (!report) return null;
  const onClick = async () => {
    setCapturing(true);
    try { await report.begin(); } finally { setCapturing(false); }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={capturing}
      title="Report a bug or an idea about this screen"
      className="ft-report-button"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--ft-raised)",
        border: "1px solid var(--ft-border)",
        color: "var(--ft-muted)",
        cursor: capturing ? "progress" : "pointer",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 4,
        marginRight: 8,
        transition: "color 0.1s, border-color 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; e.currentTarget.style.borderColor = "var(--ft-accent-edge)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-muted)"; e.currentTarget.style.borderColor = "var(--ft-border)"; }}
    >
      REPORT
      {capturing && <span aria-hidden className="ft-report-button-bar" />}
    </button>
  );
}
