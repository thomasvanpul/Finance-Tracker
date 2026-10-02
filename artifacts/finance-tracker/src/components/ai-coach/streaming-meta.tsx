// Shared streaming-state visuals for AI Coach — used inside both the
// floating panel (components/ai-agent.tsx) and the dedicated page
// (pages/ai-coach.tsx). One visual vocabulary, both entry points.
//
// The ai-chat-client emits seven event types: progress, attempt,
// fallthrough, token, cut, done, error. Every one is rendered here
// as a real state — not a spinner, not fake "Thinking…" text. The
// content of the strip is what the server is actually doing.
//
// Constitution:
//   - hairline structure (border-top on strips), no shadows
//   - DESIGN.md §10: the legends and provider names are MonoLabel; the
//     words around them, the sentences and the user's queued text are sans
//   - semantic color only: amber = degraded/reduced, red = error
//   - no animation on state changes (150ms cap holds)
//   - status label always uppercase mono, glyph on the left

import type { ReactNode } from "react";
import { MonoLabel } from "@/components/primitives";
import { HStack, VStack } from "@/components/primitives";
import { AlertTriangle } from "lucide-react";

// Language runs inside a strip. Same size, case and tracking as the
// MonoLabel they sit beside, in sans (DESIGN.md §10).
function Words({ size, color, letterSpacing = "0.08em", children }: {
  size: number;
  color: string;
  letterSpacing?: string;
  children: ReactNode;
}) {
  return (
    <span style={{ fontFamily: "var(--font-sans)", fontSize: size, color, letterSpacing, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

// Prefix glyph — same shape everywhere for scannability. A
// caret-forward mark reads "in progress" without needing motion.
const PREFIX_GLYPH = "▸";

// ── Progress caption (server-driven, real pipeline stage) ─────────────────
// Rendered before any tokens arrive. When tokens start, the caller
// blanks the caption — content becomes the progress signal.
export function StreamingProgress({ caption }: { caption: string }) {
  return (
    <HStack gap={6} align="baseline">
      <span
        aria-hidden
        style={{
          color: "var(--ft-accent)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          lineHeight: 1,
        }}
      >
        {PREFIX_GLYPH}
      </span>
      <Words size={10} color="var(--ft-dim)" letterSpacing="0.04em">
        {caption}
      </Words>
    </HStack>
  );
}

// ── Chain attempt (which provider we're asking) ───────────────────────────
export function StreamingChainAttempt({ provider }: { provider: string }) {
  return (
    <HStack gap={6} align="baseline">
      <span aria-hidden style={{ color: "var(--ft-accent)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{PREFIX_GLYPH}</span>
      <Words size={10} color="var(--ft-dim)">Asking</Words>
      <MonoLabel size={10} color="var(--ft-accent)" letterSpacing="0.1em">{provider.toUpperCase()}</MonoLabel>
    </HStack>
  );
}

// ── Chain fallthrough (primary failed, moving to next lane) ───────────────
export function StreamingChainFallthrough({ from, to }: { from: string; to: string }) {
  return (
    <HStack gap={6} align="baseline">
      <AlertTriangle aria-hidden size={10} style={{ color: "var(--ft-amber)", flexShrink: 0 }} />
      <MonoLabel size={10} color="var(--ft-amber)" letterSpacing="0.1em">{from.toUpperCase()}</MonoLabel>
      <Words size={10} color="var(--ft-dim)">failed → trying</Words>
      <MonoLabel size={10} color="var(--ft-accent)" letterSpacing="0.1em">{to.toUpperCase()}</MonoLabel>
    </HStack>
  );
}

// ── Reduced-capacity footer (chain fell through, but served) ──────────────
// Rendered inside the model bubble on `done` events where a non-
// primary provider served the response. Small amber strip below the
// content, hairline-separated. Never obscures the answer.
export function StreamingReducedCapacity({ provider }: { provider: string }) {
  return (
    <div style={{
      marginTop: 8,
      paddingTop: 6,
      borderTop: "1px solid var(--ft-border)",
    }}>
      <HStack gap={6} align="baseline">
        <MonoLabel size={9} color="var(--ft-amber)" letterSpacing="0.1em">REDUCED CAPACITY</MonoLabel>
        <Words size={9} color="var(--ft-dim)">· served by</Words>
        <MonoLabel size={9} color="var(--ft-dim)">{provider.toUpperCase()}</MonoLabel>
      </HStack>
    </div>
  );
}

// ── Cut (stream started, provider died mid-way) ───────────────────────────
// Distinct from error: the partial text ABOVE is real content the
// model actually produced; it stopped because the provider dropped
// the connection. Retry the question and the chain moves on cleanly.
export function StreamingCut({ provider, reason }: { provider: string; reason: string }) {
  // reason kept for debug hover (screen readers get the useful summary
  // via title attribute); users see the plain-language line only.
  return (
    <div style={{
      marginTop: 8,
      paddingTop: 6,
      borderTop: "1px solid var(--ft-border)",
    }} title={`Provider ${provider}: ${reason}`}>
      <VStack gap={2}>
        <HStack gap={6} align="baseline">
          <MonoLabel size={9} color="var(--ft-amber)" letterSpacing="0.1em">RESPONSE ENDED EARLY</MonoLabel>
          <Words size={9} color="var(--ft-dim)">·</Words>
          <MonoLabel size={9} color="var(--ft-dim)">{provider.toUpperCase()}</MonoLabel>
          <Words size={9} color="var(--ft-dim)">disconnected mid-reply</Words>
        </HStack>
        <Words size={9} color="var(--ft-dim)">Ask again to retry — the partial reply above is what did stream</Words>
      </VStack>
    </div>
  );
}

// ── Error (chain exhausted or client failure) ─────────────────────────────
// Red, honest, actionable. Never generic "something went wrong".
export function StreamingError({ message }: { message: string }) {
  return (
    <HStack gap={6} align="baseline">
      <span aria-hidden style={{ color: "var(--ft-red)", fontFamily: "var(--font-mono)", fontSize: 10 }}>✕</span>
      <MonoLabel size={10} color="var(--ft-red)" letterSpacing="0.1em">ERROR</MonoLabel>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--ft-red)", lineHeight: 1.5 }}>
        {message}
      </span>
    </HStack>
  );
}

// ── Queued follow-up (typed while streaming; sent when current ends) ──────
// Right-aligned to match user messages. Dashed border makes it read
// as "not yet real" — the queue-drain effect promotes it to a
// real user bubble when its turn arrives.
export function QueuedPromptChip({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "flex-end",
    }}>
      <div style={{
        maxWidth: "82%",
        padding: "6px 10px",
        border: "1px dashed var(--ft-border2)",
        borderRadius: 2,
        display: "flex",
        gap: 8,
        alignItems: "baseline",
      }}>
        <MonoLabel size={8} color="var(--ft-dim)" letterSpacing="0.14em">QUEUED</MonoLabel>
        <span style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          color: "var(--ft-muted)",
          lineHeight: 1.5,
          fontStyle: "italic",
        }}>
          {text}
        </span>
      </div>
    </div>
  );
}
