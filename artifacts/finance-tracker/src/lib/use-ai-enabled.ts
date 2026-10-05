// The AI switch as React state. isAiEnabled() (ai-enabled.ts) is a plain
// read, which is right for apiFetch but wrong for a page: a page that read
// it once on mount kept showing "AI ONLINE" after the switch went off in
// another tab, and never re-rendered when it came on. This subscribes to
// the two ways the key changes — the settings toggle's own event in this
// tab, and the storage event from another tab.
//
// Kept separate from ai-enabled.ts, which must stay free of imports
// (api-fetch.ts imports it).

import { useSyncExternalStore } from "react";
import { AI_ENABLED_CHANGE_EVENT, AI_ENABLED_KEY, isAiEnabled } from "./ai-enabled";

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === AI_ENABLED_KEY) onChange();
  };
  window.addEventListener(AI_ENABLED_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AI_ENABLED_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAiEnabled(): boolean {
  return useSyncExternalStore(subscribe, isAiEnabled, () => false);
}
