# Credential encryption

The first credential-holding surface in the app is `connections`. Every row
carries a `credential_ciphertext` column and nothing else that could be
mistaken for a secret. This doc records what the encryption story is, what
we have not built yet, and what happens when things go wrong.

## Wire format

`connections.credential_ciphertext` is `base64(iv || ciphertext || authTag)`.

- Algorithm: AES-256-GCM
- Key size: 32 bytes
- IV size: 12 bytes (random per encryption)
- Auth tag: 16 bytes

The key comes from the `CREDENTIAL_ENCRYPTION_KEY` environment variable, a
base64 string that must decode to exactly 32 bytes. The `api-server` refuses
to boot without it. Generate one with:

```
openssl rand -base64 32
```

## Boundaries

- **In the database:** always encrypted. There is no plaintext column, no
  history table, no separate credentials service. The row is the only copy.
- **In the API response:** never. `routes/connections.ts` runs every
  response through `toPublic(c)` which strips the ciphertext column and
  every other credential-adjacent field. Tests assert this on the
  serialised response body of every connections endpoint.
- **In logs:** never. `lib/logger.ts` redacts `credential`,
  `credentialCiphertext`, `credential_ciphertext`, `token`, `apiKey`, and
  `secret` at any nesting depth via `*.` wildcards. Adapters do not log
  their own headers.
- **In memory:** for the duration of one outbound provider call. The
  credential is passed as a function argument, held on the stack, and
  falls out of scope when the call returns. Adapters are stateless and
  never cache credentials between calls.

## Key rotation (not built)

If we build rotation, the wire format needs a key-id prefix so multiple
keys can coexist during the rollover window:

```
kid1:<base64(iv||ciphertext||tag)>
```

Steps at that point would be:

1. Add `CREDENTIAL_ENCRYPTION_KEY_v2` alongside the existing key.
2. Deploy: `decryptCredential` tries `v2` first, falls back to `v1` based
   on the prefix. `encryptCredential` uses `v2`.
3. Batch: re-encrypt every existing row with `v2`. This is a script, not a
   migration — it needs the running API server's crypto module.
4. Drop `CREDENTIAL_ENCRYPTION_KEY_v1` from the environment.

None of this exists yet. `crypto.ts` has a single unlabelled key, and
`credential_ciphertext` has no prefix.

## Key loss

**If `CREDENTIAL_ENCRYPTION_KEY` is lost, every existing credential is
irrecoverable.** There is no fallback, no backup, no derivation.

The recovery path is:

1. Deploy a new key.
2. On the first sync attempt of any existing connection, `decryptCredential`
   throws because the auth tag no longer matches.
3. The route catches the error, sets `status = "revoked"` and
   `lastError = "credential unusable — please reconnect"`, and surfaces
   this in the response.
4. The user re-enters their credential; `POST /connections` re-validates
   against the provider, re-encrypts under the new key, and overwrites
   the ciphertext (unique per user+provider).

This is the intended behaviour — we would rather the user reconnect than
introduce a way to derive or recover the plaintext.

## Deletion

`DELETE /connections/:id` removes the row. The ciphertext goes with it.
No soft-delete, no audit copy. Adapter accounts created during previous
syncs are not deleted with the connection today (they remain as read-only
account records with `is_wise_linked = true`); if that becomes a problem
we address it explicitly rather than as a side effect.
