import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  onOpen: () => void;
  summoned: boolean;
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function safeZone() {
  const sidebarW = window.innerWidth > 900 ? 320 : 0;
  const m = 70;
  return {
    xMin: sidebarW + m,
    xMax: Math.max(window.innerWidth - m - 40, sidebarW + m + 120),
    yMin: 70,
    yMax: Math.max(window.innerHeight - m - 56, 150),
  };
}

type Phase = "idle" | "walking" | "jumping";

export function AiWanderer({ onOpen, summoned }: Props) {
  const [x, setX] = useState(() => window.innerWidth + 60);
  const [y, setY] = useState(() => rand(200, window.innerHeight - 200));
  const [animated, setAnimated] = useState(false);
  const [durMs, setDurMs] = useState(0);
  const [phase, setPhase] = useState<Phase>("walking");
  const [facingLeft, setFacingLeft] = useState(true);
  const [blinking, setBlinking] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const xRef = useRef(x);
  const yRef = useRef(y);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blinkTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const arrivedRef = useRef(false);

  function moveTo(tx: number, ty: number, instant = false) {
    const dx = tx - xRef.current;
    const dy = ty - yRef.current;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    const ms = instant ? 600 : Math.min(Math.max((dist / 90) * 1000, 500), 5000);
    setFacingLeft(dx < 0);
    setDurMs(ms);
    setPhase("walking");
    setAnimated(true);
    arrivedRef.current = false;
    xRef.current = tx;
    yRef.current = ty;
    setX(tx);
    setY(ty);
  }

  function startIdle() {
    setPhase("idle");
    arrivedRef.current = true;

    clearInterval(blinkTimer.current);
    blinkTimer.current = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 130);
    }, rand(2500, 6000));

    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      clearInterval(blinkTimer.current);
      if (Math.random() < 0.18) {
        setPhase("jumping");
        setTimeout(() => startIdle(), 750);
        return;
      }
      const z = safeZone();
      moveTo(rand(z.xMin, z.xMax), rand(z.yMin, z.yMax));
    }, rand(2800, 8000));
  }

  const handleArrival = useCallback(() => {
    if (arrivedRef.current) return;
    setAnimated(false);
    startIdle();
  }, []);

  // Initial entry from right edge
  useEffect(() => {
    const startX = window.innerWidth + 60;
    const startY = rand(150, window.innerHeight - 200);
    xRef.current = startX;
    yRef.current = startY;
    setX(startX);
    setY(startY);
    setAnimated(false);

    const t = setTimeout(() => {
      const z = safeZone();
      moveTo(rand(z.xMin, z.xMax), rand(z.yMin, z.yMax));
    }, 150);

    return () => {
      clearTimeout(t);
      clearTimeout(idleTimer.current);
      clearInterval(blinkTimer.current);
    };
  }, []);

  // Summon to center
  useEffect(() => {
    if (!summoned) return;
    clearTimeout(idleTimer.current);
    clearInterval(blinkTimer.current);
    const cx = window.innerWidth / 2 - 18;
    const cy = window.innerHeight / 2 - 26;
    moveTo(cx, cy, true);
    setShowHint(true);
    setTimeout(() => setShowHint(false), 3000);
  }, [summoned]);

  const isWalking = phase === "walking";
  const isJumping = phase === "jumping";
  const isIdle = phase === "idle";

  return (
    <>
      <style>{`
        @keyframes wand-bob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes wand-jump {
          0% { transform: translateY(0) scaleX(1) scaleY(1); }
          20% { transform: translateY(-22px) scaleX(0.9) scaleY(1.1); }
          45% { transform: translateY(-28px) scaleX(1) scaleY(1); }
          70% { transform: translateY(-3px) scaleX(1.05) scaleY(0.95); }
          85% { transform: translateY(3px) scaleX(0.98) scaleY(1.02); }
          100% { transform: translateY(0) scaleX(1) scaleY(1); }
        }
        @keyframes wand-step {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes leg-a {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-22deg); }
        }
        @keyframes leg-b {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(22deg); }
        }
        @keyframes hint-fade {
          0% { opacity: 0; transform: translateY(4px); }
          20%, 80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>

      {/* Position layer */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          transform: `translate(${x}px, ${y}px)`,
          transition: animated ? `transform ${durMs}ms linear` : "none",
          zIndex: 9990,
          pointerEvents: "none",
        }}
        onTransitionEnd={handleArrival}
      >
        {/* Flip layer */}
        <div style={{ transform: facingLeft ? "scaleX(-1)" : "scaleX(1)", pointerEvents: "auto" }}>
          {/* Animation layer */}
          <div
            style={{
              animation: isJumping
                ? "wand-jump 0.75s cubic-bezier(0.36,0.07,0.19,0.97)"
                : isWalking
                ? "wand-step 0.38s ease-in-out infinite"
                : "wand-bob 2.4s ease-in-out infinite",
              cursor: "pointer",
              position: "relative",
            }}
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            title="Click to chat · G to summon"
          >
            <svg width="36" height="52" viewBox="0 0 36 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Antenna */}
              <line x1="18" y1="2" x2="18" y2="11" stroke="var(--ft-accent)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="18" cy="2" r="2.5" fill="var(--ft-accent)" opacity="0.9"/>
              <circle cx="18" cy="2" r="1.2" fill="white" opacity="0.6"/>

              {/* Head / monitor face */}
              <rect x="4" y="10" width="28" height="20" rx="4" fill="var(--ft-surface)" stroke="var(--ft-accent)" strokeWidth="1.5"/>
              {/* Screen inner */}
              <rect x="6" y="12" width="24" height="16" rx="2.5" fill="var(--ft-raised)" opacity="0.9"/>

              {/* Left eye */}
              {blinking ? (
                <rect x="10" y="19.5" width="6" height="1.5" rx="0.75" fill="var(--ft-accent)"/>
              ) : (
                <>
                  <circle cx="13" cy="20" r="3" fill="var(--ft-accent)"/>
                  <circle cx="14.2" cy="18.8" r="1.1" fill="white" opacity="0.5"/>
                </>
              )}

              {/* Right eye */}
              {blinking ? (
                <rect x="20" y="19.5" width="6" height="1.5" rx="0.75" fill="var(--ft-accent)"/>
              ) : (
                <>
                  <circle cx="23" cy="20" r="3" fill="var(--ft-accent)"/>
                  <circle cx="24.2" cy="18.8" r="1.1" fill="white" opacity="0.5"/>
                </>
              )}

              {/* Neck */}
              <rect x="16" y="30" width="4" height="3" rx="1" fill="var(--ft-border2)"/>

              {/* Body */}
              <rect x="9" y="33" width="18" height="11" rx="2.5" fill="var(--ft-raised)" stroke="var(--ft-border2)" strokeWidth="1"/>
              {/* Tiny chart */}
              <polyline points="11,43 13.5,39 17,41 21,35.5 25,38" stroke="var(--ft-accent)" strokeWidth="1.3" fill="none" strokeLinejoin="round" strokeLinecap="round" opacity="0.9"/>

              {/* Left leg */}
              <rect
                x="11" y="44" width="6" height="8" rx="2"
                fill="var(--ft-raised)" stroke="var(--ft-border2)" strokeWidth="1"
                style={{ transformOrigin: "14px 44px", animation: isWalking ? "leg-a 0.38s ease-in-out infinite" : undefined }}
              />
              {/* Right leg */}
              <rect
                x="19" y="44" width="6" height="8" rx="2"
                fill="var(--ft-raised)" stroke="var(--ft-border2)" strokeWidth="1"
                style={{ transformOrigin: "22px 44px", animation: isWalking ? "leg-b 0.38s ease-in-out infinite" : undefined }}
              />
            </svg>

            {/* Summon hint bubble */}
            {showHint && (
              <div style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--ft-surface)",
                border: "1px solid var(--ft-accent)",
                color: "var(--ft-accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.06em",
                padding: "3px 7px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                animation: "hint-fade 3s ease forwards",
              }}>
                Click to chat!
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
