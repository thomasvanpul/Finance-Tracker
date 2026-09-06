ALTER TABLE "app_settings" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Backfill. Everyone who already has an app_settings row is an established
-- user and must not be asked the onboarding questions again.
--
-- The alternative — leave them NULL and treat NULL as "onboarded" for rows
-- that predate this migration — cannot be implemented, because after the
-- migration there is nothing on the row that distinguishes a pre-migration
-- NULL from a genuinely new one. updated_at does not help: it is
-- defaultNow() on insert and $onUpdate on write, so a fresh row and an old
-- row both carry a recent-looking value, and hard-coding this migration's
-- wall-clock time into the read path is the magic constant this design was
-- chosen to avoid. Resolving it once here, as data, is the only way NULL
-- means one thing afterwards.
--
-- updated_at is an approximation of when these users chose — the real
-- instant was never recorded. Only the non-NULL-ness is load-bearing: the
-- wire surface is the boolean PersonaState.onboarded, so the approximate
-- instant is never shown.
UPDATE "app_settings" SET "onboarded_at" = "updated_at" WHERE "onboarded_at" IS NULL;
