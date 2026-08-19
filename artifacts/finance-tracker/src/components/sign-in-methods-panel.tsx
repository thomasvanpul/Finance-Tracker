// Sign-in methods panel. Lives in profile.tsx as the security surface.
//
// What it shows: every way the user can currently sign in — password
// account, linked social providers, and per-device passkeys — with
// the ability to link another provider, register a new passkey, or
// remove one.
//
// The critical guard: never let the user remove their last non-
// passkey method. Passkeys are per-device; if the device is lost or
// wiped and no other method exists, the user is locked out
// permanently. accountLinking is configured with the OAuth providers
// as trustedProviders (see artifacts/api-server/src/lib/better-auth.ts),
// so an email-collision sign-in via a trusted provider will link
// rather than clone the user — but that only helps if the account
// exists on the second provider first. The removal guard is our only
// defence against the "I removed my last password/provider" case.

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useAuthProviders, type ProviderId } from "@/lib/auth-providers";
import { HStack, VStack, Text, MonoLabel } from "@/components/primitives";
import { Shield, Plus, Trash2, Fingerprint } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  providerId: string; // "credential" | "google" | "apple" | "github"
  accountId: string;
  createdAt?: string | Date;
}

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: string | Date;
  // The plugin also stores counter/deviceType/backedUp/aaguid —
  // not surfaced here to avoid meaningless authenticator model
  // strings on the UI. Name + created date are what a user needs
  // to decide whether to keep a passkey.
}

const PROVIDER_LABEL: Record<string, string> = {
  credential: "Password",
  google: "Google",
  apple: "Apple",
  github: "GitHub",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | Date): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  panelStyle: React.CSSProperties;
  headerStyle: React.CSSProperties;
}

export function SignInMethodsPanel({ panelStyle, headerStyle }: Props) {
  const { providers: configuredProviders, passkeyEnabled, loading: providersLoading } = useAuthProviders();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browserSupportsWebAuthn, setBrowserSupportsWebAuthn] = useState(false);

  useEffect(() => {
    setBrowserSupportsWebAuthn(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // authClient.listAccounts → GET /list-accounts on the server;
      // returns rows from the account table for the current user.
      const accRes = await authClient.listAccounts();
      const accRows = (accRes?.data ?? []) as AccountRow[];
      setAccounts(accRows);

      // Passkey list is separate — the plugin exposes it under
      // authClient.passkey.listUserPasskeys. Cast because the
      // plugin's client typings are attached at runtime and the
      // core authClient type doesn't know about them.
      const pkClient = (authClient as unknown as {
        passkey?: { listUserPasskeys?: () => Promise<{ data?: PasskeyRow[] }> };
      }).passkey;
      if (pkClient?.listUserPasskeys) {
        const pkRes = await pkClient.listUserPasskeys();
        setPasskeys((pkRes?.data ?? []) as PasskeyRow[]);
      } else {
        setPasskeys([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sign-in methods.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const nonPasskeyCount = accounts.length;
  const passkeyCount = passkeys.length;

  // Lockout guard: the user needs at least one non-passkey method AT
  // ALL TIMES. Passkeys are per-device — losing the device locks the
  // user out permanently. Removing a non-passkey account is refused
  // when it would leave zero. Passkey removal is unrestricted (per-
  // device is the point; removing one just removes that device).
  const canRemoveAccount = (accountId: string): { allowed: boolean; reason?: string } => {
    if (nonPasskeyCount <= 1) {
      // Only one non-passkey left. Refuse regardless of whether
      // passkeys exist — the audit spelled it out: never let a
      // passkey be the ONLY way in.
      return {
        allowed: false,
        reason: passkeyCount > 0
          ? "This is your only non-passkey method. Passkeys are per-device — remove another and you'd be locked out if you lost the device."
          : "This is your only sign-in method. Add another before removing this one.",
      };
    }
    return { allowed: true };
  };

  const handleLinkProvider = async (provider: ProviderId) => {
    setError(null);
    setBusy(`link:${provider}`);
    try {
      await authClient.linkSocial({
        provider,
        callbackURL: window.location.href,
      });
      // linkSocial navigates away to the OAuth flow; on return the
      // page reloads and refresh() runs on mount.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start provider link.");
      setBusy(null);
    }
  };

  const handleUnlinkAccount = async (acc: AccountRow) => {
    const check = canRemoveAccount(acc.id);
    if (!check.allowed) {
      setError(check.reason ?? "Removal refused.");
      return;
    }
    setError(null);
    setBusy(`unlink:${acc.id}`);
    try {
      const res = await authClient.unlinkAccount({
        providerId: acc.providerId,
        accountId: acc.accountId,
      });
      if (res?.error) throw new Error(res.error.message ?? "Unlink failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove method.");
    } finally {
      setBusy(null);
    }
  };

  const handleAddPasskey = async () => {
    setError(null);
    setBusy("add:passkey");
    try {
      const pkClient = (authClient as unknown as {
        passkey?: { addPasskey?: (opts?: { name?: string }) => Promise<{ error?: { message?: string } | null } | undefined> };
      }).passkey;
      if (!pkClient?.addPasskey) throw new Error("Passkey plugin not available.");
      // The default name is the authenticator's best guess — Chrome
      // says "Google Password Manager", Safari says "iCloud Keychain",
      // etc. Passing an empty label lets the SDK use its default.
      const res = await pkClient.addPasskey();
      if (res?.error) throw new Error(res.error.message ?? "Passkey registration failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register passkey.");
    } finally {
      setBusy(null);
    }
  };

  const handleDeletePasskey = async (pk: PasskeyRow) => {
    setError(null);
    setBusy(`delete:${pk.id}`);
    try {
      const pkClient = (authClient as unknown as {
        passkey?: { deletePasskey?: (opts: { id: string }) => Promise<{ error?: { message?: string } | null } | undefined> };
      }).passkey;
      if (!pkClient?.deletePasskey) throw new Error("Passkey plugin not available.");
      const res = await pkClient.deletePasskey({ id: pk.id });
      if (res?.error) throw new Error(res.error.message ?? "Passkey delete failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove passkey.");
    } finally {
      setBusy(null);
    }
  };

  const linkedProviderIds = new Set(accounts.map((a) => a.providerId));
  const canLinkProviders = configuredProviders.filter((p) => !linkedProviderIds.has(p));
  const passkeyAvailable = passkeyEnabled && browserSupportsWebAuthn;

  return (
    <div style={panelStyle}>
      <div style={{ ...headerStyle, borderLeft: "3px solid var(--ft-green)", paddingLeft: 10 }}>
        <Shield size={10} style={{ color: "var(--ft-green)" }} />
        <span>Sign-in Methods</span>
      </div>
      <div style={{ background: "var(--ft-surface)" }}>
        {loading || providersLoading ? (
          <div style={{ padding: "14px 16px" }}>
            <MonoLabel size={9} color="var(--ft-dim)">Loading…</MonoLabel>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 14px",
                  background: "color-mix(in srgb, var(--ft-red) 8%, transparent)",
                  borderBottom: "1px solid color-mix(in srgb, var(--ft-red) 40%, var(--ft-border))",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ft-red)",
                }}
              >
                {error}
              </div>
            )}

            {/* Accounts (password + linked providers) */}
            {accounts.map((acc, i) => {
              const isLastAccount = i === accounts.length - 1 && passkeys.length === 0;
              const label = PROVIDER_LABEL[acc.providerId] ?? acc.providerId;
              const check = canRemoveAccount(acc.id);
              const removing = busy === `unlink:${acc.id}`;
              return (
                // Row divider lives on the wrapping div — Stack owns
                // layout, not surface (per CLAUDE.md primitives split).
                <div
                  key={acc.id}
                  style={{ borderBottom: isLastAccount ? undefined : "1px solid var(--ft-border)" }}
                >
                  <HStack align="center" justify="between" padding="9px 14px">
                    <HStack gap={10} align="center">
                      <span
                        style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: "var(--ft-green)", flexShrink: 0,
                        }}
                      />
                      <VStack gap={2}>
                        <Text as="span" mono size={11} color="var(--ft-text)">{label}</Text>
                        {acc.createdAt && (
                          <MonoLabel size={9} color="var(--ft-dim)">
                            Added {fmtDate(acc.createdAt)}
                          </MonoLabel>
                        )}
                      </VStack>
                    </HStack>
                    <button
                      type="button"
                      onClick={() => void handleUnlinkAccount(acc)}
                      disabled={!check.allowed || removing || busy != null}
                      title={check.reason}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--ft-border)",
                        color: check.allowed ? "var(--ft-dim)" : "var(--ft-border2)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        padding: "4px 8px",
                        cursor: check.allowed && !removing ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Trash2 size={9} />
                      {removing ? "Removing…" : "Remove"}
                    </button>
                  </HStack>
                </div>
              );
            })}

            {/* Passkeys */}
            {passkeys.map((pk, i) => {
              const isLast = i === passkeys.length - 1;
              const removing = busy === `delete:${pk.id}`;
              return (
                <div
                  key={pk.id}
                  style={{ borderBottom: isLast ? undefined : "1px solid var(--ft-border)" }}
                >
                  <HStack align="center" justify="between" padding="9px 14px">
                    <HStack gap={10} align="center">
                      <Fingerprint size={12} style={{ color: "var(--ft-accent)" }} />
                      <VStack gap={2}>
                        <Text as="span" mono size={11} color="var(--ft-text)">
                          {pk.name ?? "Passkey"}
                        </Text>
                        {pk.createdAt && (
                          <MonoLabel size={9} color="var(--ft-dim)">
                            Registered {fmtDate(pk.createdAt)}
                          </MonoLabel>
                        )}
                      </VStack>
                    </HStack>
                    <button
                      type="button"
                    onClick={() => void handleDeletePasskey(pk)}
                    disabled={removing || busy != null}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--ft-border)",
                      color: "var(--ft-dim)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "4px 8px",
                      cursor: removing ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                      <Trash2 size={9} />
                      {removing ? "Removing…" : "Remove"}
                    </button>
                  </HStack>
                </div>
              );
            })}

            {/* Add another */}
            {(canLinkProviders.length > 0 || passkeyAvailable) && (
              <div style={{ borderTop: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
              <VStack gap={8} padding="12px 14px">
                <MonoLabel size={9} letterSpacing="0.1em" color="var(--ft-dim)">Add another</MonoLabel>
                <HStack gap={8} wrap>
                  {passkeyAvailable && (
                    <button
                      type="button"
                      onClick={() => void handleAddPasskey()}
                      disabled={busy != null}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--ft-border2)",
                        color: "var(--ft-text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        padding: "8px 12px",
                        cursor: busy != null ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Plus size={11} />
                      <Fingerprint size={12} />
                      {busy === "add:passkey" ? "Waiting for authenticator…" : "Passkey"}
                    </button>
                  )}
                  {canLinkProviders.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void handleLinkProvider(p)}
                      disabled={busy != null}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--ft-border2)",
                        color: "var(--ft-text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        padding: "8px 12px",
                        cursor: busy != null ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Plus size={11} />
                      {PROVIDER_LABEL[p] ?? p}
                    </button>
                  ))}
                </HStack>
              </VStack>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
