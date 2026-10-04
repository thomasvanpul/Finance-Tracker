# N3 · Phone settings: what desktop does that MobileSettings does not

Measured 4 Oct 2026 by reading both files (BACKLOG N3, plan item w-3fdd70).
Desktop: `artifacts/finance-tracker/src/pages/settings.tsx` (3,008 lines).
Phone: `artifacts/finance-tracker/src/components/mobile/MobileSettings.tsx`
(778 lines, imported by nothing: `rg MobileSettings` over `artifacts` and
`lib` finds only the file itself).

## Verdict: rewrite, do not revive

| | Count |
| --- | --- |
| Desktop capabilities | 36 (plus `PrivacyPanel`, defined at :1116-1172 and never rendered) |
| MobileSettings capabilities | 18 |
| …of which do anything | 6: privacy toggle, theme picker, Connections, and links to /import, /settings, /accounts |
| …of which only set local `useState` or have no handler | 11 |
| …wired but broken | 1: the currency row |
| In both | 9, of which 2 share a data path (theme, Connections) |
| Desktop-only | 27 |

Reviving the file buys Connections and the theme picker, which the phone
already reaches through the desktop page with the same hooks, plus the
privacy toggle. It also brings back things the hard constraints forbid:

- `:59` reads `currency.currency`. The type is `{ baseCurrency }`
  (`api.schemas.ts:1580`), and a cast hides the mismatch, so the row always
  shows "GBP", a value the API did not supply.
- `:107` shows "All accounts synced" with a green dot whatever the
  connections' state.
- Copy promises behaviour that does not exist: "Warn at 80% and 100%" `:224`,
  "3 days before due date" `:225`, "Refresh every 30 minutes" `:235`.
  Notifications, dark mode, compact view, biometric lock, analytics and
  background sync are `useState` with no effect.
- `:239` links to `/export`, which has no route.

No `MOCK_` constants, no emoji, nothing clips a figure, and it typechecks.

## How a phone user reaches settings today

`DirectoryScreen.tsx:78-83` → `/settings` → `PhoneShell.tsx:305`
`wrappedRoute` renders the desktop page inside `DirectoryItemScreen`. Below
768px the page swaps its sidebar for a two-level chip nav
(`settings.tsx:2625-2685`), so all 36 panels are reachable. `PhoneShell.tsx:81-87`
calls every wrapped route a live iPad-audit defect.

## Desktop capabilities (settings.tsx)

1 Terminal Profile (personas) :513-698 · 2 Third tab slot :700-757 ·
3 Re-run setup :761-766 · 4 Theme :853-904 · 5 Density :906-919 ·
6 Accent colour :921-963 · 7 Date format :1019 · 8 Time format :1030 ·
9 Week start :1039 · 10 Numbers and currency display :1050-1069 ·
11 Font scale :1071 · 12 Motion and effects :1085-1111 · 13 Companion
legend :1376-1444 · 14 Category colours :2333-2426 · 15 Base currency
(GET/PUT /settings/currency) :2755 · 16 Manual FX overrides :2771 ·
17 Alert rules and savings target :2806 · 18 Auto-categorisation rules
:2842 · 19 Custom categories :1237 · 20 Dashboard landing and strip :1206 ·
21 Navigation visibility :1216 · 22 Transaction defaults :361-406 ·
23 Dashboard widgets :2899 · 24 Export (/api/export/backup) :2935 ·
25 Reset rows :2947 · 26 Feature flags :1317 · 27 Maintenance :1322 ·
28 Storage usage :1331 · 29 Connections (settings-connections.tsx) ·
30 Wise (legacy) :1647-1792 · 31 Crypto wallets :1964-2330 · 32 Weekly
digest :1799-1874 · 33 AI on/off :1487 · 34 Assistant style :1497 ·
35 What the AI is sent :1545 · 36 Keyboard shortcuts :2980.

Most of 5-12 and 20-28 are device-local `nr-*`/`ft-*` keys; 15, 24, 29, 30
and 32 are API-backed.

## What is left for Thomas

Which of the 36 belong on a phone, and in what order, is a design call
(DESIGN.md, Mobile Amendment, and the "home before route" rule). The rewrite
starts from that list, reuses the desktop panels' data paths, and removes
`MobileSettings.tsx` in the same change.
