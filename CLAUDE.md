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

## Where things are

| Path | What |
| --- | --- |
| `artifacts/finance-tracker` | React SPA (Vite, wouter, TanStack Query) |
| `artifacts/api-server` | Express API |
| `lib/db` | drizzle schema. Every table carries `userId` — the app is multi-tenant |
| `docs/` | see the index at the bottom of this file |

Deploy: Vercel serves the SPA, with its project **root directory set to
`artifacts/finance-tracker`**, so that package's `vercel.json` is the live one
and the repo-root `vercel.json` is dead config. The API is on Railway; that
subscription is ending and the service needs rehosting. The database is Neon
(`eu-west-2`), **not** Railway, so losing Railway does not touch data.

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
- The app **cannot hold or convert money.** It can initiate a payment through a
  licensed provider, which the user approves in their own banking app. Never
  design or build an action implying otherwise. MYR and Maybank are read-only.

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
