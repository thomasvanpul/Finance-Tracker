# H4 · Enable Banking — signup + config

The adapter, JWT signing, consent-start and consent-callback routes,
and the session model are in place. This doc records exactly what
needs to be signed up for before it works end-to-end.

## What is built and what runs today

- `artifacts/api-server/src/adapters/enable-banking.ts` — the
  `ProviderAdapter` implementation. `validateCredential`,
  `listAccounts`, `fetchTransactionsSince` all work against Enable
  Banking's REST shape as documented; unit-tested against a stubbed
  fetch. RS256 JWT signing for the app credential is real.

- `artifacts/api-server/src/routes/enable-banking.ts` — the two
  consent-flow endpoints:
    - `POST /connections/enable-banking/start`
    - `GET  /connections/enable-banking/callback`
  Pending consent state is held in-memory keyed by opaque `state`,
  with a 30-minute TTL. Single-instance only; if we ever run more
  than one api-server pod this needs to move to Redis or a
  `pending_consents` table.

- Registered in `src/adapters/index.ts` alongside the other
  providers, so `getAdapter("enable-banking")` returns it and
  `runConnectionSync` treats it like any other adapter.

## What stops the flow from actually working

**No Enable Banking application exists yet.** Every call from the
adapter to `https://api.enablebanking.com` will return 401 because
the RS256 JWT we sign has no counterpart on the Enable Banking
side. Nothing you can fix in code — you need to sign up.

## Signup path — exactly what to do

1. **Register at <https://enablebanking.com/register/developer>.**
   Personal signup is fine for Restricted Production; a company
   isn't needed unless we later add public users.

2. **Create an application in the portal.** You will get:
    - An **application ID** (UUID).
    - A **private/public key pair** in PEM format. Download the
      private key file (the portal never shows it again).

3. **Register a redirect URL for the application.** In the portal,
   under the application's "Redirect URLs" setting, add the exact
   URL that Enable Banking will send the user back to after they
   consent at their bank.

    - For local dev: `http://localhost:3001/api/connections/enable-banking/callback`
    - For production: `https://<your-api-host>/api/connections/enable-banking/callback`

    These have to match to the character. Register both if you want
    dev and prod under the same app.

4. **Complete Restricted Production activation.** From Enable
   Banking's own FAQ: "activated in restricted mode by linking
   your own accounts, in which case only those linked accounts are
   accessible through the application." No contract, no KYB, no
   company required.

## Env vars to set on the api-server

Paste into `artifacts/api-server/.env`:

```
ENABLE_BANKING_APP_ID=<application UUID from portal>
ENABLE_BANKING_PRIVATE_KEY=<paste the full PEM including BEGIN/END lines, or set via a base64-decoded env in the deploy platform>
ENABLE_BANKING_REDIRECT_URL=http://localhost:3001/api/connections/enable-banking/callback
ENABLE_BANKING_BASE_URL=https://api.enablebanking.com     # optional, defaults to this
```

Multi-line env values in `.env`: single-quote them and keep the
newlines literal. `dotenv` handles this. In Railway/Render, set the
private key as a secret variable and paste the multi-line PEM
directly.

## Test end-to-end once configured

Once the env vars are set and the redirect URL is registered:

```sh
# Start a consent flow (auth cookie required, so run from a browser
# devtools console at localhost:4321, or curl with a valid session
# cookie):
curl -X POST http://localhost:3001/api/connections/enable-banking/start \
  -H 'Content-Type: application/json' \
  -H 'Cookie: better-auth.session_token=<yours>' \
  -d '{"aspspName":"<bank name from EB catalogue>","aspspCountry":"GB"}'

# Response is { url, state }. Open `url` in a browser, log in to the
# bank, consent, and you'll be redirected back to
# /api/connections/enable-banking/callback?state=…&code=….
# The route exchanges the code, stores an encrypted session, and
# redirects to /settings?panel=connections&created=<id>.
```

## ASPSP catalogue

Enable Banking has an `/aspsps` endpoint that lists every supported
bank. The current UI does not fetch it; when we add the Enable
Banking picker to the connections form we'll need either:

- Fetch it on demand and cache client-side; or
- Cache server-side (it changes rarely) and expose a
  `GET /connections/enable-banking/aspsps` endpoint.

For a single-user Restricted Production install you likely know
your target banks in advance — hardcode two or three and skip the
picker for now.

## Consent lifetime and renewal

Enable Banking sets `valid_until` on `POST /auth`, capped by each
ASPSP's `maximum_consent_validity` (180 days for most banks). The
API abstracts the banks' short-lived access tokens internally, so
there is **no OAuth refresh** for us to implement.

When `valid_until` passes, calls to
`GET /sessions/{session_id}` return 401. The connection ends up as
`status = "revoked"` with `lastError = "Enable Banking rejected the
session or app credential"`. The user re-runs the consent flow;
`POST /connections` upserts on `(user_id, provider)` so the new
session id overwrites the old encrypted blob.

## What still needs frontend work

- **Provider picker**: Add "Enable Banking" as an option in the
  connections form, and instead of showing password fields, show a
  bank/ASPSP selector and a "Connect at bank" button that opens
  `POST /connections/enable-banking/start` and window.location.hrefs
  to the returned `url`.

- **Callback landing**: The callback redirects the browser to
  `/settings?panel=connections&created=<id>`. The settings page
  should notice the `created=` query param, toast success, and
  invalidate the connections list.

These are UI additions, not backend blockers. The moment the app
exists and the env vars are set, curl works end-to-end.

## Not in this scope

- **Multi-account per ASPSP.** Some banks return multiple accounts
  under one session; `listAccounts` handles this correctly. Whether
  the UI represents them as one connection with N accounts or N
  connections is a UX call — we currently show one connection row
  per session and let `runConnectionSync` upsert every account under
  it.

- **Payment initiation.** Enable Banking supports PIS; we do not.
  `docs/TARGET-PRODUCT.md` covers the payments story separately
  (TrueLayer). Adding PIS to Enable Banking would be a new adapter
  method, not an extension of this one.

- **Multi-instance state.** The pending-consent Map is process-
  local. If we ever run more than one api-server pod, or if the
  server restarts between `/start` and `/callback`, the callback
  will fail with "Consent state is expired or unknown". Fix: move
  the pending map to a `pending_consents` table. Not a blocker for
  a single-instance dev/staging deploy.
