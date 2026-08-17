// Desktop Connections panel. Lives in settings under the Integrations
// group. Uses the settings-atoms primitives; does not introduce a modal
// dialog (the Add flow is an inline expandable row so no dependency on
// the existing Dialog primitive and no restyle of the surrounding page).
//
// Contract:
//   - List:    label, status, lastSyncedAt, lastError. Never a credential.
//   - Add:     provider select + password-type input, POST /connections.
//              Surface the 400 message — it is the adapter's, safe to show.
//   - Sync:    POST /connections/:id/sync, counts as a toast.
//              Failure surfaces {error, kind}; "auth" gets a Reconnect
//              affordance, others get Retry.
//   - Delete:  confirm text says imported accounts + transactions survive.
//   - No view-credential affordance. The API cannot serve one and a mask
//     would be a UI contract the backend cannot honour.

import { useState } from "react";
import {
  useListConnections,
  useCreateConnection,
  useDeleteConnection,
  useSyncConnection,
  getListConnectionsQueryKey,
  type Connection,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { HStack, Text, VStack } from "@/components/primitives";
import { PANEL_STYLE, HEADER_STYLE, ROW, RowLabel, ActionBtn } from "./settings-atoms";
import { loadPersonaIds, syncCta, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";

// Providers the user can add through this UI. Multi-field providers
// list every field they need; the form joins the values as JSON and
// sends the JSON string as `credential`. Single-field providers get
// a single free-text password input.
//
// This list is the single source of truth on the frontend. Backend
// registration lives in artifacts/api-server/src/adapters/index.ts;
// keep them in sync (or expose a GET /connections/providers endpoint
// once the list stops fitting on one screen).
interface CredentialField {
  key: string;
  label: string;
  hint: string;
}
// `kind` decides which personas see the provider. Market persona sees
// only broker/exchange providers — the F1 brief calls this out
// specifically: a market-persona user must never be pushed to
// connect a bank. Kind → persona mapping lives in
// `providersForPersona()` below.
type ProviderKind = "bank" | "broker" | "exchange";
interface ProviderMeta {
  id: string;
  label: string;
  kind: ProviderKind;
  fields: CredentialField[];
}
const PROVIDERS: ProviderMeta[] = [
  {
    id: "wise",
    label: "Wise",
    kind: "bank",
    fields: [{ key: "token", label: "Personal API token", hint: "Wise → Settings → API tokens" }],
  },
  {
    id: "alpaca",
    label: "Alpaca",
    kind: "broker",
    fields: [
      { key: "keyId",  label: "API Key ID", hint: "Alpaca Dashboard → Your API Keys → Key ID" },
      { key: "secret", label: "API Secret", hint: "Shown once at key creation" },
    ],
  },
  {
    id: "kraken",
    label: "Kraken",
    kind: "exchange",
    fields: [
      { key: "apiKey",     label: "API Key",     hint: "Kraken → Settings → API" },
      { key: "privateKey", label: "Private Key", hint: "Base64 string shown at key creation" },
    ],
  },
];

// Which provider kinds each persona sees. Rules mirror F1's intent:
//   market  — pure holdings tracker, never a bank.
//   budget  — spending/transactions; brokers and exchanges are noise.
//   wealth  — cares about both; net worth needs bank + broker.
//   social  — split expenses need a bank to settle from; brokers are noise.
//   full    — everything.
// Keep this table one function so a future edit sees every rule at once.
export function providersForPersona(persona: PersonaId): ProviderMeta[] {
  const kinds: Record<PersonaId, ProviderKind[]> = {
    market: ["broker", "exchange"],
    budget: ["bank"],
    wealth: ["bank", "broker", "exchange"],
    social: ["bank"],
    full:   ["bank", "broker", "exchange"],
  };
  const allowed = new Set(kinds[persona]);
  return PROVIDERS.filter((p) => allowed.has(p.kind));
}

function currentPersona(): PersonaId {
  const ids = loadPersonaIds();
  return (ids[0] as PersonaId) ?? "full";
}

// Compose the credential string. Single-field providers submit the raw
// value; multi-field providers submit a JSON object keyed by field.key
// which the adapter parses.
function composeCredential(fields: CredentialField[], values: Record<string, string>): string {
  if (fields.length === 1) return values[fields[0]!.key] ?? "";
  const obj: Record<string, string> = {};
  for (const f of fields) obj[f.key] = values[f.key] ?? "";
  return JSON.stringify(obj);
}

const STATUS_COLORS: Record<string, string> = {
  active: "var(--ft-green)",
  pending: "var(--ft-amber)",
  error: "var(--ft-red)",
  revoked: "var(--ft-red)",
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "var(--ft-muted)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.08em",
        fontWeight: 700,
        color,
        border: `1px solid ${color}44`,
        padding: "2px 8px",
        background: `${color}11`,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function formatTs(ts: Date | string | null | undefined): string {
  if (ts == null) return "Never";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ConnectionRow({ connection }: { connection: Connection }) {
  const [hov, setHov] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const personaId = useActivePersona();

  const syncMutation = useSyncConnection();
  const deleteMutation = useDeleteConnection();

  const handleSync = async () => {
    try {
      const result = await syncMutation.mutateAsync({ id: connection.id });
      toast({
        title: `${connection.label} synced`,
        description:
          `${result.accountsUpserted} account${result.accountsUpserted !== 1 ? "s" : ""} · ` +
          `${result.transactionsAdded} new · ${result.transactionsUpdated} updated`,
      });
      qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
    } catch (err: unknown) {
      // Adapter's error text is safe to surface — it is written for the user.
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Sync failed", description: msg, variant: "destructive" });
      qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: connection.id });
      toast({
        title: `${connection.label} removed`,
        description: "Imported accounts and transactions stay. Reconnect any time.",
      });
      qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
    }
  };

  // status === "revoked" is the auth-failed state — surface a stronger
  // "Reconnect" prompt instead of a plain retry.
  const isAuthFail = connection.status === "revoked";
  const syncBusy = syncMutation.isPending;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...ROW,
        flexDirection: "column",
        alignItems: "stretch",
        gap: 10,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
    >
      {/* Top row: label + status pill + provider tag */}
      <HStack align="center" gap={10} justify="between">
        <VStack gap={2} minWidth0>
          <Text as="div" mono size={12} weight={600} color="var(--ft-text)">
            {connection.label}
          </Text>
          <Text as="div" mono size={10} color="var(--ft-muted)">
            {connection.provider.toUpperCase()} · Last synced {formatTs(connection.lastSyncedAt)}
          </Text>
        </VStack>
        <StatusPill status={connection.status} />
      </HStack>

      {/* Error banner (present when the last sync or an adapter step failed) */}
      {connection.lastError && (
        <div
          style={{
            padding: "6px 10px",
            border: "1px solid var(--ft-red)44",
            background: "var(--ft-red)11",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ft-red)",
            letterSpacing: "0.03em",
          }}
        >
          {connection.lastError}
        </div>
      )}

      {/* Action row */}
      <HStack gap={8} wrap>
        {isAuthFail ? (
          <ActionBtn
            label={syncBusy ? "RETRYING…" : "RECONNECT"}
            variant="accent"
            onClick={handleSync}
            disabled={syncBusy}
          />
        ) : (
          <ActionBtn
            label={syncBusy ? "SYNCING…" : connection.lastError ? "RETRY" : syncCta(personaId)}
            variant="accent"
            onClick={handleSync}
            disabled={syncBusy}
          />
        )}
        {confirmDelete ? (
          <>
            <ActionBtn
              label={deleteMutation.isPending ? "REMOVING…" : "CONFIRM REMOVE"}
              variant="danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            />
            <ActionBtn
              label="CANCEL"
              variant="muted"
              onClick={() => setConfirmDelete(false)}
            />
            <Text as="span" mono size={10} color="var(--ft-dim)" letterSpacing="0.04em">
              Imported accounts and transactions survive
            </Text>
          </>
        ) : (
          <ActionBtn label="REMOVE" variant="muted" onClick={() => setConfirmDelete(true)} />
        )}
      </HStack>
    </div>
  );
}

function AddConnectionForm({ onCreated }: { onCreated: () => void }) {
  // Persona-gated provider list. Market users never see banks; budget/
  // social users never see brokers. `currentPersona()` reads localStorage
  // synchronously — that mirrors what every other persona reader does
  // today. If a user changes persona at runtime, this form re-mounts on
  // its parent expander toggle so no live-update wiring is needed here.
  const visibleProviders = providersForPersona(currentPersona());
  const [provider, setProvider] = useState<string>(visibleProviders[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const createMutation = useCreateConnection();
  const qc = useQueryClient();

  const providerMeta =
    visibleProviders.find((p) => p.id === provider) ?? visibleProviders[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!providerMeta) {
      setErrorMessage("No providers available for this persona");
      return;
    }
    // Every field must be non-empty. The adapter will validate again
    // (and reject wrong values); this is just to avoid a round-trip
    // for the obvious mistake.
    for (const f of providerMeta.fields) {
      if (!values[f.key] || values[f.key]!.trim().length === 0) {
        setErrorMessage(`${f.label} is required`);
        return;
      }
    }
    const credential = composeCredential(providerMeta.fields, values);
    try {
      const created = await createMutation.mutateAsync({
        data: {
          provider,
          credential,
          label: label.trim() ? label.trim() : undefined,
        },
      });
      toast({
        title: "Connection added",
        description: `${created.label} · validated with ${provider}`,
      });
      qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
      setValues({});
      setLabel("");
      onCreated();
    } catch (err: unknown) {
      // Surface the adapter's own message. It is written for the user
      // and does not include the credential.
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: 4,
    padding: "6px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    background: "var(--ft-raised)",
    border: "1px solid var(--ft-border2)",
    color: "var(--ft-text)",
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: "var(--ft-surface)" }}>
      <HStack gap={10} align="end" wrap>
        <div style={{ flex: "0 0 140px", minWidth: 140 }}>
          <Text as="label" mono size={9} upper letterSpacing="0.08em" color="var(--ft-dim)">
            Provider
          </Text>
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value); setValues({}); setErrorMessage(null); }}
            style={inputStyle}
          >
            {visibleProviders.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        {providerMeta?.fields.map((f) => (
          <div key={f.key} style={{ flex: 1, minWidth: 220 }}>
            <Text as="label" mono size={9} upper letterSpacing="0.08em" color="var(--ft-dim)">
              {f.label}
            </Text>
            <input
              type="password"
              autoComplete="off"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.hint}
              style={inputStyle}
            />
          </div>
        ))}
        <div style={{ flex: "0 0 180px", minWidth: 140 }}>
          <Text as="label" mono size={9} upper letterSpacing="0.08em" color="var(--ft-dim)">
            Label <span style={{ color: "var(--ft-muted)", textTransform: "none" }}>(optional)</span>
          </Text>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Auto from provider"
            style={inputStyle}
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-accent)",
            background: "transparent",
            border: "1px solid var(--ft-accent)",
            padding: "7px 18px",
            cursor: createMutation.isPending ? "not-allowed" : "pointer",
            opacity: createMutation.isPending ? 0.6 : 1,
            letterSpacing: "0.04em",
          }}
        >
          {createMutation.isPending ? "VALIDATING…" : "&gt; VALIDATE + ADD"}
        </button>
      </HStack>
      {errorMessage && (
        <div
          style={{
            padding: "6px 10px",
            border: "1px solid var(--ft-red)44",
            background: "var(--ft-red)11",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--ft-red)",
          }}
        >
          {errorMessage}
        </div>
      )}
      <Text as="div" mono size={9} letterSpacing="0.04em" color="var(--ft-dim)">
        Validated against {providerMeta?.label ?? provider} before it is stored. AES-256-GCM at rest.
        Never returned to this page or anywhere else.
      </Text>
    </form>
  );
}

export function ConnectionsPanel() {
  const { data: connections = [], isLoading } = useListConnections();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <VStack gap={12}>
      <div style={PANEL_STYLE}>
        <div style={HEADER_STYLE}>
          <Text as="span" color="var(--ft-accent)">·</Text> Connections
        </div>

        {isLoading ? (
          <div
            style={{
              padding: "14px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              fontStyle: "italic",
            }}
          >
            Loading…
          </div>
        ) : connections.length === 0 ? (
          <div style={{ ...ROW, background: "var(--ft-surface)" }}>
            <RowLabel
              title="No connections yet"
              sub="Add one below to pull balances and transactions automatically. Credentials are encrypted at rest and never leave the server."
            />
          </div>
        ) : (
          connections.map((c) => <ConnectionRow key={c.id} connection={c} />)
        )}

        {/* Add-connection expander */}
        <div style={{ borderTop: "1px solid var(--ft-border)" }}>
          {!showAdd ? (
            <div style={{ ...ROW, background: "var(--ft-surface)", justifyContent: "space-between" }}>
              <RowLabel
                title="Add a connection"
                sub="Paste a provider token. Validated against the provider before it is stored."
              />
              <ActionBtn label="ADD" variant="accent" onClick={() => setShowAdd(true)} />
            </div>
          ) : (
            <AddConnectionForm onCreated={() => setShowAdd(false)} />
          )}
        </div>

        {/* Trailing note — mirrors docs/CREDENTIAL-ENCRYPTION.md boundaries */}
        <div
          style={{
            padding: "8px 14px",
            background: "var(--ft-raised)",
            borderTop: "1px solid var(--ft-border)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--ft-dim)",
            letterSpacing: "0.04em",
          }}
        >
          Credentials are AES-256-GCM at rest. Deleting a connection deletes the credential;
          imported accounts and transactions survive.
        </div>
      </div>
    </VStack>
  );
}
