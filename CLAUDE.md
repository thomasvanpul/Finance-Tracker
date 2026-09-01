# Numeris — working notes for Claude Code

Personal finance tracker. pnpm 11 monorepo, TypeScript 5.9.
Read this before doing anything. Read the referenced docs when the task
touches their subject.

## Commands

```bash
# dev server — PORT defaults to 3000 and strictPort is true, and Obsidian
# holds 3000, so plain `pnpm dev` exits immediately. Always:
cd artifacts/finance-tracker && PORT=4321 BASE_PATH=/ pnpm dev

pnpm --filter @workspace/finance-tracker run typecheck   # tsc --noEmit
pnpm --filter @workspace/finance-tracker test            # vitest

# the pre-push hook runs a full typecheck and build and needs both vars:
export PORT=5173 BASE_PATH=/ && git push origin main
```

## Restarting the local servers

Kill and restart the local api-server (:3001) and Vite (:4321) yourself
whenever you need to — `pnpm dev` builds then runs `dist/index.mjs` with no
watcher, so a server change is NOT live until the process is restarted. Both are
dev processes pointing at the Neon dev branch; nothing depends on their uptime.
Waiting for a human to restart them has stalled two sessions.

**A stale server will lie to you.** Vite sets `strictPort`, so a second instance
fails to bind rather than moving to another port — the old one keeps serving 200
with a bundle from hours ago, and every change looks like it did not apply.
`pkill -f vite` does not always match it. Before debugging a change that seems
absent, check what is actually listening:

```bash
lsof -i :4321 -P -n | grep LISTEN     # and :3001 for the API
lsof -ti :4321 | xargs kill -9        # if it is a stale one
```

The installed PWA adds a second layer of the same problem — its service worker
caches aggressively with `autoUpdate`.

```bash
pkill -f "dist/index.mjs"; cd artifacts/api-server && pnpm dev
pkill -f vite; cd artifacts/finance-tracker && PORT=4321 BASE_PATH=/ pnpm dev
```

Also kill any Playwright browsers you spawn — one session left 129 Chromium
processes running.

## Where things are

| Path | What |
| --- | --- |
| `artifacts/finance-tracker` | React SPA (Vite, wouter, TanStack Query) |
| `artifacts/api-server` | Express API |
| `lib/db` | drizzle schema. Every table carries `userId` — the app is multi-tenant |
| `docs/` | see the index at the bottom of this file |

Deploy: Vercel serves the SPA, with its project **root directory set to
`artifacts/finance-tracker`**, so that package's `vercel.json` is the live one
and the repo-root `vercel.json` is dead config (still pointing at the old
Railway URL, tracked in BACKLOG § G3). The API is on **Render** at
`https://numeris-api.onrender.com` — the Railway migration completed and the
Railway subscription is gone; Railway URLs anywhere in the repo (footer,
root vercel.json, doc examples) are stale references, not active hosts.
Verify with `curl -D- https://financetracker.work/api/auth/get-session` — the
response carries `x-render-origin-server`. The database is Neon
(`eu-west-2`), an independent free-tier account that survives any provider
change on the API side.

Render sleeps at 15 min idle on the free tier. Keep-alive is cron-job.org
hitting `/api/healthz` every minute, with a Healthchecks.io dead-man's-
switch as the failure-visibility layer. The `.github/workflows/keep-alive.yml`
workflow is deprecated (measured median gap 260 min against a 10-min
schedule) and lives only as a documented failure record. Upgrade thresholds
(healthz p95 > 800ms/7d OR endpoint p95 > 1500ms/3d = time to consider
Render Starter at £66/yr) and full operational detail are in `docs/OPERATIONS.md`.

Local development points at the Neon branch **`dev`** (`br-cold-term-abp7fwtk`),
a copy-on-write clone of production carrying real data. Safe to migrate, seed
and break. The production URL is preserved in `lib/db/.env.production.backup`.
Never point local development at production.

## Hard constraints

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` as a supply-chain
  defence. Never disable or reduce it.
- **Never show a number the API did not supply.** Twelve mobile screens once
  carried 58 `MOCK_*` constants gated on `netWorth === 0` or empty arrays, so a
  user with genuinely empty finances saw fabricated balances that rendered
  identically to real ones. All removed. Do not reintroduce fallback data in any
  form. A screen with no data shows an empty state.
- **Never resolve a failing check by weakening the check.** A rate limiter once
  ended up keyed to `NODE_ENV !== "production"` on a platform that never set
  `NODE_ENV`, so it silently disabled itself. Security defaults fail closed.
- Nothing sensitive in a served directory. `artifacts/finance-tracker/static/`
  is Vite's `publicDir` and `public/` is the build `outDir`. Both are public.
- **No emoji anywhere in the UI, including flags.** Currency and country
  identity is carried by purpose-drawn SVG icons, never by emoji — they render
  differently on every platform, cannot be themed, ignore the type ladder, and
  read as decoration in a product whose whole visual argument is that it is an
  instrument. Known sources: a currency-to-emoji map duplicated in
  `components/widgets/net-worth.tsx` and `accounts-summary.tsx`, and the
  market-hours city list in `components/layout.tsx`.

- The app **cannot hold or convert money.** It can initiate a payment through a
  licensed provider, which the user approves in their own banking app. Never
  design or build an action implying otherwise. MYR and Maybank are read-only.
- **A financial figure is shown in full or not at all.** A truncated figure that
  reads as a different, plausible number is the worst class of defect a finance
  app can ship: `£11,371` clipped to `£1…` reads as £1. Below a width threshold,
  render the label alone or the value alone — never an ellipsised, half-visible,
  or CSS-cropped number. Every currency figure and percentage falls under this;
  it is not enough to remove `text-overflow: ellipsis` if `overflow: hidden` on
  the parent still crops digits. Callers that put a `.pnum` inside a
  size-constrained container must guarantee width or skip render.
- **The primitives family has a hard split.** `Stack` (HStack / VStack) owns
  layout — direction, gap, align, justify, wrap, padding, margin, size, flex.
  `PanelBox` owns surface — background, border, padding, borderTop.
  Text primitives (`Text`, `MonoLabel`) own typography.
  If a property is neither layout nor surface (nor typography), it belongs on
  neither primitive. One-off surface treatments (accent-tinted borders, alert
  backgrounds) stay as inline styles rather than being folded into a primitive
  — the family is not obliged to swallow every unique surface, and pretending
  otherwise is how a primitive becomes a passthrough for div. No primitive
  carries a `style?` escape hatch, and none of them accepts a prop that leaks
  across the split.

- **A new feature needs a home before it needs a route.** Every route
  addition — sidebar entry on desktop, directory entry on phone — answers two
  questions in the PR body before it lands:

  1. **Where does it live?** Which of the phone's five tabs (HOME · WORTH ·
     SPENDING · UPCOMING · DIRECTORY) OR which desktop sidebar section. The
     five tabs and the desktop sidebar are the app's structure, not
     decoration. A feature that cannot name a home is a feature without a
     job — the structure of the app is meant to answer "where would a user
     look for this."
  2. **What does it replace or extend?** A section inside an existing screen;
     a lens/segment inside a tab; a directory entry that opens a modal or a
     subscreen. A new route is the exception. The exception is argued for on
     its own merits — *"why can't this be a lens on WORTH", "why can't this
     be a section inside SPENDING", "why can't this open as a sheet from
     the directory".*

  The default is: a section inside an existing screen. A new URL is a claim
  that this feature is one of the ~20 things a user will ever look for by
  name. If it's not one of those twenty, it's chrome, and chrome doesn't
  get a URL.

  **Failure symptom, in this repo:** 40 routes on the phone, 30 of which
  cannot be found by a phone user without a search box; 30 entries in the
  desktop sidebar for the same reason. That is what produced the current
  shape — one feature at a time, each with a defensible argument for its
  own route, and the aggregate shape is unfindable. This rule is what
  stops the next iteration from producing it again.

  **Same discipline from the other direction:** the Mobile Amendment
  (`artifacts/finance-tracker/src/index.css:82`) requires that every screen
  has *"at least one thing the user can do, not only read."* A screen
  without a job doesn't earn a home; a home without a job doesn't earn a
  URL. The two rules meet in the middle.

## Design rules

`artifacts/finance-tracker/src/index.css` opens with the Anti-Vibe Constitution
(desktop) and the Mobile Amendment (below 768px). Both are binding. Check output
against the banned list before shipping; two design rounds were rejected for
using patterns named there.

Mobile signature devices, applied consistently: **dotted means not-yet-real**
(solid happened, dotted has not); **native currency first, converted second** on
every foreign value; and the **`fx` provenance mark** stating where a computed
figure came from. Value is encoded by length or area — depth is decoration and
never data. Eleven themes including a light one (`arctic`), so all colour comes
from `--ft-*` tokens and hierarchy comes from structure and scale, never hue.

## iOS build — scene lifecycle (TN3187)

`ios/App/App/{AppDelegate.swift, SceneDelegate.swift, Info.plist}` are
hand-edited to adopt Apple's UIScene lifecycle. Reason: iOS 27 fails to
launch any app built with the latest SDK that does not adopt scenes.

The SceneDelegate is a pure forwarder — every UISceneDelegate callback
calls `SceneDelegateProxy.shared` from `@capacitor/ios`. Capacitor 8.5.0
ships `CAPSceneDelegateProxy.swift` but its `cap add ios` template still
emits the pre-scene AppDelegate + Info.plist, so a fresh `cap add ios`
would overwrite the migration. `cap sync ios` is safe — it only writes
into `App/public/` and `App/capacitor.config.json`.

If Capacitor is upgraded and the template later gains scene support, the
hand-edited AppDelegate/SceneDelegate/Info.plist can be replaced by the
upstream template's equivalents. Until then, treat those three files as
load-bearing and preserve them across any regeneration.

The lock test `src/lib/ios-scene-adoption.lock.test.ts` asserts the three
files stay coherent — SceneDelegate is a forwarder, AppDelegate declares
`configurationForConnecting`, and the configuration NAME in the Swift
source matches `UISceneConfigurationName` in the plist. Name drift is the
silent failure this test exists to catch.

Also hand-edited to load `SceneDelegate.swift`: `ios/App/App.xcodeproj/project.pbxproj`
carries four references to the new file (PBXBuildFile, PBXFileReference,
the App group children, and the Sources build phase). Xcode will
re-serialise the file on any GUI edit — verify the file is still listed
in Sources after any Xcode-driven change.

## A hazard that has already bitten

`artifacts/finance-tracker/` used to contain its own `.git` — a dead Replit-era
repo with no remote. Any git command run from that directory silently targeted
it instead of the monorepo, and a `git reset --hard HEAD~1` there wiped 250+
working-tree files that existed only on disk. Removed 16 Aug 2026 and archived
to `~/Desktop/nested-git-archive-finance-tracker.tar.gz`.

If a git command produces a surprising result, run `git rev-parse
--show-toplevel` first and confirm which repo you are in. There is also a
worktree under `.claude/worktrees/` with its own `.git`, which is legitimate.

## How to work

These are corrections for mistakes that have actually happened here.

- **Verify against the repo, not against memory.** Line numbers go stale.
  Re-grep before citing one. A citation was once given as `MobileApp.tsx:143`
  when the pattern had moved to `:197`, and separately a precedent was invoked
  that did not exist at all.
- **Check the call site before changing a function.** A flaw was once found in
  `runPayoffStrategy` and fixed, when the only caller already guarded it
  correctly — the "fix" removed a working safeguard.
- **Measure, don't infer.** Use `grep -o … | wc -l` for occurrence counts;
  `grep -c` counts lines and understates. Verifying a proxy is not verifying the
  thing: an injected test element proves the CSS cascade works, not that the
  component renders.
- **Report a missed target in one plain line.** Do not bury it in a table of
  what did succeed, and never state a clean summary that the detail contradicts.
- **Never delete a call site, simplify markup, or adjust a value to move a
  metric.** If a target is unreachable, say so.
- **Do not fabricate a justification.** If a rule needs an exception, argue for
  it on its own merits.

## Verification before reporting done

`typecheck` clean, `test` green, and for UI work look at the actual rendered
result rather than reasoning about it. State what was stubbed and what the API
could not supply — that inventory is more valuable than the feature.

## Docs

| File | Read it when |
| --- | --- |
| `docs/BACKLOG.md` | deciding what to do next — the running task list |
| `docs/TARGET-PRODUCT.md` | the product being built toward, incl. the payments regulatory position |
| `docs/MOBILE-CONCEPT.md` | any mobile design or UI work |
| `docs/AI-DESIGN-TELLS.md` | before producing any design |
| `docs/STYLE-INVENTORY.md` | touching styling — 11,715 inline style objects, measured |
| `docs/MOBILE-INVENTORY.md` | mobile architecture and routing |

## Obsidian vault — memory layer

Thomas keeps his external memory at `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault_general`.
Read `hot.md`, then `AI-RULES.md`, then `index.md` (a router — pick an area, open that area index only).
Read `Atlas/Working-Preferences.md` for how he wants you to behave.
Write decisions, constraints and status changes back to it as they happen. Full spec in `~/.claude/CLAUDE.md`.
