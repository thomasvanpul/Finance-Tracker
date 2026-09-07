// The boundary that sits between a lazy route and RootErrorBoundary.
//
// Wraps the <Suspense> in both shells (App.tsx for desktop, PhoneShell
// for phone). Its job is narrow: a dynamic import that failed is
// recoverable, so recover from it, and show something honest if recovery
// does not work. Everything else is rethrown, because a real render bug
// belongs in RootErrorBoundary with its stack intact rather than dressed
// up as a network problem.
//
// Two shapes that look right and are not, both found by measurement
// rather than reasoning:
//
// 1. Returning null from getDerivedStateFromError does NOT decline the
//    error. The boundary has still caught it, so it never reaches
//    RootErrorBoundary, and React re-renders the same child, which
//    throws again. Declining means rethrowing from render().
//
// 2. getDerivedStateFromError must be PURE. React invokes it more than
//    once for a single error — it replays the failed render to recover
//    a usable stack. The first version called shouldAttemptReload()
//    there; the replay consumed the one permitted attempt, so the state
//    went straight to "failed" and the page never reloaded at all. It
//    looked correct from the outside: the honest error surface appeared
//    and no raw TypeError was shown. Only a boot counter in
//    sessionStorage revealed the reload had not happened.
//
//    So this hook only CLASSIFIES. Deciding and reloading happen in
//    componentDidCatch, which is a commit-phase hook, runs once, and is
//    where side effects belong.

import { Component, type ReactNode } from "react";
import {
  isChunkLoadError,
  shouldAttemptReload,
  clearChunkReloadAttempt,
} from "@/lib/chunk-recovery";

interface Props {
  children: ReactNode;
}

type State =
  | { phase: "ok" }
  // Classified as a chunk failure; whether we reload or give up has not
  // been decided yet, because that decision has a side effect.
  | { phase: "chunk" }
  | { phase: "failed" }
  | { phase: "rethrow"; error: unknown };

export class LazyRouteBoundary extends Component<Props, State> {
  state: State = { phase: "ok" };

  // Pure. Classification only — see note 2 above.
  static getDerivedStateFromError(error: unknown): State {
    return isChunkLoadError(error)
      ? { phase: "chunk" }
      : { phase: "rethrow", error };
  }

  componentDidCatch(error: unknown): void {
    if (!isChunkLoadError(error)) return; // rethrown from render()
    if (shouldAttemptReload()) {
      window.location.reload();
      return;
    }
    this.setState({ phase: "failed" });
  }

  // A chunk failure that survived one reload is not necessarily
  // permanent; the user may simply have been offline. Clearing the flag
  // means the manual retry gets a real reload rather than being refused
  // by its own loop guard.
  private retry = (): void => {
    clearChunkReloadAttempt();
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.phase === "ok") return this.props.children;

    // Not ours. Hand it up with the original error object.
    if (this.state.phase === "rethrow") throw this.state.error;

    // Either a reload is in flight or componentDidCatch is about to flip
    // this to "failed". Deliberately blank rather than a skeleton, which
    // would read as progress that is not happening.
    if (this.state.phase === "chunk") return null;

    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--ft-space-8) var(--ft-space-6)",
          gap: "var(--ft-space-3)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          COULDN'T LOAD
        </div>
        <div
          style={{
            fontSize: 21,
            lineHeight: "28px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--ft-text)",
          }}
        >
          This page didn't finish loading.
        </div>
        <div
          style={{
            fontSize: "var(--ft-text-body)",
            lineHeight: "20px",
            color: "var(--ft-muted)",
          }}
        >
          Part of the app failed to download. Reloading usually fixes it — if
          you're offline, reconnect first.
        </div>
        <button
          type="button"
          onClick={this.retry}
          style={{
            alignSelf: "flex-start",
            marginTop: "var(--ft-space-2)",
            minHeight: 44,
            padding: "0 var(--ft-space-5)",
            borderRadius: 16,
            border: "1px solid var(--ft-border)",
            background: "var(--ft-raised)",
            color: "var(--ft-text)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--ft-text-body)",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
