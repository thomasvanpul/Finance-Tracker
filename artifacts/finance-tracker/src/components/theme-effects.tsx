import { useEffect, useRef, useState } from "react";
import { MatrixRain } from "@/components/matrix-rain";

type ActiveTheme = string;

function getCurrentTheme(): ActiveTheme {
  return document.documentElement.getAttribute("data-theme") ?? "void";
}

// ── Void — drifting star particles ────────────────────────────────────────────

interface StarConfig {
  top: string;
  left: string;
  size: number;
  duration: string;
  delay: string;
  opacity: number;
}

const STAR_CONFIGS: StarConfig[] = [
  { top: "3%",  left: "7%",  size: 1, duration: "28s", delay: "0s",    opacity: 0.07 },
  { top: "8%",  left: "23%", size: 2, duration: "35s", delay: "4s",    opacity: 0.10 },
  { top: "12%", left: "41%", size: 1, duration: "22s", delay: "8s",    opacity: 0.06 },
  { top: "6%",  left: "58%", size: 2, duration: "40s", delay: "2s",    opacity: 0.09 },
  { top: "2%",  left: "72%", size: 1, duration: "32s", delay: "11s",   opacity: 0.05 },
  { top: "15%", left: "88%", size: 2, duration: "26s", delay: "6s",    opacity: 0.08 },
  { top: "20%", left: "14%", size: 1, duration: "38s", delay: "14s",   opacity: 0.07 },
  { top: "25%", left: "30%", size: 2, duration: "24s", delay: "1s",    opacity: 0.12 },
  { top: "18%", left: "50%", size: 1, duration: "31s", delay: "9s",    opacity: 0.06 },
  { top: "30%", left: "65%", size: 1, duration: "36s", delay: "5s",    opacity: 0.08 },
  { top: "35%", left: "80%", size: 2, duration: "20s", delay: "13s",   opacity: 0.10 },
  { top: "40%", left: "5%",  size: 1, duration: "29s", delay: "7s",    opacity: 0.06 },
  { top: "45%", left: "20%", size: 2, duration: "33s", delay: "3s",    opacity: 0.09 },
  { top: "38%", left: "37%", size: 1, duration: "25s", delay: "16s",   opacity: 0.07 },
  { top: "50%", left: "54%", size: 1, duration: "39s", delay: "10s",   opacity: 0.05 },
  { top: "55%", left: "70%", size: 2, duration: "27s", delay: "0.5s",  opacity: 0.11 },
  { top: "60%", left: "87%", size: 1, duration: "34s", delay: "12s",   opacity: 0.06 },
  { top: "65%", left: "10%", size: 2, duration: "21s", delay: "17s",   opacity: 0.08 },
  { top: "58%", left: "26%", size: 1, duration: "37s", delay: "6.5s",  opacity: 0.07 },
  { top: "70%", left: "44%", size: 1, duration: "23s", delay: "2.5s",  opacity: 0.09 },
  { top: "75%", left: "60%", size: 2, duration: "30s", delay: "8.5s",  opacity: 0.10 },
  { top: "80%", left: "75%", size: 1, duration: "36s", delay: "4.5s",  opacity: 0.06 },
  { top: "85%", left: "92%", size: 2, duration: "26s", delay: "15s",   opacity: 0.08 },
  { top: "88%", left: "15%", size: 1, duration: "40s", delay: "1.5s",  opacity: 0.07 },
  { top: "92%", left: "32%", size: 1, duration: "28s", delay: "11.5s", opacity: 0.05 },
  { top: "95%", left: "50%", size: 2, duration: "33s", delay: "7.5s",  opacity: 0.09 },
  { top: "90%", left: "68%", size: 1, duration: "24s", delay: "3.5s",  opacity: 0.07 },
  { top: "97%", left: "83%", size: 2, duration: "38s", delay: "9.5s",  opacity: 0.10 },
  { top: "10%", left: "95%", size: 1, duration: "22s", delay: "18s",   opacity: 0.06 },
  { top: "22%", left: "4%",  size: 2, duration: "35s", delay: "5.5s",  opacity: 0.08 },
  { top: "33%", left: "48%", size: 1, duration: "29s", delay: "13.5s", opacity: 0.07 },
  { top: "47%", left: "82%", size: 1, duration: "31s", delay: "0.8s",  opacity: 0.09 },
  { top: "62%", left: "35%", size: 2, duration: "27s", delay: "14.5s", opacity: 0.11 },
  { top: "73%", left: "58%", size: 1, duration: "39s", delay: "6.8s",  opacity: 0.06 },
  { top: "82%", left: "4%",  size: 2, duration: "25s", delay: "19s",   opacity: 0.08 },
  { top: "14%", left: "63%", size: 1, duration: "32s", delay: "10.5s", opacity: 0.07 },
  { top: "27%", left: "93%", size: 1, duration: "36s", delay: "2.8s",  opacity: 0.06 },
  { top: "54%", left: "12%", size: 2, duration: "23s", delay: "16.5s", opacity: 0.09 },
  { top: "66%", left: "78%", size: 1, duration: "30s", delay: "5.8s",  opacity: 0.07 },
  { top: "78%", left: "46%", size: 1, duration: "34s", delay: "12.5s", opacity: 0.08 },
  { top: "42%", left: "90%", size: 2, duration: "20s", delay: "7.2s",  opacity: 0.10 },
  { top: "16%", left: "77%", size: 1, duration: "37s", delay: "3.2s",  opacity: 0.06 },
];

function VoidStars() {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {STAR_CONFIGS.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "#ffffff",
            opacity: s.opacity,
            animation: `ft-star-drift ${s.duration} ${s.delay} infinite ease-in-out alternate`,
          }}
        />
      ))}
    </div>
  );
}

// ── Phosphor — scanlines + grid + edge glow ────────────────────────────────────

function PhosphorEffect() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(57,255,20,0.042) 2px, rgba(57,255,20,0.042) 3px)",
          animation: "ft-scanline-scroll 8s linear infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 45%, rgba(57,255,20,0.11) 100%)",
        }}
      />
    </div>
  );
}

// ── Arctic — SVG snowflakes + snowman easter egg ───────────────────────────────

interface SnowflakeConfig {
  left: string;
  size: number;
  duration: string;
  delay: string;
  opacity: number;
  variant: 0 | 1 | 2; // which snowflake shape to use
  drift: number;       // horizontal drift in px
}

const SNOWFLAKE_CONFIGS: SnowflakeConfig[] = [
  { left: "3%",  size: 14, duration: "14s", delay: "0s",    opacity: 0.55, variant: 0, drift: 8  },
  { left: "9%",  size: 10, duration: "18s", delay: "2.5s",  opacity: 0.45, variant: 1, drift: -5 },
  { left: "16%", size: 18, duration: "12s", delay: "6s",    opacity: 0.50, variant: 2, drift: 10 },
  { left: "23%", size: 8,  duration: "20s", delay: "1s",    opacity: 0.40, variant: 0, drift: -8 },
  { left: "30%", size: 16, duration: "15s", delay: "4.5s",  opacity: 0.55, variant: 1, drift: 6  },
  { left: "38%", size: 11, duration: "11s", delay: "8s",    opacity: 0.45, variant: 2, drift: -6 },
  { left: "45%", size: 14, duration: "17s", delay: "2s",    opacity: 0.50, variant: 0, drift: 9  },
  { left: "52%", size: 9,  duration: "13s", delay: "5.5s",  opacity: 0.42, variant: 1, drift: -7 },
  { left: "59%", size: 20, duration: "19s", delay: "0.5s",  opacity: 0.38, variant: 2, drift: 5  },
  { left: "66%", size: 12, duration: "14s", delay: "3.5s",  opacity: 0.52, variant: 0, drift: -9 },
  { left: "73%", size: 16, duration: "16s", delay: "7s",    opacity: 0.45, variant: 1, drift: 7  },
  { left: "80%", size: 10, duration: "10s", delay: "1.8s",  opacity: 0.48, variant: 2, drift: -5 },
  { left: "87%", size: 15, duration: "18s", delay: "9s",    opacity: 0.42, variant: 0, drift: 8  },
  { left: "93%", size: 8,  duration: "12s", delay: "4s",    opacity: 0.55, variant: 1, drift: -6 },
  { left: "97%", size: 13, duration: "16s", delay: "6.5s",  opacity: 0.46, variant: 2, drift: 6  },
  { left: "13%", size: 11, duration: "21s", delay: "3s",    opacity: 0.40, variant: 0, drift: -8 },
  { left: "42%", size: 17, duration: "13s", delay: "10s",   opacity: 0.50, variant: 1, drift: 10 },
  { left: "70%", size: 9,  duration: "15s", delay: "7.5s",  opacity: 0.43, variant: 2, drift: -5 },
];

// SVG snowflake: 3 variants using actual crystalline arm patterns
function SnowflakeSVG({ size, opacity, variant }: { size: number; opacity: number; variant: 0 | 1 | 2 }) {
  const c = size / 2;
  const arm = size * 0.44;
  const notch = size * 0.20;
  const color = "#C8E6F5";

  if (variant === 0) {
    // 6-arm classic snowflake
    const arms = [0, 60, 120, 180, 240, 300];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity, display: "block" }}>
        {arms.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const x2 = c + Math.cos(rad) * arm;
          const y2 = c + Math.sin(rad) * arm;
          // branch notches
          const bRad1 = ((deg + 60) * Math.PI) / 180;
          const bRad2 = ((deg - 60) * Math.PI) / 180;
          const bx1 = c + Math.cos(rad) * arm * 0.55 + Math.cos(bRad1) * notch;
          const by1 = c + Math.sin(rad) * arm * 0.55 + Math.sin(bRad1) * notch;
          const bx2 = c + Math.cos(rad) * arm * 0.55 + Math.cos(bRad2) * notch;
          const by2 = c + Math.sin(rad) * arm * 0.55 + Math.sin(bRad2) * notch;
          return (
            <g key={i} stroke={color} strokeWidth={size * 0.07} strokeLinecap="round">
              <line x1={c} y1={c} x2={x2} y2={y2} />
              <line x1={c + Math.cos(rad) * arm * 0.55} y1={c + Math.sin(rad) * arm * 0.55} x2={bx1} y2={by1} />
              <line x1={c + Math.cos(rad) * arm * 0.55} y1={c + Math.sin(rad) * arm * 0.55} x2={bx2} y2={by2} />
            </g>
          );
        })}
        <circle cx={c} cy={c} r={size * 0.07} fill={color} />
      </svg>
    );
  }

  if (variant === 1) {
    // 6-arm with diamond tips
    const arms = [0, 60, 120, 180, 240, 300];
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity, display: "block" }}>
        {arms.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const x2 = c + Math.cos(rad) * arm;
          const y2 = c + Math.sin(rad) * arm;
          const perp = ((deg + 90) * Math.PI) / 180;
          const tipW = size * 0.09;
          return (
            <g key={i} stroke={color} strokeWidth={size * 0.065} strokeLinecap="round">
              <line x1={c} y1={c} x2={x2} y2={y2} />
              {/* diamond tip */}
              <line
                x1={x2 + Math.cos(perp) * tipW} y1={y2 + Math.sin(perp) * tipW}
                x2={x2 - Math.cos(perp) * tipW} y2={y2 - Math.sin(perp) * tipW}
              />
              {/* mid branch ticks */}
              <line
                x1={c + Math.cos(rad) * arm * 0.45 + Math.cos(perp) * notch * 0.8}
                y1={c + Math.sin(rad) * arm * 0.45 + Math.sin(perp) * notch * 0.8}
                x2={c + Math.cos(rad) * arm * 0.45 - Math.cos(perp) * notch * 0.8}
                y2={c + Math.sin(rad) * arm * 0.45 - Math.sin(perp) * notch * 0.8}
              />
            </g>
          );
        })}
        <circle cx={c} cy={c} r={size * 0.09} fill={color} />
      </svg>
    );
  }

  // variant 2: simple 12-arm (6 main + 6 diagonal)
  const arms12 = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity, display: "block" }}>
      {arms12.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const len = i % 2 === 0 ? arm : arm * 0.6;
        const x2 = c + Math.cos(rad) * len;
        const y2 = c + Math.sin(rad) * len;
        return (
          <line key={i} x1={c} y1={c} x2={x2} y2={y2}
            stroke={color}
            strokeWidth={i % 2 === 0 ? size * 0.07 : size * 0.045}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={c} cy={c} r={size * 0.085} fill={color} />
    </svg>
  );
}

// CSS keyframes injected once for snowflake horizontal drift
const SNOW_STYLE_ID = "ft-snow-drift-style";
function injectSnowDriftStyles() {
  if (document.getElementById(SNOW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SNOW_STYLE_ID;
  style.textContent = `
    @keyframes ft-snowflake-fall-pos { 0% { transform: translateY(-30px) rotate(0deg); } 100% { transform: translateY(110vh) rotate(360deg); } }
    @keyframes ft-snowflake-fall-neg { 0% { transform: translateY(-30px) rotate(0deg); } 100% { transform: translateY(110vh) rotate(-360deg); } }
    @keyframes ft-snowman-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes ft-snowman-appear { 0% { opacity:0; transform:scale(0.7) translateY(20px); } 100% { opacity:1; transform:scale(1) translateY(0); } }
  `;
  document.head.appendChild(style);
}

// CSS snowman - drawn purely with divs/borders
function SnowmanEasterEgg({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 40,
        zIndex: 50,
        pointerEvents: "none",
        animation: "ft-snowman-appear 0.6s ease forwards, ft-snowman-bob 3s 0.6s ease-in-out infinite",
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
      }}
    >
      {/* Body */}
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #f0f8ff, #c8e6f5)",
        border: "1.5px solid rgba(200,230,245,0.6)",
        margin: "0 auto",
        position: "relative",
      }}>
        {/* buttons */}
        {[38, 52, 66].map(pct => (
          <div key={pct} style={{
            position: "absolute", left: "50%", top: `${pct}%`,
            transform: "translate(-50%,-50%)",
            width: 5, height: 5, borderRadius: "50%",
            background: "#1A2333",
          }} />
        ))}
      </div>
      {/* Head */}
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #f0f8ff, #c8e6f5)",
        border: "1.5px solid rgba(200,230,245,0.6)",
        margin: "-6px auto 0",
        position: "relative",
      }}>
        {/* eyes */}
        <div style={{ position: "absolute", top: 9, left: 7, width: 4, height: 4, borderRadius: "50%", background: "#1A2333" }} />
        <div style={{ position: "absolute", top: 9, right: 7, width: 4, height: 4, borderRadius: "50%", background: "#1A2333" }} />
        {/* carrot nose */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 0, height: 0,
          borderTop: "3px solid transparent",
          borderBottom: "3px solid transparent",
          borderLeft: "8px solid #F4A21E",
        }} />
        {/* smile dots */}
        {[-5, 0, 5].map(x => (
          <div key={x} style={{
            position: "absolute", bottom: 7,
            left: `calc(50% + ${x}px)`,
            transform: "translateX(-50%)",
            width: 2.5, height: 2.5, borderRadius: "50%",
            background: "#1A2333",
          }} />
        ))}
      </div>
      {/* Hat */}
      <div style={{
        width: 28, height: 10,
        background: "#1A2333",
        margin: "-2px auto 0",
        borderRadius: "1px 1px 0 0",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", bottom: -1, left: -4,
          width: 36, height: 4,
          background: "#1A2333",
          borderRadius: 1,
        }} />
        {/* hat band */}
        <div style={{
          position: "absolute", bottom: 2, left: 0, right: 0,
          height: 3, background: "var(--ft-accent)",
        }} />
      </div>
    </div>
  );
}

function ArcticSnow() {
  const [snowmanVisible, setSnowmanVisible] = useState(false);
  const clickCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { injectSnowDriftStyles(); }, []);

  // Triple-click anywhere shows snowman for 6s
  function handleTripleClick() {
    clickCount.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { clickCount.current = 0; }, 600);
    if (clickCount.current >= 3) {
      clickCount.current = 0;
      setSnowmanVisible(true);
      setTimeout(() => setSnowmanVisible(false), 6000);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
      onClick={handleTripleClick}
    >
      {/* Subtle frost overlay at bottom */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0, height: "12%",
        background: "linear-gradient(to top, rgba(200,230,245,0.06) 0%, transparent 100%)",
      }} />

      {SNOWFLAKE_CONFIGS.map((flake, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: "-30px",
            left: flake.left,
            animation: `${flake.drift > 0 ? "ft-snowflake-fall-pos" : "ft-snowflake-fall-neg"} ${flake.duration} ${flake.delay} infinite linear`,
          }}
        >
          <SnowflakeSVG size={flake.size} opacity={flake.opacity} variant={flake.variant} />
        </div>
      ))}

      <SnowmanEasterEgg visible={snowmanVisible} />
    </div>
  );
}

// ── Amber — scanlines + warm vignette ─────────────────────────────────────────

function AmberEffect() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,176,0,0.028) 3px, rgba(255,176,0,0.028) 4px)",
          animation: "ft-scanline-scroll 12s linear infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 45%, rgba(255,144,0,0.04) 0%, transparent 55%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </div>
  );
}

// ── Midnight — aurora borealis drifting ellipses ───────────────────────────────

function MidnightAurora() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "5%", left: "-20%",
          width: "80%", height: "45%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,100,255,0.05) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "ft-aurora-drift-a 28s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "15%", right: "-15%",
          width: "70%", height: "40%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(0,200,150,0.04) 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "ft-aurora-drift-b 34s ease-in-out infinite alternate",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "10%", left: "10%",
          width: "60%", height: "35%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(80,0,200,0.025) 0%, transparent 70%)",
          filter: "blur(100px)",
          animation: "ft-aurora-drift-c 42s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}

// ── Ocean bubbles + shimmer ────────────────────────────────────────────────────

interface BubbleConfig {
  size: number;
  left: string;
  duration: string;
  delay: string;
}

const BUBBLE_CONFIGS: BubbleConfig[] = [
  { size: 10, left: "8%",  duration: "11s",  delay: "0s" },
  { size: 18, left: "17%", duration: "15s",  delay: "1.5s" },
  { size: 7,  left: "26%", duration: "9s",   delay: "3s" },
  { size: 24, left: "35%", duration: "18s",  delay: "0.5s" },
  { size: 12, left: "44%", duration: "12s",  delay: "4s" },
  { size: 20, left: "53%", duration: "16s",  delay: "2s" },
  { size: 8,  left: "62%", duration: "10s",  delay: "5s" },
  { size: 26, left: "71%", duration: "20s",  delay: "1s" },
  { size: 14, left: "79%", duration: "13s",  delay: "3.5s" },
  { size: 22, left: "86%", duration: "17s",  delay: "0.2s" },
  { size: 8,  left: "92%", duration: "8s",   delay: "4.5s" },
  { size: 16, left: "97%", duration: "14s",  delay: "2.8s" },
];

function OceanEffect() {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "radial-gradient(ellipse at 50% 80%, rgba(0,212,255,0.07) 0%, transparent 60%)",
          animation: "ft-ocean-shimmer 7s ease-in-out infinite alternate",
        }}
      />
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        {BUBBLE_CONFIGS.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: b.left,
              width: b.size,
              height: b.size,
              borderRadius: "50%",
              background: "rgba(0, 212, 255, 0.16)",
              border: "1px solid rgba(0, 212, 255, 0.38)",
              boxShadow: "0 0 6px rgba(0, 212, 255, 0.18)",
              animation: `ft-bubble-rise ${b.duration} ${b.delay} infinite ease-in-out`,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ── Rose — floating SVG hearts + sparkles + bottom glow ───────────────────────

interface RoseParticleConfig {
  type: "heart" | "sparkle" | "diamond";
  left: string;
  bottom: string;
  duration: string;
  delay: string;
  size: number;
}

const ROSE_CONFIGS: RoseParticleConfig[] = [
  { type: "heart",   left: "5%",  bottom: "15%", duration: "4s",   delay: "0s",    size: 14 },
  { type: "sparkle", left: "15%", bottom: "35%", duration: "5s",   delay: "0.8s",  size: 10 },
  { type: "heart",   left: "28%", bottom: "60%", duration: "3.5s", delay: "1.6s",  size: 18 },
  { type: "diamond", left: "42%", bottom: "20%", duration: "4.5s", delay: "0.4s",  size: 12 },
  { type: "heart",   left: "57%", bottom: "45%", duration: "5.5s", delay: "2s",    size: 16 },
  { type: "sparkle", left: "68%", bottom: "70%", duration: "4s",   delay: "1.2s",  size: 10 },
  { type: "heart",   left: "80%", bottom: "25%", duration: "3.8s", delay: "0.6s",  size: 20 },
  { type: "diamond", left: "92%", bottom: "50%", duration: "4.8s", delay: "1.8s",  size: 11 },
  { type: "heart",   left: "33%", bottom: "80%", duration: "6s",   delay: "3s",    size: 13 },
  { type: "sparkle", left: "72%", bottom: "10%", duration: "3.2s", delay: "2.4s",  size: 14 },
];

function RoseParticle({ cfg }: { cfg: RoseParticleConfig }) {
  const color = "rgba(255, 45, 120, 0.65)";
  const s = cfg.size;

  let inner: React.ReactNode;

  if (cfg.type === "heart") {
    // SVG heart path
    inner = (
      <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: "block" }}>
        <path
          d="M12 21C12 21 3 13.5 3 8a4.5 4.5 0 0 1 9-0.5A4.5 4.5 0 0 1 21 8c0 5.5-9 13-9 13z"
          fill={color}
          stroke="none"
        />
      </svg>
    );
  } else if (cfg.type === "sparkle") {
    // 4-pointed star
    const c = s / 2;
    const r1 = s * 0.45;
    const r2 = s * 0.18;
    const points = [0, 90, 180, 270].map(deg => {
      const rad = (deg * Math.PI) / 180;
      const radOff = ((deg + 45) * Math.PI) / 180;
      return `${c + Math.cos(rad) * r1},${c + Math.sin(rad) * r1} ${c + Math.cos(radOff) * r2},${c + Math.sin(radOff) * r2}`;
    }).join(" ");
    inner = (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
        <polygon points={points} fill={color} />
      </svg>
    );
  } else {
    // diamond — rotated square
    const c = s / 2;
    const pts = `${c},${s * 0.05} ${s * 0.95},${c} ${c},${s * 0.95} ${s * 0.05},${c}`;
    inner = (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
        <polygon points={pts} fill={color} />
      </svg>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: cfg.left,
        bottom: cfg.bottom,
        filter: "drop-shadow(0 0 6px rgba(255,45,120,0.4))",
        animation: `ft-rose-float ${cfg.duration} ${cfg.delay} infinite ease-in-out`,
        userSelect: "none",
      }}
    >
      {inner}
    </div>
  );
}

function RoseEffect() {
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0, height: "30%",
          background: "linear-gradient(to top, rgba(255,45,120,0.09) 0%, transparent 100%)",
        }}
      />
      {ROSE_CONFIGS.map((cfg, i) => (
        <RoseParticle key={i} cfg={cfg} />
      ))}
    </div>
  );
}

// ── ThemeEffects ───────────────────────────────────────────────────────────────

export function ThemeEffects() {
  const [theme, setTheme] = useState<ActiveTheme>(getCurrentTheme);

  useEffect(() => {
    setTheme(getCurrentTheme());
    const observer = new MutationObserver(() => setTheme(getCurrentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  if (theme === "void")     return <VoidStars />;
  if (theme === "phosphor") return <PhosphorEffect />;
  if (theme === "arctic")   return <ArcticSnow />;
  if (theme === "amber")    return <AmberEffect />;
  if (theme === "midnight") return <MidnightAurora />;
  if (theme === "matrix")   return <MatrixRain />;
  if (theme === "rose")     return <RoseEffect />;
  if (theme === "ocean")    return <OceanEffect />;
  return null;
}
