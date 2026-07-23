import { useEffect, useState, useRef } from "react";
import { MatrixRain } from "@/components/matrix-rain";

type ActiveTheme = string;

function getCurrentTheme(): ActiveTheme {
  return document.documentElement.getAttribute("data-theme") ?? "void";
}

export function getAnimIntensity(): number {
  try { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nr-anim-intensity").trim() || "0.5"); } catch { return 0.5; }
}

const INTENSITY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 0,
  opacity: "clamp(0, calc(var(--nr-anim-intensity, 0.5) * 2), 1)",
};

// ── Void — no ambient decoration.
function VoidEffect() {
  return null;
}

// ── Phosphor — CRT scanlines + pixel grid + edge vignette.
function PhosphorEffect() {
  return (
    <div style={INTENSITY_STYLE}>
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

// ── Arctic — precision graph-paper grid.
function ArcticEffect() {
  return (
    <div style={INTENSITY_STYLE}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,82,204,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(0,82,204,0.055) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,82,204,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(0,82,204,0.09) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />
    </div>
  );
}

// ── Amber — warm scanlines + CRT vignette.
function AmberEffect() {
  return (
    <div style={INTENSITY_STYLE}>
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

// ── Midnight — ruled ledger lines.
function MidnightEffect() {
  return (
    <div style={INTENSITY_STYLE}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(77,159,255,0.035) 1px, transparent 1px)",
          backgroundSize: "100% 20px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(1,8,23,0.55) 100%)",
        }}
      />
    </div>
  );
}

// ── Synthwave CSS perks — neon glow on sidebar + header borders.
const SYNTHWAVE_CSS = `
  @keyframes ft-sw-rail{0%,100%{opacity:0.55}50%{opacity:1}}
  [data-theme="synthwave"] aside{box-shadow:inset -2px 0 0 rgba(255,0,220,0.18),4px 0 24px rgba(255,0,220,0.1);}
  [data-theme="synthwave"] header{box-shadow:0 2px 18px rgba(0,200,255,0.1);border-bottom-color:rgba(220,0,255,0.35)!important;}
  [data-theme="synthwave"] footer{border-top-color:rgba(220,0,255,0.25)!important;}
  [data-theme="synthwave"] nav button:hover span:first-child{box-shadow:0 0 10px rgba(0,200,255,0.4),0 0 4px rgba(255,0,220,0.4)!important;}
`;

// ── Deep-space CSS perks — blue nebula glow on structural chrome.
const DEEPSPACE_CSS = `
  [data-theme="deep-space"] aside{box-shadow:4px 0 28px rgba(30,30,200,0.14);}
  [data-theme="deep-space"] header{box-shadow:0 1px 0 rgba(100,120,255,0.15),0 3px 16px rgba(40,40,180,0.08);}
  [data-theme="deep-space"] footer{background:linear-gradient(to right,rgba(20,20,80,0.35),var(--ft-raised) 40%)!important;}
  [data-theme="deep-space"] nav button:hover span:first-child{box-shadow:0 0 12px rgba(100,150,255,0.35)!important;}
`;

// ── Mario CSS perks — NES 1-1 sky palette, pixel-sharp borders, pipe sidebar.
const MARIO_CSS = `
  @keyframes mario-coin-pulse{0%,100%{box-shadow:0 0 0 2px #F8C800,0 0 6px #F8C800}50%{box-shadow:0 0 0 2px #F8C800,0 0 16px #F8C800,0 0 28px rgba(248,200,0,0.35)}}
  @keyframes mario-star-spin{0%{filter:hue-rotate(0deg) brightness(1.2)}100%{filter:hue-rotate(360deg) brightness(1.5)}}
  [data-theme="mario"] aside{border-right:4px solid #3ABB3A!important;background:linear-gradient(to bottom,#2850C0,#1A38A0)!important;box-shadow:4px 0 0 #1A7A1A,8px 0 20px rgba(0,0,0,0.3)!important;}
  [data-theme="mario"] header{border-bottom:4px solid #AF4000!important;background:linear-gradient(to right,#2850C0,#3A70DC,#2850C0)!important;box-shadow:0 6px 20px rgba(0,0,0,0.4)!important;}
  [data-theme="mario"] footer{border-top:4px solid #AF4000!important;background:linear-gradient(to right,#AF4000 0%,#2850C0 30%)!important;}
  [data-theme="mario"] button,[data-theme="mario"] input,[data-theme="mario"] [style*="border-radius"]{border-radius:0!important;}
  [data-theme="mario"] nav button:hover{background:rgba(248,200,0,0.22)!important;box-shadow:inset 0 0 0 2px rgba(248,200,0,0.3)!important;}
  [data-theme="mario"] nav button[aria-current="page"] span:first-child{animation:mario-coin-pulse 1.1s ease-in-out infinite!important;}
  [data-theme="mario"] *{image-rendering:pixelated;}
  [data-theme="mario"] aside::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 15px,rgba(255,255,255,0.03) 15px,rgba(255,255,255,0.03) 16px);pointer-events:none;}
  [data-theme="mario"] aside{--muted-foreground:210 88% 78%;}
  [data-theme="mario"] .text-muted-foreground{color:#B0CCFF!important;}
  [data-theme="mario"] main{position:relative;z-index:1;background:transparent!important;}
  @keyframes ix-pipe-overlay{0%{transform:scaleY(0)}15%{transform:scaleY(1)}72%{transform:scaleY(1)}88%{transform:scaleY(0)}100%{transform:scaleY(0)}}
`;

// ── Gilded CSS perks — golden shimmer on sidebar + header.
const GILDED_CSS = `
  @keyframes ft-gld-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
  @keyframes ft-gld-sidebar-pulse{0%,100%{box-shadow:4px 0 28px rgba(212,160,10,0.18),inset -2px 0 0 rgba(255,200,50,0.15)}50%{box-shadow:4px 0 48px rgba(255,200,10,0.35),inset -2px 0 0 rgba(255,215,80,0.3)}}
  @keyframes ft-gld-active{0%,100%{box-shadow:0 0 10px rgba(212,160,10,0.5),0 0 0 1px rgba(255,200,50,0.4)}50%{box-shadow:0 0 22px rgba(255,200,10,0.8),0 0 0 1px rgba(255,220,80,0.7)}}
  @keyframes ft-gld-border-shimmer{0%,100%{border-color:rgba(212,160,10,0.25)}50%{border-color:rgba(255,200,50,0.5)}}
  [data-theme="gilded"] aside{animation:ft-gld-sidebar-pulse 3s ease-in-out infinite;border-right-color:rgba(212,160,10,0.4)!important;}
  [data-theme="gilded"] header{box-shadow:0 2px 24px rgba(212,160,10,0.18);border-bottom:1px solid rgba(212,160,10,0.45)!important;position:relative;overflow:hidden;}
  [data-theme="gilded"] header::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(105deg,transparent 25%,rgba(255,200,50,0.07) 50%,transparent 75%);animation:ft-gld-shimmer 9s ease-in-out infinite;pointer-events:none;}
  [data-theme="gilded"] footer{border-top-color:rgba(212,160,10,0.35)!important;background:linear-gradient(to right,rgba(60,35,0,0.5),var(--ft-raised) 40%)!important;}
  [data-theme="gilded"] nav button:hover span:first-child{box-shadow:0 0 10px rgba(212,160,10,0.45)!important;}
  [data-theme="gilded"] nav button[aria-current="page"] span:first-child{animation:ft-gld-active 1.4s ease-in-out infinite!important;}
  [data-theme="gilded"] nav button[aria-current="page"]{border-left:2px solid rgba(212,160,10,0.7)!important;}
  [data-theme="gilded"] main *[style*="border: 1px solid var(--ft-border)"],[data-theme="gilded"] main *[style*="border:1px solid var(--ft-border)"]{animation:ft-gld-border-shimmer 4s ease-in-out infinite;}
`;

// ── Bloodline CSS perks — crimson pulsing sidebar + red glow on interactions.
const BLOODLINE_CSS = `
  @keyframes ft-blood-rail{0%,100%{box-shadow:inset -4px 0 12px rgba(185,0,0,0.4),4px 0 28px rgba(185,0,0,0.18),0 0 60px rgba(120,0,0,0.08)}50%{box-shadow:inset -4px 0 22px rgba(240,20,20,0.65),6px 0 45px rgba(220,38,38,0.32),0 0 80px rgba(160,0,0,0.14)}}
  @keyframes bloodline-pulse{0%,100%{opacity:0.5}50%{opacity:1}}
  @keyframes ft-blood-heartbeat{0%,100%{box-shadow:0 4px 20px rgba(185,0,0,0.12),0 1px 0 rgba(120,0,0,0.5)}40%{box-shadow:0 4px 32px rgba(240,20,20,0.28),0 1px 0 rgba(160,0,0,0.8)}42%{box-shadow:0 4px 14px rgba(185,0,0,0.1),0 1px 0 rgba(100,0,0,0.4)}60%{box-shadow:0 4px 40px rgba(255,10,10,0.36),0 1px 0 rgba(180,0,0,0.9)}62%{box-shadow:0 4px 20px rgba(185,0,0,0.12),0 1px 0 rgba(120,0,0,0.5)}}
  @keyframes ft-blood-active{0%,100%{box-shadow:0 0 12px rgba(220,38,38,0.5),0 0 0 1px rgba(180,0,0,0.5)}50%{box-shadow:0 0 28px rgba(255,30,30,0.9),0 0 0 1px rgba(240,0,0,0.8)}}
  @keyframes ft-blood-border-breathe{0%,100%{border-color:rgba(120,0,0,0.45)}50%{border-color:rgba(200,0,0,0.75)}}
  @keyframes ft-blood-title-pulse{0%,100%{text-shadow:0 0 8px rgba(180,0,0,0)}50%{text-shadow:0 0 18px rgba(220,20,20,0.45),0 0 4px rgba(180,0,0,0.3)}}
  @keyframes ft-blood-scroll-bar{0%,100%{background:rgba(140,0,0,0.4)}50%{background:rgba(220,30,30,0.7)}}
  [data-theme="bloodline"] aside{animation:ft-blood-rail 1.4s ease-in-out infinite;border-right:2px solid rgba(150,0,0,0.8)!important;background:linear-gradient(to bottom,var(--ft-raised),rgba(15,0,0,0.6))!important;}
  [data-theme="bloodline"] header{border-bottom:2px solid rgba(140,0,0,0.8)!important;animation:ft-blood-heartbeat 1.4s ease-in-out infinite;background:linear-gradient(to right,rgba(25,0,0,0.45),var(--ft-surface) 25%,var(--ft-surface) 75%,rgba(25,0,0,0.45))!important;}
  [data-theme="bloodline"] footer{border-top:2px solid rgba(100,0,0,0.6)!important;background:linear-gradient(to right,rgba(40,0,0,0.6),var(--ft-raised) 40%)!important;box-shadow:0 -4px 24px rgba(120,0,0,0.2)!important;}
  [data-theme="bloodline"] nav button:hover{background:rgba(100,0,0,0.15)!important;}
  [data-theme="bloodline"] nav button:hover span:first-child{box-shadow:0 0 14px rgba(255,30,30,0.55)!important;}
  [data-theme="bloodline"] nav button[aria-current="page"] span:first-child{animation:ft-blood-active 0.7s ease-in-out infinite!important;}
  [data-theme="bloodline"] nav button[aria-current="page"]{border-left:3px solid rgba(200,0,0,0.9)!important;background:rgba(80,0,0,0.22)!important;}
  [data-theme="bloodline"] main h1,[data-theme="bloodline"] main h2,[data-theme="bloodline"] [style*="font-size: 18"],[data-theme="bloodline"] [style*="fontSize: 18"]{animation:ft-blood-title-pulse 2.8s ease-in-out infinite;}
  [data-theme="bloodline"] ::-webkit-scrollbar-thumb{background:rgba(160,0,0,0.5)!important;animation:ft-blood-scroll-bar 1.4s ease-in-out infinite;}
  [data-theme="bloodline"] ::-webkit-scrollbar-track{background:rgba(20,0,0,0.3)!important;}
  [data-theme="bloodline"] input:focus,[data-theme="bloodline"] select:focus,[data-theme="bloodline"] textarea:focus{outline:none!important;box-shadow:0 0 0 1.5px rgba(200,0,0,0.8),0 0 12px rgba(180,0,0,0.25)!important;}
  [data-theme="bloodline"] button:not([disabled]):hover{box-shadow:0 0 10px rgba(200,0,0,0.2)!important;}
  [data-theme="bloodline"] table thead th{border-bottom-color:rgba(160,0,0,0.5)!important;}
  [data-theme="bloodline"] table tbody tr:hover{background:rgba(80,0,0,0.12)!important;}
`;

// ── Synthwave — neon retro-grid + horizontal neon horizon.
function SynthwaveEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId = 0;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.008;

      const W = canvas.width;
      const H = canvas.height;
      const horizonY = H * 0.62;
      const vp = { x: W / 2, y: horizonY };

      // Perspective grid lines going to horizon
      const gridCount = 22;
      ctx.strokeStyle = "rgba(255,0,220,0.07)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridCount; i++) {
        const xBase = (i / gridCount) * W;
        ctx.beginPath();
        ctx.moveTo(xBase, H);
        ctx.lineTo(vp.x, horizonY);
        ctx.stroke();
      }

      // Horizontal lines scrolling toward viewer
      const hCount = 16;
      for (let i = 0; i < hCount; i++) {
        const frac = ((i / hCount) + t) % 1;
        const yLerp = horizonY + (H - horizonY) * (frac * frac);
        const alpha = Math.min(frac * 2, 1) * 0.09;
        ctx.strokeStyle = `rgba(220,0,255,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, yLerp);
        ctx.lineTo(W, yLerp);
        ctx.stroke();
      }

      // Neon horizon glow lines
      const glowColors = ["rgba(255,0,200,0.18)", "rgba(0,200,255,0.12)", "rgba(255,0,200,0.08)"];
      [0, 2, 4].forEach((offset, idx) => {
        ctx.strokeStyle = glowColors[idx];
        ctx.lineWidth = 1.5 - idx * 0.4;
        ctx.beginPath();
        ctx.moveTo(0, horizonY + offset);
        ctx.lineTo(W, horizonY + offset);
        ctx.stroke();
      });

      // Neon sparks — tiny bright dots drifting horizontally
      const sparkSeed = Math.floor(t * 3);
      for (let s = 0; s < 18; s++) {
        const sx = ((s * 137.5 + sparkSeed * 23) % W + Math.sin(t * 1.3 + s) * 40);
        const sy = horizonY - 8 + (Math.sin(t * 0.9 + s * 0.7) * 6);
        const alpha = 0.4 + Math.sin(t * 2 + s) * 0.3;
        ctx.fillStyle = s % 3 === 0 ? `rgba(0,255,255,${alpha})` : `rgba(255,0,200,${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div style={INTENSITY_STYLE}>
      <style>{SYNTHWAVE_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, opacity: 1 }} />
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(20,0,40,0.65) 100%)",
      }} />
    </div>
  );
}

// ── Deep-space — twinkling starfield.
function DeepSpaceEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    interface Star { x: number; y: number; r: number; phase: number; speed: number; color: string }
    let stars: Star[] = [];
    let rafId = 0;
    let t = 0;

    function makeStars(W: number, H: number) {
      const cols = ["255,255,255", "180,220,255", "255,200,160", "200,255,240"];
      stars = Array.from({ length: 200 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.3 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 1.4,
        color: cols[Math.floor(Math.random() * cols.length)],
      }));
    }

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      makeStars(canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 0.012;

      for (const s of stars) {
        const alpha = 0.25 + 0.65 * ((Math.sin(t * s.speed + s.phase) + 1) / 2);
        ctx.fillStyle = `rgba(${s.color},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Occasional nebula shimmer streaks
      if (Math.sin(t * 0.17) > 0.92) {
        const gx = canvas.width * 0.3 + Math.sin(t) * canvas.width * 0.2;
        const gy = canvas.height * 0.4 + Math.cos(t * 0.7) * canvas.height * 0.15;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, 200);
        grad.addColorStop(0, "rgba(100,60,200,0.04)");
        grad.addColorStop(1, "rgba(100,60,200,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, 200, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div style={INTENSITY_STYLE}>
      <style>{DEEPSPACE_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

// ── Mario — NES 1-1: ground, pipes, goombas, interactive ? blocks, items.
function MarioEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    interface Cloud   { x: number; y: number; vx: number; w: number; h: number; alpha: number; layer: number; }
    interface Item    { x: number; y: number; vy: number; ay: number; alpha: number; f: number; type: "coin"|"mushroom"|"star"; }
    interface Goomba  { x: number; y: number; vx: number; vy: number; f: number; dead: boolean; dt: number; deathPhase: 0|1|2; }
    interface StarItem { x: number; y: number; vx: number; vy: number; rot: number; alpha: number; life: number; }
    interface Trail   { x: number; y: number; alpha: number; }

    const clouds:  Cloud[]  = [];
    const items:   Item[]   = [];
    const goombas: Goomba[] = [];
    const stars:   StarItem[] = [];
    const trail:   Trail[]  = [];
    let coinsTotal = 0;

    let rafId = 0, frame = 0;
    let lastBotX = -1;

    function resize() { if (!canvas) return; canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);

    // Seed clouds — two layers
    for (let i = 0; i < 3; i++) clouds.push({ x: Math.random() * canvas.width, y: 18 + Math.random() * 45, vx: 0.18 + Math.random() * 0.18, w: 70 + Math.random() * 70, h: 24 + Math.random() * 14, alpha: 0.28 + Math.random() * 0.15, layer: 0 });
    for (let i = 0; i < 4; i++) clouds.push({ x: Math.random() * canvas.width, y: 8 + Math.random() * 28, vx: 0.38 + Math.random() * 0.28, w: 36 + Math.random() * 40, h: 12 + Math.random() * 10, alpha: 0.14 + Math.random() * 0.1, layer: 1 });

    function spawnGoomba() {
      if (!canvas || goombas.filter(g => !g.dead).length >= 3) return;
      goombas.push({ x: canvas.width + 20, y: canvas.height - 28, vx: -(0.45 + Math.random() * 0.4), vy: 0, f: 0, dead: false, dt: 0, deathPhase: 0 });
    }
    spawnGoomba();

    function spawnStar(x: number, y: number) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        stars.push({ x, y, vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2) - 1.5, rot: Math.random() * Math.PI * 2, alpha: 0, life: 0 });
      }
    }

    function onBotLand(e: Event) {
      if (!canvas) return;
      const bx = ((e as CustomEvent).detail as { x: number }).x;
      for (let i = 0; i < 6; i++) { items.push({ x: bx + (Math.random() - 0.5) * 60, y: canvas.height - 55, vy: -(2.5 + Math.random() * 3), ay: 0.1, alpha: 0, f: 0, type: "coin" }); coinsTotal++; }
      spawnStar(bx, canvas.height - 70);
      // Goomba stomp — immediately pop upward then fall off screen
      for (const g of goombas) {
        if (!g.dead && Math.abs(bx - g.x) < 35) {
          g.dead = true; g.dt = 0; g.deathPhase = 1; g.vy = -6;
          coinsTotal++;
        }
      }
    }
    window.addEventListener("ft-bot-land", onBotLand);

    function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud) {
      const bw = Math.round(c.w / 16) * 16, bh = Math.round(c.h / 8) * 8;
      ctx.save(); ctx.globalAlpha = c.alpha;
      if (c.layer === 0) {
        ctx.fillStyle = "#90C8FC"; ctx.fillRect(c.x + 8, c.y + bh - 8, bw - 8, 8); ctx.fillRect(c.x, c.y + bh / 2, 8, bh / 2);
        ctx.fillStyle = "#FCFCFC"; ctx.fillRect(c.x, c.y, bw, bh - 8); ctx.fillRect(c.x + 16, c.y - 12, bw - 32, 12);
      } else {
        ctx.fillStyle = "#B8DCFE"; ctx.fillRect(c.x, c.y, bw, bh);
        ctx.fillStyle = "#DCECFE"; ctx.fillRect(c.x + 4, c.y - 6, bw - 8, 8);
      }
      ctx.restore();
    }

    function drawStarItem(ctx: CanvasRenderingContext2D, s: StarItem) {
      const lr = s.life / 40;
      const a = (lr < 0.3 ? lr / 0.3 : 1 - lr) * 0.95;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(s.x, s.y); ctx.rotate(s.rot + s.life * 0.12);
      ctx.fillStyle = "#FFE800";
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const a1 = (p * 2 * Math.PI / 5) - Math.PI / 2;
        const a2 = ((p + 0.5) * 2 * Math.PI / 5) - Math.PI / 2;
        if (p === 0) ctx.moveTo(Math.cos(a1) * 7, Math.sin(a1) * 7);
        else ctx.lineTo(Math.cos(a1) * 7, Math.sin(a1) * 7);
        ctx.lineTo(Math.cos(a2) * 3, Math.sin(a2) * 3);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawScoreBoard(ctx: CanvasRenderingContext2D, _cw: number, ch: number) {
      if (coinsTotal === 0) return;
      ctx.save();
      ctx.font = "bold 11px monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(8, ch - 56, 88, 18);
      ctx.fillStyle = "#F8C800"; ctx.fillText(`✦ COIN ×${coinsTotal}`, 12, ch - 53);
      ctx.restore();
    }

    function drawItem(ctx: CanvasRenderingContext2D, it: Item) {
      ctx.save(); ctx.globalAlpha = it.alpha; ctx.translate(it.x, it.y);
      if (it.type === "coin") {
        const s = 13, sx = Math.abs(Math.cos(it.f * 0.25));
        ctx.scale(sx, 1);
        ctx.fillStyle = "#F8C800"; ctx.fillRect(-s/2, -s/2, s, s);
        ctx.fillStyle = "#C89000"; ctx.fillRect(-s/2, -s/2, s, 2); ctx.fillRect(-s/2, s/2-2, s, 2);
        ctx.fillStyle = "#FFEC60"; ctx.fillRect(-s/2+3, -s/2+3, 4, s-6);
      } else if (it.type === "mushroom") {
        ctx.fillStyle = "#CC2000"; ctx.beginPath(); ctx.arc(0, -5, 10, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#FCFCFC"; ctx.fillRect(-8, -8, 3, 3); ctx.fillRect(5, -7, 3, 3);
        ctx.fillStyle = "#F0D0A0"; ctx.fillRect(-5, -2, 10, 9);
        ctx.fillStyle = "#A06030"; ctx.fillRect(-4, 1, 8, 6);
      } else {
        const r1 = 10, r2 = 4;
        ctx.fillStyle = "#FFE800";
        ctx.beginPath();
        for (let p = 0; p < 5; p++) {
          const a1 = (p * 2 * Math.PI / 5) - Math.PI / 2;
          const a2 = ((p + 0.5) * 2 * Math.PI / 5) - Math.PI / 2;
          if (p === 0) ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
          else ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
          ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function drawGoomba(ctx: CanvasRenderingContext2D, g: Goomba) {
      const foot = Math.sin(g.f * 0.18) > 0 ? 2 : -2;
      ctx.save(); ctx.translate(g.x, g.y);
      if (g.dead) {
        const fade = Math.max(0, 1 - Math.max(0, g.y - (ctx.canvas.height - 20)) / 60);
        ctx.globalAlpha = fade;
        // Flipped upside down, popping up then falling
        ctx.rotate(Math.PI);
        ctx.fillStyle = "#8B4513"; ctx.fillRect(-10, -16, 20, 16);
        ctx.fillStyle = "#2A0A00"; ctx.fillRect(-8, -20, 6, 3); ctx.fillRect(2, -20, 6, 3);
        ctx.fillStyle = "#FCFCFC"; ctx.fillRect(-7, -15, 5, 4); ctx.fillRect(2, -15, 5, 4);
        ctx.fillStyle = "#1A1A1A"; ctx.fillRect(-5, -14, 3, 3); ctx.fillRect(4, -14, 3, 3);
        ctx.fillStyle = "#5A2D00"; ctx.fillRect(-10, 0, 8, 4); ctx.fillRect(2, 0, 8, 4);
      } else {
        ctx.fillStyle = "#8B4513"; ctx.fillRect(-10, -16, 20, 16);
        ctx.fillStyle = "#2A0A00"; ctx.fillRect(-8, -20, 6, 3); ctx.fillRect(2, -20, 6, 3);
        ctx.fillStyle = "#FCFCFC"; ctx.fillRect(-7, -15, 5, 4); ctx.fillRect(2, -15, 5, 4);
        ctx.fillStyle = "#1A1A1A"; ctx.fillRect(-5, -14, 3, 3); ctx.fillRect(4, -14, 3, 3);
        ctx.fillStyle = "#5A2D00";
        ctx.fillRect(-10 + foot, 0, 8, 4); ctx.fillRect(2 - foot, 0, 8, 4);
      }
      ctx.restore();
    }

    function drawPipe(ctx: CanvasRenderingContext2D, px: number, ch: number) {
      const H = 72, W = 32, py = ch - H;
      ctx.fillStyle = "#3ABB3A"; ctx.fillRect(px - W/2, py, W, H);
      ctx.fillStyle = "#289028"; ctx.fillRect(px - W/2, py, 4, H);
      ctx.fillStyle = "#50D050"; ctx.fillRect(px - W/2 + 7, py + 5, 4, H - 10);
      ctx.fillStyle = "#3ABB3A"; ctx.fillRect(px - W/2 - 4, py - 11, W + 8, 12);
      ctx.fillStyle = "#289028"; ctx.fillRect(px - W/2 - 4, py - 11, 5, 12);
      ctx.fillStyle = "#50D050"; ctx.fillRect(px - W/2 + 5, py - 8, 4, 8);
    }

    function drawGround(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      const gy = ch - 12, bw = 22, bh = 10;
      for (let bx = 0; bx < cw; bx += bw) {
        ctx.fillStyle = "#AF4000"; ctx.fillRect(bx, gy, bw - 1, bh);
        ctx.fillStyle = "#8B3000"; ctx.fillRect(bx, gy, bw - 1, 1);
        ctx.fillStyle = "#C85010"; ctx.fillRect(bx + 2, gy + 2, 3, 4);
      }
    }

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      const cw = canvas.width, ch = canvas.height;

      if (frame % 420 === 0 && clouds.filter(c => c.layer === 0).length < 4) clouds.push({ x: -120, y: 18 + Math.random() * 45, vx: 0.18 + Math.random() * 0.18, w: 70 + Math.random() * 70, h: 24 + Math.random() * 14, alpha: 0.28 + Math.random() * 0.15, layer: 0 });
      if (frame % 260 === 0 && clouds.filter(c => c.layer === 1).length < 6) clouds.push({ x: -80, y: 8 + Math.random() * 28, vx: 0.38 + Math.random() * 0.28, w: 36 + Math.random() * 40, h: 12 + Math.random() * 10, alpha: 0.14 + Math.random() * 0.1, layer: 1 });
      if (frame % 320 === 0) spawnGoomba();

      // Layer 1 clouds (far, slower)
      for (let i = clouds.length - 1; i >= 0; i--) { const c = clouds[i]; c.x += c.vx; drawCloud(ctx, c); if (c.x > cw + 200) clouds.splice(i, 1); }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.y += it.vy; it.vy += it.ay; it.f++;
        it.alpha = Math.min(it.alpha + 0.08, 0.92);
        drawItem(ctx, it);
        if (it.y > ch + 20) items.splice(i, 1);
      }

      for (let i = goombas.length - 1; i >= 0; i--) {
        const g = goombas[i];
        if (g.dead) {
          g.y += g.vy; g.vy += 0.3; g.dt++;
          drawGoomba(ctx, g);
          if (g.y > ch + 50) goombas.splice(i, 1);
        } else {
          g.x += g.vx; g.f++; drawGoomba(ctx, g);
          if (g.x < -30) goombas.splice(i, 1);
        }
      }
      (window as unknown as Record<string, unknown>).__ft_goombas = goombas.filter(g => !g.dead).map(g => ({ x: g.x, topY: g.y - 16 }));

      // Coin trail behind bot
      const botX = ((window as unknown as Record<string, unknown>).__ft_bot as { x: number } | undefined)?.x ?? -1;
      if (botX > 0 && lastBotX > 0 && Math.abs(botX - lastBotX) > 4) {
        if (frame % 4 === 0) trail.push({ x: lastBotX + (Math.random() - 0.5) * 10, y: ch - 55 + (Math.random() - 0.5) * 12, alpha: 0.7 });
      }
      if (botX > 0) lastBotX = botX;
      for (let i = trail.length - 1; i >= 0; i--) {
        const t = trail[i]; t.alpha -= 0.03;
        ctx.save(); ctx.globalAlpha = t.alpha;
        ctx.fillStyle = "#F8C800"; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (t.alpha <= 0) trail.splice(i, 1);
      }

      // Star particles
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.05; s.rot += 0.1; s.life++;
        s.alpha = Math.min(s.alpha + 0.15, 1);
        drawStarItem(ctx, s);
        if (s.life >= 40) stars.splice(i, 1);
      }

      drawScoreBoard(ctx, cw, ch);

      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("ft-bot-land", onBotLand);
      delete (window as unknown as Record<string, unknown>).__ft_goombas;
    };
  }, []);

  return (
    <div style={INTENSITY_STYLE}>
      <style>{MARIO_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

// ── Gilded — drifting gold dust, crown sparkles, shimmer wave, coin burst on land.
function GildedEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    interface Coin    { x: number; y: number; vy: number; vx: number; size: number; alpha: number; shimmer: number; ss: number; burst: boolean; }
    interface Sparkle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; rot: number; }
    interface Wave    { x: number; alpha: number; }
    interface Flare   { x: number; y: number; life: number; maxLife: number; size: number; }
    interface Crown   { x: number; y: number; vx: number; vy: number; alpha: number; life: number; rot: number; }

    const coins:    Coin[]    = [];
    const sparkles: Sparkle[] = [];
    const waves:    Wave[]    = [];
    const flares:   Flare[]   = [];
    const crowns:   Crown[]   = [];
    let rafId = 0, frame = 0;
    let stormTimer = 0;

    function resize() { if (!canvas) return; canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener("resize", resize);

    function spawnCoin(x?: number, y?: number, burst = false) {
      if (!canvas) return;
      coins.push({ x: x ?? Math.random()*canvas.width, y: y ?? canvas.height+10, vy: burst ? -(2.5+Math.random()*3) : -(0.4+Math.random()*0.65), vx: burst ? (Math.random()-0.5)*3 : (Math.random()-0.5)*0.45, size: burst ? 6+Math.random()*5 : 5+Math.random()*7, alpha: 0, shimmer: Math.random()*Math.PI*2, ss: 0.04+Math.random()*0.06, burst });
    }

    function spawnSparkle(x: number, y: number) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        sparkles.push({ x, y, vx: Math.cos(a)*(0.8+Math.random()*1.2), vy: Math.sin(a)*(0.8+Math.random()*1.2)-1, life: 0, maxLife: 40+Math.random()*30, size: 2+Math.random()*3, rot: Math.random()*Math.PI });
      }
    }

    function onBotLand(e: Event) {
      if (!canvas) return;
      const bx = ((e as CustomEvent).detail as { x: number }).x;
      for (let i = 0; i < 14; i++) spawnCoin(bx + (Math.random()-0.5)*80, canvas.height - 55, true);
      spawnSparkle(bx, canvas.height - 80);
      spawnSparkle(bx - 30, canvas.height - 65);
      spawnSparkle(bx + 30, canvas.height - 65);
      waves.push({ x: 0, alpha: 0.12 });
      stormTimer = 180;
    }
    window.addEventListener("ft-bot-land", onBotLand);

    function drawCoin(ctx: CanvasRenderingContext2D, c: Coin) {
      const shine = 0.5 + 0.5 * Math.sin(c.shimmer);
      ctx.save(); ctx.globalAlpha = c.alpha;
      if (c.burst) {
        // Burst coins: bright spinning gold discs
        const flipX = Math.abs(Math.cos(c.shimmer * 0.4));
        const r = Math.round(248 + shine * 7), g = Math.round(200 + shine * 15), b = 0;
        ctx.scale(flipX, 1);
        const cx = c.x / flipX;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath(); ctx.arc(cx, c.y, c.size / 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,240,100,0.6)"; ctx.lineWidth = 1;
        ctx.stroke();
        // inner highlight
        ctx.fillStyle = `rgba(255,240,120,${shine * 0.5})`;
        ctx.beginPath(); ctx.arc(cx - c.size * 0.12, c.y - c.size * 0.12, c.size * 0.18, 0, Math.PI * 2); ctx.fill();
      } else {
        // Ambient rising coins: subtle gold orbs with gentle glow
        const grd = ctx.createRadialGradient(c.x - c.size*0.15, c.y - c.size*0.15, 0, c.x, c.y, c.size * 0.7);
        grd.addColorStop(0, `rgba(255,230,80,${0.6 + shine * 0.3})`);
        grd.addColorStop(0.5, `rgba(212,160,10,${0.4 + shine * 0.2})`);
        grd.addColorStop(1, `rgba(140,90,0,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.size * 0.7, 0, Math.PI * 2); ctx.fill();
        // soft outer ring
        ctx.strokeStyle = `rgba(255,200,50,${0.2 + shine * 0.15})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(c.x, c.y, c.size * 0.7, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    function drawSparkle(ctx: CanvasRenderingContext2D, s: Sparkle) {
      const lr = s.life / s.maxLife;
      const a = (lr < 0.3 ? lr/0.3 : (1-lr)) * 0.9;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(s.x, s.y); ctx.rotate(s.rot + lr * Math.PI);
      ctx.strokeStyle = "#F8C800"; ctx.lineWidth = s.size * 0.4;
      for (let p = 0; p < 4; p++) {
        const pa = (p * Math.PI) / 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(pa)*s.size, Math.sin(pa)*s.size); ctx.stroke();
      }
      ctx.restore();
    }

    function drawWave(ctx: CanvasRenderingContext2D, w: Wave, cw: number, ch: number) {
      ctx.save(); ctx.globalAlpha = w.alpha;
      const grd = ctx.createLinearGradient(w.x - 100, 0, w.x + 100, 0);
      grd.addColorStop(0, "rgba(248,200,0,0)"); grd.addColorStop(0.5, "rgba(255,215,50,0.6)"); grd.addColorStop(1, "rgba(248,200,0,0)");
      ctx.fillStyle = grd; ctx.fillRect(w.x - 100, 0, 200, ch);
      ctx.restore();
    }

    function drawFiligree(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      const p = 0.10 + 0.04 * Math.sin(frame * 0.018);
      ctx.save(); ctx.globalAlpha = p; ctx.strokeStyle = "#D4A010"; ctx.lineWidth = 1;
      // top-left corner
      ctx.beginPath();
      ctx.moveTo(0, 60); ctx.bezierCurveTo(20, 50, 40, 30, 60, 0);
      ctx.moveTo(0, 90); ctx.bezierCurveTo(28, 75, 58, 50, 82, 0);
      ctx.moveTo(30, 0); ctx.bezierCurveTo(20, 30, 8, 55, 0, 70);
      ctx.stroke();
      // top-right corner
      ctx.beginPath();
      ctx.moveTo(cw, 60); ctx.bezierCurveTo(cw-20, 50, cw-40, 30, cw-60, 0);
      ctx.moveTo(cw, 90); ctx.bezierCurveTo(cw-28, 75, cw-58, 50, cw-82, 0);
      ctx.moveTo(cw-30, 0); ctx.bezierCurveTo(cw-20, 30, cw-8, 55, cw, 70);
      ctx.stroke();
      ctx.restore();
    }

    function drawCrown(ctx: CanvasRenderingContext2D, c: Crown) {
      const lr = c.life / 300;
      const a = (lr < 0.15 ? lr/0.15 : lr > 0.85 ? (1-lr)/0.15 : 1) * 0.75;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = "#D4A010";
      ctx.font = "28px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(255,200,10,0.6)"; ctx.shadowBlur = 14;
      ctx.fillText("♛", 0, 0);
      ctx.restore();
    }

    function drawBotAura(ctx: CanvasRenderingContext2D, botX: number, ch: number) {
      const botY = ch - 72;
      const t = frame * 0.04;
      [{ r: 130, aBase: 0.06 }, { r: 90, aBase: 0.1 }, { r: 55, aBase: 0.16 }].forEach(({ r, aBase }, idx) => {
        const alpha = aBase + 0.04 * Math.sin(t + idx * 1.2);
        const grd = ctx.createRadialGradient(botX, botY, 0, botX, botY, r);
        grd.addColorStop(0, `rgba(248,200,0,${alpha})`); grd.addColorStop(1, "rgba(248,200,0,0)");
        ctx.save(); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(botX, botY, r, 0, Math.PI*2); ctx.fill(); ctx.restore();
      });
    }

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      const cw = canvas.width, ch = canvas.height;

      if (stormTimer > 0) { stormTimer--; if (frame % 6 === 0) spawnCoin(); }
      else if (frame % 28 === 0) spawnCoin();
      if (frame % 700 === 0) waves.push({ x: 0, alpha: 0.09 });
      if (frame % 38 === 0) flares.push({ x: Math.random()*cw, y: Math.random()*ch*0.85, life: 0, maxLife: 32, size: 3+Math.random()*4 });
      if (frame % 900 === 0) crowns.push({ x: -40, y: ch * (0.2 + Math.random() * 0.35), vx: 0.55 + Math.random() * 0.3, vy: Math.sin(frame * 0.01) * 0.2, alpha: 0, life: 0, rot: 0 });

      drawFiligree(ctx, cw, ch);

      // Bot aura — triple ring
      const botX = ((window as unknown as Record<string, unknown>).__ft_bot as { x: number } | undefined)?.x ?? -1;
      if (botX > 0) drawBotAura(ctx, botX, ch);

      // Coins
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i]; c.x += c.vx; c.y += c.vy; if (c.burst) c.vy += 0.09;
        c.alpha = Math.min(c.alpha + 0.022, c.burst ? 0.9 : 0.78); c.shimmer += c.ss;
        drawCoin(ctx, c);
        if (c.y < -20 || (c.burst && c.y > ch + 20)) coins.splice(i, 1);
      }

      // Sparkles
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.04; s.life++;
        drawSparkle(ctx, s);
        if (s.life >= s.maxLife) sparkles.splice(i, 1);
      }

      // Shimmer waves
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]; w.x += 1.2;
        drawWave(ctx, w, cw, ch);
        if (w.x > cw + 120) waves.splice(i, 1);
      }

      // Gold flares
      for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i]; f.life++;
        const lr = f.life / f.maxLife;
        const fa = (lr < 0.35 ? lr/0.35 : 1 - lr) * 0.9;
        ctx.save(); ctx.globalAlpha = fa; ctx.translate(f.x, f.y); ctx.rotate(lr * Math.PI * 0.5);
        ctx.strokeStyle = "#F8C800"; ctx.lineWidth = f.size * 0.45;
        ctx.shadowColor = "rgba(255,200,0,0.6)"; ctx.shadowBlur = 8;
        for (let p = 0; p < 4; p++) {
          const pa = (p * Math.PI) / 2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(pa)*f.size*2.2, Math.sin(pa)*f.size*2.2); ctx.stroke();
        }
        ctx.restore();
        if (f.life >= f.maxLife) flares.splice(i, 1);
      }

      // Flying crowns
      for (let i = crowns.length - 1; i >= 0; i--) {
        const c = crowns[i]; c.x += c.vx; c.y += Math.sin(c.life * 0.02) * 0.4; c.life++;
        drawCrown(ctx, c);
        if (c.x > cw + 60) crowns.splice(i, 1);
      }

      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("ft-bot-land", onBotLand);
    };
  }, []);

  return (
    <div style={INTENSITY_STYLE}>
      <style>{GILDED_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(40,20,0,0.4) 100%)" }} />
    </div>
  );
}

// ── Bloodline — blood moon, bats, blood rain, lightning storms, skulls, corner veins, embers, eyes.
function BloodlineEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    interface Drop  { x: number; y: number; vy: number; len: number; alpha: number; thick: boolean; }
    interface Bat   { x: number; y: number; vx: number; vy: number; wing: number; size: number; }
    interface Ember { x: number; y: number; vx: number; vy: number; size: number; alpha: number; life: number; maxLife: number; }
    interface Arc   { pts: {x:number;y:number}[]; alpha: number; life: number; }
    interface Skull { x: number; y: number; vy: number; alpha: number; life: number; maxLife: number; }
    interface Orb   { x: number; y: number; vx: number; vy: number; r: number; phase: number; }
    interface Wisp  { x: number; y: number; vy: number; w: number; alpha: number; phase: number; }
    interface Eye   { x: number; y: number; blink: number; alpha: number; phase: number; }

    const drops:  Drop[]  = [];
    const bats:   Bat[]   = [];
    const embers: Ember[] = [];
    const arcs:   Arc[]   = [];
    const skulls: Skull[] = [];
    const orbs:   Orb[]   = [];
    const wisps:  Wisp[]  = [];
    const eyes:   Eye[]   = [];
    let rafId = 0, frame = 0;
    let stormCooldown = 0;
    let flashAlpha = 0;
    let heartPhase = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      // Re-seed eyes in corners
      eyes.length = 0;
      const cw = canvas.width, ch = canvas.height;
      eyes.push({ x: 55, y: ch * 0.35, blink: 0, alpha: 0, phase: Math.random() * Math.PI * 2 });
      eyes.push({ x: cw - 55, y: ch * 0.38, blink: 0, alpha: 0, phase: Math.random() * Math.PI * 2 });
    }
    resize();
    window.addEventListener("resize", resize);

    // Dense blood rain — 110 drops
    for (let i = 0; i < 110; i++) drops.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vy: 2.0 + Math.random() * 3.2, len: 7 + Math.random() * 16, alpha: 0.07 + Math.random() * 0.24, thick: Math.random() < 0.15 });

    // 6 bats — varied sizes
    for (let i = 0; i < 6; i++) bats.push({ x: Math.random() * canvas.width, y: 70 + Math.random() * (canvas.height * 0.45), vx: (Math.random() - 0.5) * 1.1, vy: (Math.random() - 0.5) * 0.5, wing: Math.random() * Math.PI * 2, size: 0.7 + Math.random() * 0.8 });
    // Blood orbs
    for (let i = 0; i < 8; i++) orbs.push({ x: Math.random() * canvas.width, y: 80 + Math.random() * (canvas.height * 0.75), vx: (Math.random()-0.5)*0.25, vy: (Math.random()-0.5)*0.18, r: 8 + Math.random()*12, phase: Math.random()*Math.PI*2 });
    // Fog wisps
    for (let i = 0; i < 6; i++) wisps.push({ x: 80 + Math.random()*(canvas.width-160), y: canvas.height*(0.45 + Math.random()*0.45), vy: -(0.10+Math.random()*0.15), w: 100+Math.random()*150, alpha: 0.05+Math.random()*0.08, phase: Math.random()*Math.PI*2 });

    function spawnArc(count = 1) {
      if (!canvas) return;
      for (let n = 0; n < count; n++) {
        const x1 = Math.random() * canvas.width, y1 = Math.random() * canvas.height * 0.25;
        const x2 = x1 + (Math.random() - 0.5) * canvas.width * 0.6, y2 = canvas.height * (0.3 + Math.random() * 0.5);
        const pts: {x:number;y:number}[] = [];
        for (let s = 0; s <= 11; s++) { const t = s/11; pts.push({ x: x1+(x2-x1)*t + (s>0&&s<11?(Math.random()-0.5)*80:0), y: y1+(y2-y1)*t }); }
        arcs.push({ pts, alpha: 0.85, life: 0 });
      }
    }

    function triggerStorm() {
      if (stormCooldown > 0) return;
      spawnArc(4 + Math.floor(Math.random() * 3));
      flashAlpha = 0.22;
      stormCooldown = 420;
    }

    function spawnSkull() {
      if (!canvas) return;
      skulls.push({ x: 160 + Math.random() * (canvas.width - 320), y: canvas.height * 0.12 + Math.random() * (canvas.height * 0.38), vy: -0.22, alpha: 0, life: 0, maxLife: 160 + Math.random() * 80 });
    }

    function drawMoon(ctx: CanvasRenderingContext2D, cw: number) {
      const mx = cw * 0.78, my = 90;
      const pulse = 0.7 + 0.15 * Math.sin(heartPhase * 0.8);
      // outer corona layers
      [{ r: 140, a: 0.03 * pulse }, { r: 100, a: 0.06 * pulse }, { r: 72, a: 0.1 * pulse }].forEach(({ r, a }) => {
        const grd = ctx.createRadialGradient(mx, my, 0, mx, my, r);
        grd.addColorStop(0, `rgba(180,0,15,${a})`); grd.addColorStop(1, "rgba(80,0,0,0)");
        ctx.save(); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI*2); ctx.fill(); ctx.restore();
      });
      // moon disc
      const grd = ctx.createRadialGradient(mx - 8, my - 8, 0, mx, my, 42);
      grd.addColorStop(0, `rgba(200,10,10,${0.55 * pulse})`);
      grd.addColorStop(0.6, `rgba(140,0,0,${0.45 * pulse})`);
      grd.addColorStop(1, `rgba(80,0,0,${0.2 * pulse})`);
      ctx.save(); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(mx, my, 42, 0, Math.PI*2); ctx.fill(); ctx.restore();
    }

    function drawDrop(ctx: CanvasRenderingContext2D, d: Drop) {
      ctx.save(); ctx.globalAlpha = d.alpha;
      ctx.strokeStyle = d.thick ? "#AA0010" : "#8B0000"; ctx.lineWidth = d.thick ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - (d.thick ? 2 : 1), d.y + d.len); ctx.stroke();
      ctx.restore();
    }

    function drawBat(ctx: CanvasRenderingContext2D, b: Bat) {
      const ws = Math.sin(b.wing) * 22 * b.size;
      const span = 28 * b.size;
      ctx.save(); ctx.translate(b.x, b.y); ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#180006";
      ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(-8*b.size,-ws*0.5,-22*b.size,-ws,-span,-ws*0.3); ctx.bezierCurveTo(-22*b.size,3*b.size,-10*b.size,5*b.size,0,2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(8*b.size,-ws*0.5,22*b.size,-ws,span,-ws*0.3); ctx.bezierCurveTo(22*b.size,3*b.size,10*b.size,5*b.size,0,2); ctx.fill();
      ctx.fillStyle = "#300015"; ctx.beginPath(); ctx.ellipse(0,0,5*b.size,7*b.size,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = "#FF0020"; ctx.fillRect(-4*b.size,-3*b.size,2*b.size,2*b.size); ctx.fillRect(2*b.size,-3*b.size,2*b.size,2*b.size);
      ctx.restore();
    }

    function drawEyes(ctx: CanvasRenderingContext2D) {
      for (const e of eyes) {
        e.phase += 0.008;
        e.alpha = 0.3 + 0.5 * ((Math.sin(e.phase) + 1) / 2);
        e.blink = (e.blink + 1) % 280;
        const blinkFrac = e.blink < 12 ? Math.sin(e.blink / 12 * Math.PI) : 0;
        ctx.save(); ctx.globalAlpha = e.alpha;
        // glow
        const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 30);
        grd.addColorStop(0, "rgba(255,0,20,0.12)"); grd.addColorStop(1, "rgba(100,0,0,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(e.x, e.y, 30, 0, Math.PI*2); ctx.fill();
        // pupil
        const eyeH = 6 * (1 - blinkFrac);
        ctx.fillStyle = "#FF0020";
        ctx.shadowColor = "#FF0030"; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 7, eyeH, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#1A0004"; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 3.5, eyeH * 0.6, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    function drawBloodPool(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      const p = 0.18 + 0.06 * Math.sin(heartPhase * 1.1);
      ctx.save(); ctx.globalAlpha = p;
      const grd = ctx.createLinearGradient(0, ch - 30, 0, ch);
      grd.addColorStop(0, "rgba(100,0,0,0)"); grd.addColorStop(1, "rgba(140,0,0,0.8)");
      ctx.fillStyle = grd; ctx.fillRect(0, ch - 30, cw, 30);
      ctx.restore();
    }

    function drawArc(ctx: CanvasRenderingContext2D, a: Arc) {
      ctx.save(); ctx.globalAlpha = a.alpha;
      ctx.strokeStyle = "#AA0018"; ctx.lineWidth = 1.5;
      ctx.shadowColor = "#FF0040"; ctx.shadowBlur = 10;
      ctx.beginPath(); a.pts.forEach((p,i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)); ctx.stroke();
      ctx.strokeStyle = "#FF9090"; ctx.lineWidth = 0.4; ctx.shadowBlur = 0; ctx.stroke();
      ctx.restore();
    }

    function drawSkull(ctx: CanvasRenderingContext2D, s: Skull) {
      const lr = s.life / s.maxLife;
      const a = (lr < 0.2 ? lr/0.2 : lr > 0.8 ? (1-lr)/0.2 : 1) * 0.5;
      ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = a;
      ctx.fillStyle = "#3A0808"; ctx.beginPath(); ctx.arc(0,-4,12,0,Math.PI*2); ctx.fill(); ctx.fillRect(-10,-4,20,12);
      ctx.fillStyle = "#CC1020"; ctx.shadowColor="#FF0030"; ctx.shadowBlur=6;
      ctx.fillRect(-7,-8,5,5); ctx.fillRect(2,-8,5,5);
      ctx.fillStyle = "#1A0000"; ctx.shadowBlur=0;
      ctx.fillRect(-4,4,3,5); ctx.fillRect(0,4,3,5); ctx.fillRect(4,4,3,5);
      ctx.restore();
    }

    function drawVeins(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
      const p = 0.12 + 0.07 * Math.sin(frame * 0.016);
      ctx.save(); ctx.globalAlpha = p; ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.bezierCurveTo(50,30,90,80,70,150);
      ctx.moveTo(0,0); ctx.bezierCurveTo(25,55,65,85,44,165);
      ctx.moveTo(70,0); ctx.bezierCurveTo(85,45,55,95,82,165);
      ctx.moveTo(cw,0); ctx.bezierCurveTo(cw-50,30,cw-90,80,cw-70,150);
      ctx.moveTo(cw,0); ctx.bezierCurveTo(cw-25,55,cw-65,85,cw-44,165);
      ctx.stroke(); ctx.restore();
    }

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frame++;
      heartPhase += 0.045;
      if (stormCooldown > 0) stormCooldown--;
      const cw = canvas.width, ch = canvas.height;
      const botX = ((window as unknown as Record<string, unknown>).__ft_bot as { x: number } | undefined)?.x ?? cw / 2;

      if (frame % 18 === 0 && embers.length < 50) embers.push({ x: Math.random()*cw, y: ch+8, vx: (Math.random()-0.5)*0.8, vy: -(0.4+Math.random()*1.1), size: 1.5+Math.random()*3.5, alpha: 0, life: 0, maxLife: 100+Math.random()*90 });
      if (frame % 260 === 0) spawnArc(1);
      if (frame % 600 === 0) triggerStorm();
      if (frame % 280 === 0) spawnSkull();

      // Blood moon (behind everything)
      drawMoon(ctx, cw);

      drawVeins(ctx, cw, ch);

      // Fog wisps
      for (const w of wisps) {
        w.phase += 0.004; w.y += w.vy;
        w.x += Math.sin(w.phase * 0.6) * 0.28;
        if (w.y < canvas.height * 0.08) { w.y = canvas.height + 20; w.x = 80 + Math.random()*(cw-160); }
        const wgrd = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.w);
        wgrd.addColorStop(0, `rgba(18,0,3,${w.alpha})`); wgrd.addColorStop(1, "rgba(8,0,1,0)");
        ctx.save(); ctx.fillStyle = wgrd; ctx.beginPath(); ctx.ellipse(w.x, w.y, w.w, w.w*0.38, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
      }

      // Blood rain
      for (const d of drops) { d.y += d.vy; if (d.y > ch + d.len) { d.y = -d.len; d.x = Math.random()*cw; } drawDrop(ctx, d); }

      // Lightning arcs
      for (let i = arcs.length-1; i >= 0; i--) {
        const a = arcs[i]; a.life++;
        a.alpha = a.life < 4 ? a.life/4*0.85 : Math.max(0, 0.85-(a.life-4)/14);
        drawArc(ctx, a); if (a.alpha <= 0) arcs.splice(i, 1);
      }

      // Blood orbs
      for (const o of orbs) {
        o.phase += 0.007;
        o.x += o.vx + Math.sin(o.phase * 0.7) * 0.18;
        o.y += o.vy + Math.cos(o.phase) * 0.12;
        if (o.x < 50) o.vx += 0.08; if (o.x > cw-50) o.vx -= 0.08;
        if (o.y < 70) o.vy += 0.05; if (o.y > ch*0.88) o.vy -= 0.05;
        o.vx *= 0.993; o.vy *= 0.993;
        const pulse = (0.22 + 0.12 * Math.sin(o.phase * 2.1)) * (1 + 0.2 * Math.sin(heartPhase));
        const ogrd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 4);
        ogrd.addColorStop(0, `rgba(200,0,20,${pulse*0.9})`); ogrd.addColorStop(0.45, `rgba(120,0,10,${pulse*0.5})`); ogrd.addColorStop(1, "rgba(50,0,0,0)");
        ctx.save(); ctx.fillStyle = ogrd; ctx.beginPath(); ctx.arc(o.x, o.y, o.r*4, 0, Math.PI*2); ctx.fill(); ctx.restore();
      }

      // Bats — 6, attracted loosely to bot
      for (const b of bats) {
        b.wing += 0.15;
        const tx = botX > 0 ? botX + Math.sin(frame * 0.006 + b.y * 0.009) * 250 : cw / 2;
        b.vx += (tx - b.x) * 0.0003 + (Math.random()-0.5) * 0.08;
        b.vy += Math.sin(frame * 0.011 + b.x * 0.008) * 0.04 + (Math.random()-0.5) * 0.05;
        b.vx *= 0.968; b.vy *= 0.972;
        b.x += b.vx; b.y += b.vy;
        if (b.x < 50) b.vx += 0.6; if (b.x > cw-50) b.vx -= 0.6;
        if (b.y < 55) b.vy += 0.4; if (b.y > ch*0.70) b.vy -= 0.4;
        drawBat(ctx, b);
      }

      // Skulls
      for (let i = skulls.length-1; i >= 0; i--) { const s = skulls[i]; s.life++; s.y += s.vy; drawSkull(ctx, s); if (s.life >= s.maxLife) skulls.splice(i, 1); }

      // Embers
      for (let i = embers.length-1; i >= 0; i--) {
        const e = embers[i]; e.x += e.vx + Math.sin(e.life*0.05)*0.35; e.y += e.vy; e.life++;
        const lr = e.life/e.maxLife; e.alpha = lr < 0.15 ? (lr/0.15)*0.65 : (1-lr)*0.65;
        const grd = ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*2.2);
        grd.addColorStop(0,`rgba(255,80,20,${e.alpha*0.95})`); grd.addColorStop(0.4,`rgba(190,10,10,${e.alpha*0.55})`); grd.addColorStop(1,"rgba(80,0,0,0)");
        ctx.save(); ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(e.x,e.y,e.size*2.2,0,Math.PI*2); ctx.fill(); ctx.restore();
        if (e.life >= e.maxLife || e.y < -20) embers.splice(i, 1);
      }

      // Eyes in corners
      drawEyes(ctx);

      // Blood pool at bottom
      drawBloodPool(ctx, cw, ch);

      // Lightning flash overlay
      if (flashAlpha > 0) {
        ctx.save(); ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = "rgba(120,0,0,1)"; ctx.fillRect(0, 0, cw, ch);
        ctx.restore();
        flashAlpha = Math.max(0, flashAlpha - 0.018);
      }

      rafId = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div style={INTENSITY_STYLE}>
      <style>{BLOODLINE_CSS}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      {/* Red film tint — very subtle blood atmosphere */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(40,0,0,0.06)" }} />
      {/* Bottom upwelling glow */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, rgba(100,0,0,0.38) 0%, transparent 55%)", animation: "bloodline-pulse 1.4s ease-in-out infinite" }} />
      {/* Corner vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(30,0,0,0.28) 100%)" }} />
    </div>
  );
}

// ── ThemeEffects ───────────────────────────────────────────────────────────────

export function ThemeEffects() {
  const [enabled] = useState(() => {
    try { return localStorage.getItem("nr-theme-effects-enabled") !== "false"; } catch { return true; }
  });
  const [theme, setTheme] = useState<ActiveTheme>(getCurrentTheme);

  useEffect(() => {
    setTheme(getCurrentTheme());
    const observer = new MutationObserver(() => setTheme(getCurrentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const intensity = parseInt(localStorage.getItem("nr-animation-intensity") ?? "50", 10);
    document.documentElement.style.setProperty("--nr-anim-intensity", String(intensity / 100));
  }, []);

  if (!enabled) return null;

  const perThemeEnabled = (() => {
    try { return localStorage.getItem(`nr-theme-effects-${theme}`) !== "false"; } catch { return true; }
  })();
  if (!perThemeEnabled) return null;
  if (theme === "void")        return <VoidEffect />;
  if (theme === "phosphor")    return <PhosphorEffect />;
  if (theme === "arctic")      return <ArcticEffect />;
  if (theme === "amber")       return <AmberEffect />;
  if (theme === "midnight")    return <MidnightEffect />;
  if (theme === "matrix")      return <MatrixRain />;
  if (theme === "synthwave")   return <SynthwaveEffect />;
  if (theme === "deep-space")  return <DeepSpaceEffect />;
  if (theme === "mario")       return <MarioEffect />;
  if (theme === "gilded")      return <GildedEffect />;
  if (theme === "bloodline")   return <BloodlineEffect />;
  return null;
}
