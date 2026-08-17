// H5 file-import adapter.
//
// File import is push, not pull. The other adapters (Wise, Alpaca,
// Kraken) hold a live credential and fetch on a schedule; a file
// adapter carries no credential and never fetches on its own. The
// user pushes a statement via POST /connections/:id/import.
//
// We still route the file source through the adapter interface so
// the connection surface (list, status, error banner, sync-now
// button) is uniform. The three methods degrade honestly:
//
//   validateCredential(inst): the "credential" is actually the
//     institution slug + format tag (e.g. "monzo|csv"). This
//     validator confirms the pair is one the app knows how to
//     parse. Returns a display label like "File: Monzo (CSV)".
//
//   listAccounts(): returns []. A file doesn't enumerate accounts —
//     the user picks the target account at import time. The
//     connection row still exists so the settings UI can show a
//     "Monzo (CSV)" connection tile even before the first upload.
//
//   fetchTransactionsSince(): throws AdapterError("provider",
//     "file adapter does not support pull — use POST
//     /connections/:id/import"). Any generic sync-now trigger for a
//     file connection will surface this message rather than
//     silently succeeding; the UI can gate the sync button when
//     provider === "file".

import type {
  AdapterAccount,
  AdapterTransaction,
  ProviderAdapter,
  ValidationResult,
} from "./types";
import { AdapterError } from "./types";

// Known institution slugs. Adding a new one (e.g. "wise-csv") only
// requires listing it here and teaching the frontend parser. Kept
// alphabetical.
const KNOWN_INSTITUTIONS = new Set<string>([
  "barclays",
  "chase",
  "generic",
  "hsbc",
  "maybank",
  "monzo",
  "natwest",
  "revolut",
  "starling",
]);

const KNOWN_FORMATS = new Set<string>(["csv"]);

// The "credential" for a file connection is a pipe-joined
// institution|format. Parsed here to a typed pair. If either half
// is unknown the pair is rejected.
export function parseFileCredential(cred: string): { institution: string; format: string } | { error: string } {
  const parts = cred.split("|");
  if (parts.length !== 2) {
    return { error: "expected format: institution|format (e.g. monzo|csv)" };
  }
  const [inst, fmt] = parts as [string, string];
  const institution = inst.trim().toLowerCase();
  const format = fmt.trim().toLowerCase();
  if (!KNOWN_INSTITUTIONS.has(institution)) {
    return { error: `unknown institution "${institution}" (supported: ${[...KNOWN_INSTITUTIONS].join(", ")})` };
  }
  if (!KNOWN_FORMATS.has(format)) {
    return { error: `unknown format "${format}" (supported: ${[...KNOWN_FORMATS].join(", ")})` };
  }
  return { institution, format };
}

export const fileAdapter: ProviderAdapter = {
  provider: "file",

  async validateCredential(credential: string): Promise<ValidationResult> {
    const parsed = parseFileCredential(credential);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const instTitle = parsed.institution.charAt(0).toUpperCase() + parsed.institution.slice(1);
    return { ok: true, label: `File: ${instTitle} (${parsed.format.toUpperCase()})` };
  },

  async listAccounts(_credential: string): Promise<AdapterAccount[]> {
    return [];
  },

  async fetchTransactionsSince(
    _credential: string,
    _account: AdapterAccount,
    _since: Date,
  ): Promise<AdapterTransaction[]> {
    throw new AdapterError(
      "provider",
      "file adapter does not support pull — upload a statement via POST /connections/:id/import",
    );
  },
};
