import { useEffect, useRef } from "react";

const KATAKANA =
  "ァアィイゥウェエォオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const DIGITS = "0123456789";
const ROMAN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARS = KATAKANA + DIGITS + ROMAN;

const FONT_SIZE = 14;

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;

    function getColumns(): number {
      return Math.floor(canvas!.width / FONT_SIZE);
    }

    function resizeCanvas() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    resizeCanvas();

    let cols = getColumns();
    let drops: number[] = Array.from({ length: cols }, () => Math.random() * -60);

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      const newCols = getColumns();
      if (newCols !== cols) {
        const newDrops = Array.from({ length: newCols }, (_, i) =>
          i < drops.length ? drops[i] : Math.random() * -60
        );
        drops = newDrops;
        cols = newCols;
      }
    });

    resizeObserver.observe(document.documentElement);

    function draw() {
      if (!ctx || !canvas) return;

      // Fade trail — 0.2 alpha creates medium-length trails (more visible = longer trail)
      ctx.fillStyle = "rgba(0, 3, 0, 0.22)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const dropY = drops[i];
        const x = i * FONT_SIZE;

        // Lead character — slightly bright but not blinding
        const leadY = Math.floor(dropY) * FONT_SIZE;
        ctx.fillStyle = "rgba(180, 255, 200, 0.5)";
        ctx.fillText(randomChar(), x, leadY);

        // Trailing char just behind lead
        const trailY = (Math.floor(dropY) - 1) * FONT_SIZE;
        const trailOpacity = 0.12 + Math.random() * 0.1;
        ctx.fillStyle = `rgba(0, 255, 65, ${trailOpacity})`;
        ctx.fillText(randomChar(), x, trailY);

        // Faint atmosphere character further up
        if (Math.random() > 0.88) {
          const extraY = (Math.floor(dropY) - 2 - Math.floor(Math.random() * 5)) * FONT_SIZE;
          ctx.fillStyle = `rgba(0, 204, 51, 0.06)`;
          ctx.fillText(randomChar(), x, extraY);
        }

        // Main column character — dim watermark level
        ctx.fillStyle = "rgba(0, 255, 65, 0.08)";
        ctx.fillText(randomChar(), x, dropY * FONT_SIZE);

        // Advance drop — occasional faster columns for variety
        const speed = Math.random() > 0.88 ? 1.4 : 1;
        drops[i] += speed;

        // Reset when off-screen with random stagger for organic feel
        if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.972) {
          drops[i] = Math.random() * -30;
        }
      }

      animFrameId = requestAnimationFrame(draw);
    }

    animFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.15,
      }}
    />
  );
}
