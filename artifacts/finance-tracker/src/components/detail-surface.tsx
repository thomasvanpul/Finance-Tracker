import type { ReactNode } from "react";
import { useCallback } from "react";
import { useLocation } from "wouter";
import { MobileSheet } from "@/components/mobile-sheet";
import { useQueryParam } from "@/hooks/use-query-param";
import { ENTITY_PARAM, type EntityKind } from "@/lib/entity-href";

// ── DetailSurface ───────────────────────────────────────────────────────────
// One entity's detail, opened by a query parameter on its own list screen
// rather than by a route.
//
// CLAUDE.md: a new URL is a claim that a feature is one of the ~20 things a
// user looks up by name, and the repo carries the scar of ignoring that — 40
// phone routes, 30 of them unfindable. A single account is not one of the
// twenty. `?account=105` costs a hook; `/accounts/105` costs a page.
//
// The parameter IS the state: there is no `open` prop and no local boolean to
// drift out of sync. Closing strips the parameter, so back/forward and a
// pasted link both behave. The cost, accepted deliberately, is a weaker URL —
// if Numeris ever gains sharing, this is the decision to revisit.
//
// Rendered on `MobileSheet`, so it is a drawer on a phone and a dialog on
// desktop, with no second sheet implementation.

interface DetailSurfaceProps {
  /** Which entity kind this screen shows detail for. Names the parameter. */
  kind: EntityKind;
  /** Sheet title. Called with the open id so the title can name the entity. */
  title: (id: string) => string;
  /** Rendered only while the surface is open, so it costs nothing when closed. */
  children: (id: string) => ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}

export function DetailSurface({ kind, title, children, footer, maxWidth }: DetailSurfaceProps) {
  const param = ENTITY_PARAM[kind];
  const id = useQueryParam(param);
  const [location, navigate] = useLocation();

  const close = useCallback(() => {
    // Drop only this parameter — a screen may carry filters in the URL too.
    const next = new URLSearchParams(window.location.search);
    next.delete(param);
    const qs = next.toString();
    navigate(qs ? `${location}?${qs}` : location, { replace: true });
  }, [param, location, navigate]);

  if (id === null) return null;

  return (
    <MobileSheet
      open
      onOpenChange={(open) => { if (!open) close(); }}
      title={title(id)}
      footer={footer}
      maxWidth={maxWidth}
    >
      {children(id)}
    </MobileSheet>
  );
}
