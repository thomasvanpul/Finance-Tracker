# Deploying Fintrack (free tier)

This uses **Render** (hosts the app) + **Neon** (Postgres database), both free.

Claude can't create these accounts or click through their dashboards for you —
you'll need to do the account setup steps yourself. Everything else (config
files, code) is already prepared in this repo.

## 1. Database — Neon

1. Go to https://neon.tech, sign up (free, no card required).
2. Create a project. Copy the connection string it gives you (starts with `postgresql://...`).
   That's your `DATABASE_URL`.

## 2. Wise API token

1. Log into your Wise account → Settings → API tokens.
2. Generate a personal token. Copy it — that's your `WISE_API_TOKEN`.

## 3. Hosting — Render

1. Go to https://render.com, sign up (free), connect your GitHub account.
2. New → Web Service → pick this repo (`thomasvanpul/Finance-Tracker`).
3. Render should detect `render.yaml` in the repo root and pre-fill the service
   config (build/start commands). If it doesn't auto-detect, set manually:
   - Build command: `pnpm install --frozen-lockfile && pnpm run build`
   - Start command: `pnpm --filter @workspace/api-server run start`
   - Plan: Free
4. Set the environment variables Render asks for (marked `sync: false` in
   `render.yaml`, meaning you provide the value):
   - `DATABASE_URL` — from Neon (step 1)
   - `WISE_API_TOKEN` — from Wise (step 2)
   - `APP_PASSWORD` — pick any password; this gates the whole app
   - `SESSION_SECRET` — Render can auto-generate this (already configured to)
5. Deploy. First build takes a few minutes.
6. Once live, run the DB schema push **once** from your own machine (or Render's
   shell) pointed at the Neon `DATABASE_URL`:
   ```bash
   DATABASE_URL="<your neon url>" pnpm --filter @workspace/db run push
   ```
7. Render gives you a URL like `https://fintrack-xxxx.onrender.com` — that's
   your live app. Visit it, enter the `APP_PASSWORD` you set, and you're in.

## Notes

- Render's free web services spin down after ~15 minutes of inactivity and take
  ~30-60s to wake back up on the next request. Fine for personal use; annoying
  if you want it always-instant (upgrading to a paid Render plan removes this).
- Neon's free tier has no expiry, but does pause compute after inactivity too
  (wakes up automatically on the next query, small delay).
- If you ever rotate `SESSION_SECRET`, everyone's login cookie is invalidated -
  not a problem for a single-user app, just note you'll need to re-enter the
  password once.
