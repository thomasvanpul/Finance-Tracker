// Models Numeris refuses to send a request to, whatever the provider.
//
// ── Why ───────────────────────────────────────────────────────────────────
// Until 2026-09-11 the chain's third lane was OpenRouter on free models.
// Free endpoints run on hosts whose terms forbid what the chain sends
// them: NVIDIA's API Trial logs and trains on every prompt and forbids
// personal data and production use; Google AI Studio's unpaid tier trains
// on inputs and may not be offered to users in the EEA, Switzerland or the
// UK. Every chat sends a summary of the user's finances, categorisation
// sends transaction descriptions, and receipt features send photographs.
// A feature that is down is a bug; a feature that sends that data to a
// free endpoint is a breach. Refused here, in the shared transport, so no
// env var, config array or future adapter can route to one.
// Record: docs/DATA-INVENTORY.md §4.1.
//
// ── How free models are named ─────────────────────────────────────────────
// Measured against https://openrouter.ai/api/v1/models on 2026-09-11:
// 438 models, 19 with ids ending in the `:free` variant suffix, and every
// one of those 19 priced at zero for prompt and completion. So the suffix
// is how OpenRouter marks a free variant. It is not the whole set of
// zero-priced ids: three have no suffix. Two are Lyria music-generation
// previews (not chat or vision, never usable here); the third is the
// `openrouter/free` router, which forwards to whichever free model is up.
// A suffix-only rule would let that router through, so it is named too.
//
// Paid OpenRouter models carry no suffix and are NOT refused. Whether to
// use one is a cost and terms decision, not something this file decides.

const FREE_VARIANT_SUFFIX = ":free";

// Zero-priced routers without the suffix. Lower-case, exact id match.
const FREE_ROUTER_IDS: readonly string[] = ["openrouter/free"];

/** Why a model id is refused, or null when it may be called. */
export function refusedModelReason(model: string): string | null {
  const id = model.trim().toLowerCase();
  if (id.endsWith(FREE_VARIANT_SUFFIX)) {
    return `model "${model}" is a free-tier variant; free endpoints' terms forbid the personal and financial data Numeris sends`;
  }
  if (FREE_ROUTER_IDS.includes(id)) {
    return `model "${model}" routes to free-tier models; free endpoints' terms forbid the personal and financial data Numeris sends`;
  }
  return null;
}

export function isRefusedModel(model: string): boolean {
  return refusedModelReason(model) !== null;
}
