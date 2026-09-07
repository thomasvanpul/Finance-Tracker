import { useMemo } from "react";
import { useSearch } from "wouter";

/**
 * Live read of a single URL query parameter.
 *
 * Replaces `new URLSearchParams(window.location.search).get(name)` inside a
 * `useState` initializer. That pattern reads the URL exactly once, so a later
 * change to the same parameter — `?account=105` becoming `?account=106` —
 * left the page showing the first value with no way to tell it was stale.
 * `useSearch` subscribes to the router, so a parameter change re-renders.
 *
 * The value is `null` when the parameter is absent, matching
 * `URLSearchParams.get`.
 */
export function useQueryParam(name: string): string | null {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search).get(name), [search, name]);
}

/**
 * Live read of the whole query string, for callers that need more than one
 * parameter. The returned object is stable for a given query string, so it is
 * safe as an effect dependency.
 */
export function useQueryParams(): URLSearchParams {
  const search = useSearch();
  return useMemo(() => new URLSearchParams(search), [search]);
}
