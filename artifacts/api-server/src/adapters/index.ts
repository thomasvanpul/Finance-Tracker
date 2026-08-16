import type { ProviderAdapter } from "./types";
import { wiseAdapter } from "./wise";
import { alpacaAdapter } from "./alpaca";
import { krakenAdapter } from "./kraken";
import { enableBankingAdapter } from "./enable-banking";

export * from "./types";
export { wiseAdapter } from "./wise";
export { alpacaAdapter } from "./alpaca";
export { krakenAdapter } from "./kraken";
export { enableBankingAdapter } from "./enable-banking";

// Registry keyed by provider slug. Additions land here and nowhere else so
// the route layer can look up an adapter without knowing which providers
// exist.
const REGISTRY: Record<string, ProviderAdapter> = {
  [wiseAdapter.provider]: wiseAdapter,
  [alpacaAdapter.provider]: alpacaAdapter,
  [krakenAdapter.provider]: krakenAdapter,
  [enableBankingAdapter.provider]: enableBankingAdapter,
};

export function getAdapter(provider: string): ProviderAdapter | null {
  return REGISTRY[provider] ?? null;
}

export function listProviders(): string[] {
  return Object.keys(REGISTRY);
}
