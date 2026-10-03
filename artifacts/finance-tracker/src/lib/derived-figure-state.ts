// Whether a figure computed from a query's rows may be drawn.
//
// A sum over rows is a real number only when the rows arrived. An empty
// array the API returned is a real zero; no data at all is not. Offline,
// the persister refuses to store empty arrays (offline-cache.ts
// isBannedCacheValue), so a month with no rows restores nothing and the
// query ends errored or paused — and `rows ?? []` then reads as £0.
// derived-figure-state.test.ts holds the cases.

export type DerivedFigureState = "ready" | "loading" | "unavailable";

export interface DerivedFigureQuery {
  data: unknown;
  isFetching: boolean;
}

export function derivedFigureState(query: DerivedFigureQuery): DerivedFigureState {
  if (query.data !== undefined) return "ready";
  return query.isFetching ? "loading" : "unavailable";
}
