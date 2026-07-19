import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type EggOverlay =
  | { kind: "matrix-access" }
  | { kind: "rose-hearts" }
  | { kind: "ocean-fish" }
  | { kind: "ocean-swim" }
  | { kind: "generic-unlock" }
  | { kind: "void-null-pointer" }
  | { kind: "phosphor-boot" }
  | { kind: "arctic-frozen" }
  | { kind: "amber-static" }
  | { kind: "midnight-shooting-star" }
  | { kind: "money-coins" };

function getCurrentTheme(): string {
  return document.documentElement.getAttribute("data-theme") ?? "void";
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

// ── Konami sequence ────────────────────────────────────────────────────────────

const KONAMI: string[] = [
  "ArrowUp", "ArrowUp",
  "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight",
  "ArrowLeft", "ArrowRight",
  "b", "a",
];

// ── Matrix Access Granted overlay ─────────────────────────────────────────────

const TERMINAL_LINES = [
  "> INITIALIZING FINTRACK TERMINAL v4.2.0",
  "> CONNECTING TO MARKET DATA...",
  "> ALL SYSTEMS NOMINAL",
  "> WELCOME, OPERATOR",
];

function MatrixAccessOverlay({ onDone }: { onDone: () => void }) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [typedLines, setTypedLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      for (let i = 0; i < TERMINAL_LINES.length; i++) {
        if (cancelled) return;
        await new Promise<void>((res) => setTimeout(res, i === 0 ? 300 : 150));
        if (cancelled) return;
        setVisibleLines((prev) => [...prev, TERMINAL_LINES[i]]);
        const line = TERMINAL_LINES[i];
        for (let c = 1; c <= line.length; c++) {
          if (cancelled) return;
          await new Promise<void>((res) => setTimeout(res, 18));
          setTypedLines((prev) => {
            const next = [...prev];
            next[i] = line.slice(0, c);
            return next;
          });
        }
      }
    }

    run();
    const dismiss = setTimeout(() => { if (!cancelled) onDone(); }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(dismiss);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 3, 0, 0.95)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        cursor: "pointer",
      }}
      onClick={onDone}
    >
      <div
        style={{
          color: "#00FF41",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "0.2em",
          marginBottom: 32,
          textShadow: "0 0 20px #00FF41, 0 0 40px #00FF41",
          animation: "ft-matrix-flicker 0.1s infinite alternate",
        }}
      >
        SYSTEM ACCESS GRANTED
      </div>
      <div
        style={{
          background: "rgba(0, 20, 0, 0.8)",
          border: "1px solid #00FF41",
          padding: "20px 32px",
          minWidth: 400,
          boxShadow: "0 0 30px rgba(0, 255, 65, 0.2)",
        }}
      >
        {TERMINAL_LINES.map((line, i) => (
          <div
            key={line}
            style={{
              color: "#00CC33",
              fontSize: 13,
              lineHeight: 2,
              opacity: visibleLines.includes(line) ? 1 : 0,
              transition: "opacity 0.1s",
            }}
          >
            {typedLines[i] ?? ""}
            {visibleLines.includes(line) && typedLines[i]?.length !== line.length && (
              <span style={{ animation: "ft-cursor-blink 0.5s infinite" }}>█</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ color: "#005500", fontSize: 10, marginTop: 16, letterSpacing: "0.1em" }}>
        CLICK OR WAIT TO DISMISS
      </div>
      <style>{`
        @keyframes ft-matrix-flicker {
          from { opacity: 0.9; }
          to { opacity: 1; }
        }
        @keyframes ft-cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Rose hearts burst ──────────────────────────────────────────────────────────

interface HeartParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

function RoseHeartsOverlay({ onDone }: { onDone: () => void }) {
  const [hearts, setHearts] = useState<HeartParticle[]>([]);

  useEffect(() => {
    const initial: HeartParticle[] = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 8,
      vy: -(Math.random() * 6 + 2),
      size: 16 + Math.random() * 20,
      opacity: 1,
    }));
    setHearts(initial);
    const id = setTimeout(onDone, 3000);
    return () => clearTimeout(id);
  }, [onDone]);

  useEffect(() => {
    if (hearts.length === 0) return;
    let rafId: number;
    let ticks = 0;

    function animate() {
      ticks++;
      setHearts((prev) =>
        prev.map((h) => ({
          ...h,
          x: h.x + h.vx,
          y: h.y + h.vy,
          vy: h.vy + 0.15,
          opacity: Math.max(0, h.opacity - 0.008),
        }))
      );
      if (ticks < 180) rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [hearts.length]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
      {hearts.map((h) => (
        <div
          key={h.id}
          style={{
            position: "absolute",
            left: h.x,
            top: h.y,
            fontSize: h.size,
            opacity: h.opacity,
            color: "#FF2D78",
            transform: "translate(-50%, -50%)",
            textShadow: "0 0 10px rgba(255,45,120,0.5)",
            userSelect: "none",
          }}
        >
          🌸
        </div>
      ))}
    </div>
  );
}

// ── Ocean fish message ─────────────────────────────────────────────────────────

function OceanFishOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(0, 20, 40, 0.9)",
          border: "1px solid rgba(0, 212, 255, 0.5)",
          borderRadius: 12,
          padding: "20px 32px",
          fontFamily: "monospace",
          fontSize: 18,
          color: "#00D4FF",
          textShadow: "0 0 10px rgba(0,212,255,0.7)",
          boxShadow: "0 0 30px rgba(0,212,255,0.2)",
          animation: "ft-bubble-pop 0.3s ease-out",
        }}
      >
        🐠 You found the fish!
      </div>
      <style>{`
        @keyframes ft-bubble-pop {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Ocean fish swimming across screen ─────────────────────────────────────────

function OceanFishSwimOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          fontSize: 40,
          animation: "ft-fish-swim 3s linear forwards",
          userSelect: "none",
        }}
      >
        🐡
      </div>
      <style>{`
        @keyframes ft-fish-swim {
          from { left: -60px; }
          to { left: calc(100vw + 60px); }
        }
      `}</style>
    </div>
  );
}

// ── Generic unlock popup ───────────────────────────────────────────────────────

function GenericUnlockOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 40,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "var(--ft-raised, #111)",
        border: "1px solid var(--ft-accent, #F4A21E)",
        padding: "10px 20px",
        fontFamily: "monospace",
        fontSize: 11,
        color: "var(--ft-accent, #F4A21E)",
        letterSpacing: "0.1em",
        pointerEvents: "none",
        boxShadow: "0 0 20px rgba(244,162,30,0.3)",
        animation: "ft-generic-pop 0.2s ease-out",
      }}
    >
      // NUMERIS BUILD 2026.07 // EASTER EGG UNLOCKED
      <style>{`
        @keyframes ft-generic-pop {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Void — NULL POINTER EXCEPTION glitch ──────────────────────────────────────

function VoidNullPointerOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1500);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        animation: "ft-glitch-flash 1.5s ease-out forwards",
      }}
    >
      {/* Red flash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(200, 0, 0, 0.18)",
          animation: "ft-glitch-bg 1.5s ease-out forwards",
        }}
      />
      <div
        style={{
          position: "relative",
          fontFamily: "monospace",
          fontSize: 13,
          color: "#FF4444",
          textShadow: "0 0 12px rgba(255,0,0,0.8)",
          letterSpacing: "0.05em",
          lineHeight: 1.8,
          padding: "20px 28px",
          border: "1px solid rgba(255,68,68,0.6)",
          background: "rgba(10,0,0,0.9)",
          animation: "ft-glitch-text 1.5s ease-out forwards",
          maxWidth: 480,
          textAlign: "left",
        }}
      >
        <div style={{ color: "#FF2222", fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
          FATAL: NULL POINTER EXCEPTION
        </div>
        <div>at Numeris.ui.getValue (core.ts:0x00000000)</div>
        <div>at render.loop (engine.ts:0xDEADBEEF)</div>
        <div>at scheduler.tick (runtime.ts:0xCAFEBABE)</div>
        <div style={{ marginTop: 8, color: "rgba(255,100,100,0.7)", fontSize: 11 }}>
          segment fault · errno: 0 · signal: SIGSEGV
        </div>
      </div>
    </div>
  );
}

// ── Phosphor — terminal boot sequence ─────────────────────────────────────────

const BOOT_LINES = [
  "BIOS v2.0.6 — Numeris Systems Inc.",
  "CPU: FinanceCore™ @ 4.20 GHz  [OK]",
  "RAM: 64MB — 65536K OK",
  "Scanning market data feeds...",
  "Loading NUMERIS.SYS.......",
  "Initializing display adapter [OK]",
  "Mounting /dev/portfolio    [OK]",
  "",
  "NUMERIS OS v2.0 LOADED",
];

function PhosphorBootOverlay({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      for (let i = 0; i < BOOT_LINES.length; i++) {
        if (cancelled) return;
        await new Promise<void>((res) => setTimeout(res, i === 0 ? 100 : 250));
        if (cancelled) return;
        setLines((prev) => [...prev, BOOT_LINES[i]]);
      }
    }

    run();
    const dismiss = setTimeout(() => { if (!cancelled) onDone(); }, 3200);

    return () => {
      cancelled = true;
      clearTimeout(dismiss);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2, 8, 2, 0.97)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "40px 48px",
        fontFamily: "monospace",
        cursor: "pointer",
      }}
      onClick={onDone}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            color: i === BOOT_LINES.length - 1 ? "#7FFF00" : "#39FF14",
            fontSize: i === BOOT_LINES.length - 1 ? 18 : 13,
            fontWeight: i === BOOT_LINES.length - 1 ? 700 : 400,
            lineHeight: 1.9,
            letterSpacing: i === BOOT_LINES.length - 1 ? "0.15em" : "0.04em",
            textShadow:
              i === BOOT_LINES.length - 1
                ? "0 0 16px #7FFF00, 0 0 32px #7FFF00"
                : "0 0 4px rgba(57,255,20,0.4)",
            opacity: line === "" ? 0 : 1,
          }}
        >
          {line || " "}
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 32,
          color: "#1E8C0A",
          fontSize: 10,
          letterSpacing: "0.08em",
        }}
      >
        CLICK OR WAIT TO DISMISS
      </div>
    </div>
  );
}

// ── Arctic — FROZEN text effect ────────────────────────────────────────────────

function ArcticFrozenOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2000);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <>
      {/* Frost shimmer overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(180,220,255,0.12) 0%, rgba(100,180,255,0.05) 50%, transparent 80%)",
          animation: "ft-frost-shimmer 2s ease-out forwards",
        }}
      />
      {/* FROZEN badge */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          fontFamily: "monospace",
          fontSize: 42,
          fontWeight: 900,
          color: "#B4DCFF",
          letterSpacing: "0.35em",
          textShadow:
            "0 0 20px rgba(180,220,255,0.9), 0 0 40px rgba(100,180,255,0.5), 0 2px 0 rgba(255,255,255,0.3)",
          animation: "ft-frost-text 2s ease-out forwards",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        FROZEN
      </div>
      <style>{`
        @keyframes ft-frost-text {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(1.3); filter: blur(8px); }
          25%  { opacity: 1; transform: translate(-50%, -50%) scale(1);   filter: blur(0); }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes ft-frost-shimmer {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ── Amber — TV static + PLEASE STAND BY ───────────────────────────────────────

function AmberStaticOverlay({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let ticks = 0;
    const MAX_TICKS = 30; // ~0.5s of static then fade to stand-by

    function drawNoise() {
      if (!ctx || !canvas) return;
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 180;
        // Amber tint
        data[i]     = v * 1.1;   // R
        data[i + 1] = v * 0.75;  // G
        data[i + 2] = 0;         // B
        data[i + 3] = ticks < MAX_TICKS ? 120 : Math.max(0, 120 - (ticks - MAX_TICKS) * 6);
      }
      ctx.putImageData(imageData, 0, 0);
      ticks++;
      if (ticks < MAX_TICKS + 20) {
        rafId = requestAnimationFrame(drawNoise);
      }
    }

    rafId = requestAnimationFrame(drawNoise);
    const dismiss = setTimeout(onDone, 2400);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(dismiss);
    };
  }, [onDone]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      {/* PLEASE STAND BY text */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: "monospace",
          fontSize: 28,
          fontWeight: 700,
          color: "#FFB000",
          letterSpacing: "0.3em",
          textShadow: "0 0 20px rgba(255,176,0,0.9), 0 0 40px rgba(255,144,0,0.5)",
          animation: "ft-standby-fade 2.4s ease-out forwards",
          userSelect: "none",
          textAlign: "center",
        }}
      >
        PLEASE STAND BY
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            marginTop: 8,
            color: "rgba(255,176,0,0.6)",
          }}
        >
          NORMAL SERVICE WILL RESUME SHORTLY
        </div>
      </div>
      <style>{`
        @keyframes ft-standby-fade {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Midnight — shooting star ───────────────────────────────────────────────────

function MidnightShootingStarOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", overflow: "hidden" }}
    >
      {/* Star head */}
      <div
        style={{
          position: "absolute",
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 0 8px 3px rgba(255,255,255,0.8), 0 0 20px 6px rgba(77,159,255,0.5)",
          animation: "ft-shooting-star 2.4s cubic-bezier(0.2,0,0.8,1) forwards",
        }}
      />
      {/* Tail */}
      <div
        style={{
          position: "absolute",
          width: 120,
          height: 2,
          background:
            "linear-gradient(to left, rgba(255,255,255,0.7), rgba(77,159,255,0.4), transparent)",
          transformOrigin: "right center",
          transform: "rotate(35deg)",
          animation: "ft-shooting-tail 2.4s cubic-bezier(0.2,0,0.8,1) forwards",
        }}
      />
      <style>{`
        @keyframes ft-shooting-star {
          0%   { top: -10px; left: -10px; opacity: 0; }
          8%   { opacity: 1; }
          100% { top: calc(100vh + 10px); left: calc(100vw + 10px); opacity: 0; }
        }
        @keyframes ft-shooting-tail {
          0%   { top: -8px; left: -110px; opacity: 0; }
          8%   { opacity: 1; }
          100% { top: calc(100vh + 8px); left: calc(100vw - 110px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Any theme — coin rain ──────────────────────────────────────────────────────

interface CoinParticle {
  id: number;
  x: number;
  startDelay: number;
  duration: number;
  size: number;
  symbol: string;
}

const COIN_SYMBOLS = ["£", "£", "£", "$", "€", "£", "¥", "£"];

function MoneyCoinsOverlay({ onDone }: { onDone: () => void }) {
  const coins: CoinParticle[] = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: 5 + (i / 19) * 90,
    startDelay: Math.random() * 1.5,
    duration: 1.5 + Math.random() * 1.2,
    size: 14 + Math.floor(Math.random() * 12),
    symbol: COIN_SYMBOLS[Math.floor(Math.random() * COIN_SYMBOLS.length)],
  }));

  useEffect(() => {
    const id = setTimeout(onDone, 3200);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none", overflow: "hidden" }}
    >
      {coins.map((coin) => (
        <div
          key={coin.id}
          style={{
            position: "absolute",
            bottom: "-40px",
            left: `${coin.x}%`,
            fontSize: coin.size,
            color: "var(--ft-accent, #F4A21E)",
            textShadow: "0 0 8px rgba(244,162,30,0.6)",
            fontFamily: "monospace",
            fontWeight: 700,
            animation: `ft-coin-rise ${coin.duration}s ${coin.startDelay}s ease-out forwards`,
            userSelect: "none",
          }}
        >
          {coin.symbol}
        </div>
      ))}
      <style>{`
        @keyframes ft-coin-rise {
          0%   { transform: translateY(0) scale(0.6) rotate(-15deg); opacity: 0; }
          15%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(-110vh) scale(1) rotate(20deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEasterEggs(): {
  overlay: EggOverlay | null;
  clearOverlay: () => void;
  logoRef: React.RefObject<HTMLDivElement | null>;
} {
  const [overlay, setOverlay] = useState<EggOverlay | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);

  const konamiProgress = useRef(0);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard sequence state for "RUN" and "MONEY" triggers
  const typedBuffer = useRef<string>("");

  const clearOverlay = useCallback(() => setOverlay(null), []);

  // ── Global keydown: Konami, RUN, MONEY ────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const theme = getCurrentTheme();
      const key = e.key;

      // Konami code
      if (key === KONAMI[konamiProgress.current]) {
        konamiProgress.current++;
        if (konamiProgress.current === KONAMI.length) {
          konamiProgress.current = 0;
          // Midnight gets its own Konami effect
          if (theme === "midnight") {
            setOverlay({ kind: "midnight-shooting-star" });
          } else if (theme === "matrix") {
            setOverlay({ kind: "matrix-access" });
          } else if (theme === "rose") {
            setOverlay({ kind: "rose-hearts" });
          } else if (theme === "ocean") {
            setOverlay({ kind: "ocean-fish" });
          } else {
            setOverlay({ kind: "generic-unlock" });
          }
        }
      } else if (!KONAMI.slice(0, konamiProgress.current + 1).includes(key)) {
        konamiProgress.current = 0;
      }

      // Double-Escape while on matrix theme → access granted
      if (key === "Escape" && theme === "matrix" && !isEditableTarget(e.target)) {
        setOverlay({ kind: "matrix-access" });
      }

      // Keyboard word sequences — skip if typing in an input
      if (isEditableTarget(e.target)) return;
      if (key.length !== 1) return;

      typedBuffer.current = (typedBuffer.current + key.toUpperCase()).slice(-5);

      // Phosphor: type "RUN"
      if (theme === "phosphor" && typedBuffer.current.endsWith("RUN")) {
        typedBuffer.current = "";
        setOverlay({ kind: "phosphor-boot" });
      }

      // Any theme: type "MONEY"
      if (typedBuffer.current === "MONEY") {
        typedBuffer.current = "";
        setOverlay({ kind: "money-coins" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Void: Alt+click on numbers in the UI ──────────────────────────────────
  useEffect(() => {
    function onAltClick(e: MouseEvent) {
      if (!e.altKey) return;
      const theme = getCurrentTheme();
      if (theme !== "void") return;

      const el = e.target as HTMLElement | null;
      if (!el) return;

      // Check if the clicked element or its text content looks numeric
      const text = el.textContent?.trim() ?? "";
      if (/^[-+]?[\d,.$%£€]+/.test(text)) {
        setOverlay({ kind: "void-null-pointer" });
      }
    }

    window.addEventListener("click", onAltClick);
    return () => window.removeEventListener("click", onAltClick);
  }, []);

  // ── Logo click counter ────────────────────────────────────────────────────
  useEffect(() => {
    const logoEl = logoRef.current;
    if (!logoEl) return;

    function onLogoClick() {
      const theme = getCurrentTheme();
      logoClickCount.current++;

      if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
      logoClickTimer.current = setTimeout(() => {
        logoClickCount.current = 0;
      }, 1200);

      // Matrix: double-click
      if (theme === "matrix" && logoClickCount.current >= 2) {
        logoClickCount.current = 0;
        if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
        setOverlay({ kind: "matrix-access" });
      }
      // Rose: triple-click → hearts
      if (theme === "rose" && logoClickCount.current >= 3) {
        logoClickCount.current = 0;
        if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
        setOverlay({ kind: "rose-hearts" });
      }
      // Arctic: triple-click → frozen
      if (theme === "arctic" && logoClickCount.current >= 3) {
        logoClickCount.current = 0;
        if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
        setOverlay({ kind: "arctic-frozen" });
      }
      // Ocean: 5 clicks
      if (theme === "ocean" && logoClickCount.current >= 5) {
        logoClickCount.current = 0;
        if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
        setOverlay({ kind: "ocean-swim" });
      }
    }

    logoEl.addEventListener("click", onLogoClick);
    return () => {
      logoEl.removeEventListener("click", onLogoClick);
      if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    };
  }, []);

  // ── Amber: long press logo (>800ms) ──────────────────────────────────────
  useEffect(() => {
    const logoEl = logoRef.current;
    if (!logoEl) return;

    function onLogoMouseDown() {
      const theme = getCurrentTheme();
      if (theme !== "amber") return;
      logoPressTimer.current = setTimeout(() => {
        setOverlay({ kind: "amber-static" });
      }, 800);
    }

    function cancelLongPress() {
      if (logoPressTimer.current) {
        clearTimeout(logoPressTimer.current);
        logoPressTimer.current = null;
      }
    }

    logoEl.addEventListener("mousedown", onLogoMouseDown);
    logoEl.addEventListener("mouseup", cancelLongPress);
    logoEl.addEventListener("mouseleave", cancelLongPress);
    logoEl.addEventListener("touchstart", onLogoMouseDown);
    logoEl.addEventListener("touchend", cancelLongPress);

    return () => {
      logoEl.removeEventListener("mousedown", onLogoMouseDown);
      logoEl.removeEventListener("mouseup", cancelLongPress);
      logoEl.removeEventListener("mouseleave", cancelLongPress);
      logoEl.removeEventListener("touchstart", onLogoMouseDown);
      logoEl.removeEventListener("touchend", cancelLongPress);
      if (logoPressTimer.current) clearTimeout(logoPressTimer.current);
    };
  }, []);

  return { overlay, clearOverlay, logoRef };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

interface EasterEggRendererProps {
  overlay: EggOverlay | null;
  clearOverlay: () => void;
}

export function EasterEggRenderer({ overlay, clearOverlay }: EasterEggRendererProps) {
  if (!overlay) return null;

  if (overlay.kind === "matrix-access")         return <MatrixAccessOverlay onDone={clearOverlay} />;
  if (overlay.kind === "rose-hearts")           return <RoseHeartsOverlay onDone={clearOverlay} />;
  if (overlay.kind === "ocean-fish")            return <OceanFishOverlay onDone={clearOverlay} />;
  if (overlay.kind === "ocean-swim")            return <OceanFishSwimOverlay onDone={clearOverlay} />;
  if (overlay.kind === "generic-unlock")        return <GenericUnlockOverlay onDone={clearOverlay} />;
  if (overlay.kind === "void-null-pointer")     return <VoidNullPointerOverlay onDone={clearOverlay} />;
  if (overlay.kind === "phosphor-boot")         return <PhosphorBootOverlay onDone={clearOverlay} />;
  if (overlay.kind === "arctic-frozen")         return <ArcticFrozenOverlay onDone={clearOverlay} />;
  if (overlay.kind === "amber-static")          return <AmberStaticOverlay onDone={clearOverlay} />;
  if (overlay.kind === "midnight-shooting-star") return <MidnightShootingStarOverlay onDone={clearOverlay} />;
  if (overlay.kind === "money-coins")           return <MoneyCoinsOverlay onDone={clearOverlay} />;

  return null;
}
