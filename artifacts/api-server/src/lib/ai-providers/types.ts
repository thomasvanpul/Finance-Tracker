// Unified interface every AI provider (Groq, Cerebras) exposes so the
// chain in chain.ts can walk them without caring about per-provider
// defaults. Both are OpenAI-compatible, so the shared callOpenAICompat
// helper covers every lane — no adapter needed per provider beyond
// model + baseUrl + key. The Gemini lane was removed 2026-08-23 (its key
// could never authenticate) and the OpenRouter free-model lane on
// 2026-09-11 (free endpoints' terms forbid the data sent; see
// model-policy.ts).
//
// Both callChat-shape helpers and callVision-shape helpers return the
// same AiCallResult — text out, ok/diagnostic for error handling. The
// chain wraps the successful text with servingProvider + reducedCapacity
// so the route layer can pass a UI signal down to the client.

// The provider identifiers, registered in provider-health. Keeping this
// as a string-literal union so a typo in a chain doesn't compile.
export type AiProviderName = "groq" | "cerebras";

// A single provider call outcome. ok=false includes ProviderUnavailable
// (breaker open / no key), network errors, non-2xx responses, and
// success-with-empty-body. Diagnostic is server-side detail — never
// returned to the client.
export interface AiCallResult {
  ok: boolean;
  text: string;
  diagnostic: string;
}

// Message shape shared by chat + categorize prompts. Vision uses a
// separate call surface (image + prompt), not this.
export interface ChatMessage {
  role: "user" | "assistant" | "model" | "system";
  text: string;
}

// Chain-level outcome. `text` is the response the caller renders;
// `servingProvider` names which provider answered (null if all failed);
// `reducedCapacity` is true whenever we're serving from anything other
// than the task's primary provider — the UI signal to render a quiet
// "reduced capacity" chrome. `triedProviders` is the in-order attempt
// list, for logging / diagnostics — not sent to the client.
export interface ChainResult {
  ok: boolean;
  text: string;
  servingProvider: AiProviderName | null;
  reducedCapacity: boolean;
  triedProviders: AiProviderName[];
}
