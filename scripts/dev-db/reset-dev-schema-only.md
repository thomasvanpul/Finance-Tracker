# Replace the `dev` database with one that holds no real data (BACKLOG § I10)

Written 4 Oct 2026. Status: **prepared, not run.** No Neon step below has been
executed — this machine has no Neon CLI and no API key. Steps 1–9 add things
and can be undone; step 10 permanently deletes data and is **Thomas's**.

This replaces the recipe in
`.review/archive/2026-10-04T0035-push-and-deploy-for-testers.report.md`. That
one reset `dev` from production — copying the real data in again — and then
truncated a table list written from memory. This one never copies a row.

## What is true today (measured 4 Oct 2026 with `dev-db:check`, against `dev`)

- `dev` (`br-cold-term-abp7fwtk`, host `ep-withered-night-abucoq17`) has 28
  tables, the same 28 the code declares; **21 hold rows**.
- **8 of its 17 users are not seed or tester accounts** — real people's rows.
- Its migration journal has 27 rows: every migration through
  `0026_drop_totp_credential`.

## What Neon's docs say (read 4 Oct 2026)

From <https://neon.com/docs/guides/branching-schema-only>:

- A schema-only branch "replicate[s] only the database schema from a source
  branch, without copying any of the actual data".
- Available on every plan. **Free: 3 root branches per project, 1 GB per
  schema-only branch**; "On the Free plan, all branches in a project share a
  total storage limit of 1 GB."
- "Schema-only branches are root branches. They do not have a parent branch."
  So **reset from parent is not supported**, and **restore "copies both schema
  and data"** from the source — see Hazards.
- "This feature is in Beta."
- Console: Branches → New branch → pick the parent → **Schema only** → Create.
  CLI: `neon branches create --schema-only` ("Requires exactly one read-write
  compute", <https://neon.com/docs/reference/cli-branches>).

From <https://neon.com/docs/manage/branches>: "Deleting a branch is a permanent
action. Deleting a branch also deletes the databases and roles that belong to
the branch as well as the compute associated with the branch." Every branch
gets its own compute and so its own `ep-…` host.

From <https://neon.com/docs/introduction/plans>: Free is 10 branches per
project and a 6-hour restore window. That matches what the main chat read in
the console at 01:25 (Free, 1 GB, 10 branches, one project).

The docs do not say whether roles or extensions come across, and do not say
whether the 6-hour restore window can bring back a deleted branch. Neither was
tested.

## The trap the old recipe did not know about

A schema-only branch copies production's tables and none of its rows —
including the rows of `drizzle.__drizzle_migrations`. The api-server runs
`migrateAtBoot` before it listens; with that journal empty it replays
`0000_*.sql`, whose first statement is a bare `CREATE TABLE "account"`, onto a
table that already exists, and the server exits. This is the "journal wiped
but tables present" case `artifacts/api-server/src/lib/migrate.ts` describes
from August. Step 5 fixes it by writing the journal rows drizzle itself would
have written, computed from `lib/db/drizzle/`.

That reasoning comes from reading drizzle-orm 0.45.2's migrator and the 0000
file; the failure itself was not reproduced.

## Steps

Run from the repo root. Stop the local api-server and any capture script first.

### 1. Check production's journal (read-only, Neon console)

SQL Editor, branch `production`:

```sql
SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations;
```

Expected: `27` and `1790997062732`. If the count is lower, find the entry in
`lib/db/drizzle/meta/_journal.json` whose `when` equals that `max(created_at)`
and pass its tag as `--through=<tag>` in step 5; the boot migrator then applies
the rest itself.

### 2. Create the schema-only branch

Console: Branches → New branch → parent `production` → name `dev-clean` →
tick **Schema only** → Create.

Or, with the CLI installed and authenticated:

```bash
neon branches create --name dev-clean --schema-only --project-id <PROJECT_ID>
```

The old `dev` branch is not touched.

### 3. Copy the new connection string

Console → Connect → branch `dev-clean`. Note its host id, the `ep-…` part
before `.eu-west-2`.

### 4. Point local development at it, keeping the old settings

```bash
cp lib/db/.env lib/db/.env.old-dev.backup
cp artifacts/api-server/.env artifacts/api-server/.env.old-dev.backup
```

Then change only the `DATABASE_URL=` line in `lib/db/.env` and
`artifacts/api-server/.env`. Both backups match `.env*` in `.gitignore`.
These two files are the only env files in the repo that name the old host.

### 5. Prove it is empty, then prime the journal

```bash
pnpm --filter @workspace/scripts run dev-db:check --expect=empty
pnpm --filter @workspace/scripts run dev-db:check --prime-journal
```

The first must end `OK --expect=empty: 0 rows in all 28 tables` and report no
table missing on either side. If it reports rows, stop: the branch is not
schema-only. The second must end `primed journal: 27 migrations recorded,
through 0026_drop_totp_credential` (or your `--through` tag). It refuses unless
every table the code declares is present, every table is empty and the journal
is empty, and it refuses production in any mode. Write `--expect=empty` with
the `=`; anything it does not recognise stops it rather than passing.

### 6. Update the host guard

`DEV_DB_HOST` and `PROD_DB_HOST` are declared once, in `lib/db/src/hosts.ts`,
and imported from `@workspace/db/hosts` by every script that guards a branch
(`scripts/src/seed-dev-user.ts`, `seed-testers.ts`, `backfill-tx-rates.ts`,
`verify-fx-drift.ts`, `verify-tx-rate-lock.ts`, `dev-db-schema-only.ts`) and
by `artifacts/api-server/src/ledger-shape.ts`. A host rotation is one edit.

```bash
NEW=ep-your-new-host-id
sed -i '' "s/ep-withered-night-abucoq17/$NEW/" lib/db/src/hosts.ts
rg -c "ep-withered-night-abucoq17" lib/db/src/hosts.ts
```

The last command must print nothing.

### 7. Boot the api-server on the new branch

```bash
pkill -f "dist/index.mjs"; cd artifacts/api-server && ENABLE_DEV_ROUTES=1 pnpm dev
```

It must log `database migrations: complete` and start listening on :3001. A
`relation "account" already exists` error means step 5 did not run. A schema
drift error means production's schema is behind the code: redo step 5 on a
fresh branch with the right `--through`.

### 8. Seed made-up data and prove nothing else is there

With the api-server from step 7 still running:

```bash
pnpm --filter @workspace/scripts run seed:dev
pnpm --filter @workspace/scripts run seed:testers:dev
pnpm --filter @workspace/scripts run dev-db:check --expect=fake-users
```

The last must end `OK --expect=fake-users: all 7 users are seed or tester
accounts` (one seed account plus six testers). `seed:testers:dev` appends new
passwords to `~/.atrium/numeris-testers.txt`; the older `dev` lines in that
file belong to accounts that no longer exist.

### 9. Gate, then commit the guard change

```bash
pnpm -r test && pnpm run typecheck
```

Commit the edited `lib/db/src/hosts.ts` on its own.

### Undo, at any point up to here

```bash
cp lib/db/.env.old-dev.backup lib/db/.env
cp artifacts/api-server/.env.old-dev.backup artifacts/api-server/.env
sed -i '' "s/$NEW/ep-withered-night-abucoq17/" lib/db/src/hosts.ts
```

Then delete the `dev-clean` branch in the console. Nothing on `dev` or
`production` was changed by steps 1–9.

### 10. THOMAS ONLY — delete the old `dev` branch

**This permanently removes the copy of production data. It cannot be undone.**
Do it only after step 8 passed and the app works against the new branch.

First confirm nothing local still points at it — this must print nothing:

```bash
rg -c "ep-withered-night-abucoq17" lib/db/.env artifacts/api-server/.env lib/db/src/hosts.ts
```

Console: Branches → `dev` (`br-cold-term-abp7fwtk`) → Delete. Or:

```bash
neon branches delete br-cold-term-abp7fwtk --project-id <PROJECT_ID>
```

Then remove the two `.env.old-dev.backup` files, which hold a credential for a
branch that no longer exists, and optionally rename `dev-clean` to `dev`.

### 11. Afterwards — the documents that still describe the old branch

- `docs/PRIVACY.md` — remove the `[BLOCKED: a copy of the production
  database…]` marker (line 271 on 4 Oct).
- `docs/DATA-INVENTORY.md:63-64` — the "copy-on-write clone of production
  carrying real data" entry.
- `CLAUDE.md:98-100` — branch id, and "carrying real data".
- `docs/BACKLOG.md` — I10 (rows 203 and 1838) and line 285.

## Hazards

- **Never use Restore on the new branch with production as the source.** The
  docs say a restore on a schema-only branch "copies both schema and data".
  That would put the real data straight back.
- The new branch is a root branch and counts toward the Free plan's 3.
- The feature is Beta. If the console refuses it, the fallback is a second
  Neon project with an empty database, letting `migrateAtBoot` build the
  schema from `0000`. That is untested: the journal was hand-baselined in
  August, so a replay from zero is not known to work.
- Later schema changes need nothing special. With the journal primed,
  `migrateAtBoot` applies each new migration to the new branch as it did to
  the old one.

## What was and was not verified

Verified here, 4 Oct: the helper's unit tests (journal rows equal what
drizzle's `readMigrationFiles` produces, timestamps strictly increase);
`dev-db:check` in report, `--expect=empty` and `--expect=fake-users` modes
against the current `dev` branch; its refusal of production and of priming a
non-empty database.

Not verified: every Neon step (2, 3, 10); the journal insert against a truly
empty database, since no local Postgres exists on this machine; that production's
journal count is 27 (step 1 checks it); the boot in step 7.
