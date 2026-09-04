// One-command inspect step: bring the local stack up, screenshot the routes
// you changed, and print the PNG paths. The point is that a design change gets
// LOOKED AT before it is reported done — three consecutive cycles passed every
// automated check and were each wrong on screen.
//
// This wraps screenshot.ts's four-step prerequisite chain (two servers, a seed,
// then the harness) into one command, because four manual steps is enough
// friction that nobody does it mid-task.
//
//   pnpm --filter @workspace/scripts inspect -- --routes /dashboard,/accounts --viewport desktop
//
// Flags are passed straight through to screenshot.ts (--route/--routes,
// --theme/--themes, --viewport, --name).
//
// Ports: this kills whatever holds :3001 and :4321 and starts its own servers.
// CLAUDE.md is explicit that nothing depends on their uptime and that a stale
// server serves an old bundle at 200 — which no readiness probe can detect, so
// adopting an existing listener would silently screenshot yesterday's code.

import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { assertRoutesKnown, routeArgsFrom } from "./app-routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");

const API_PORT = Number(process.env.INSPECT_API_PORT ?? 3001);
const WEB_PORT = Number(process.env.INSPECT_WEB_PORT ?? 4321);
const API_BASE = `http://localhost:${API_PORT}`;
const WEB_BASE = `http://localhost:${WEB_PORT}`;

// api-server runs esbuild, then migrateAtBoot + verifySchemaAtBoot against Neon
// eu-west-2 before app.listen(). Build plus two transatlantic round-trips is
// why this is a poll with a generous deadline and not a sleep.
const API_READY_TIMEOUT_MS = 90_000;
const WEB_READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const SHUTDOWN_GRACE_MS = 3_000;

// ── Child process bookkeeping ────────────────────────────────────────────────
interface Server {
  readonly label: string;
  readonly child: ChildProcess;
  readonly log: string[];
}

const started: Server[] = [];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function tail(log: readonly string[], lines = 25): string {
  return log.join("").split("\n").slice(-lines).join("\n");
}

function spawnServer(label: string, cwd: string, command: string, args: string[], env: NodeJS.ProcessEnv): Server {
  // detached so we can signal the whole process group — `pnpm dev` forks a
  // child (esbuild, then `node dist/index.mjs`), and killing only the pnpm
  // process leaves that child holding the port.
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log: string[] = [];
  const capture = (chunk: Buffer): void => {
    log.push(chunk.toString("utf-8"));
    if (log.length > 400) log.shift();
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  const server: Server = { label, child, log };
  started.push(server);
  return server;
}

async function stopAll(): Promise<void> {
  for (const { label, child } of started) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
      console.log(`[inspect] stopped ${label}`);
    } catch {
      // already gone
    }
  }
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline && started.some((s) => s.child.pid !== undefined && s.child.exitCode === null)) {
    await sleep(POLL_INTERVAL_MS);
  }
  for (const { child } of started) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

// ── Ports ────────────────────────────────────────────────────────────────────
function pidsOnPort(port: number): number[] {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf-8" });
    return out.split("\n").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
}

async function claimPort(port: number): Promise<void> {
  const pids = pidsOnPort(port);
  if (pids.length === 0) return;
  console.log(`[inspect] :${port} held by pid ${pids.join(", ")} — killing (a stale server serves an old bundle at 200)`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // raced with its own exit
    }
  }
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (pidsOnPort(port).length > 0 && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
  }
  if (pidsOnPort(port).length > 0) {
    throw new Error(`:${port} is still held after SIGKILL — inspect it with: lsof -i :${port} -P -n`);
  }
}

// ── Readiness ────────────────────────────────────────────────────────────────
async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitReady(server: Server, url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${server.label} exited with code ${server.child.exitCode} before becoming ready\n\n${tail(server.log)}`);
    }
    if (await probe(url)) {
      console.log(`[inspect] ${server.label} ready (${url})`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${server.label} did not answer ${url} within ${timeoutMs / 1000}s\n\n${tail(server.log)}`);
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// The same sign-in call screenshot.ts makes, so a pass here proves the harness
// will authenticate rather than proving a proxy for it.
async function seedPresent(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_BASE },
      body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function runToCompletion(label: string, cwd: string, command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolveExit, rejectExit) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", rejectExit);
    child.on("exit", (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`${label} exited ${code}`));
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const passthrough = process.argv.slice(2);
  if (passthrough.length === 0) {
    throw new Error("nothing to inspect — pass --route /dashboard (all screenshot.ts flags are forwarded)");
  }

  // Before anything expensive. A mistyped route used to cost two dev server
  // boots, a Neon round-trip and a screenshot of the 404 page, and then
  // exited 0. Now it costs one file read and exits 1.
  const { routes, viewport } = routeArgsFrom(passthrough);
  assertRoutesKnown(routes, viewport);

  await claimPort(API_PORT);
  await claimPort(WEB_PORT);

  const api = spawnServer("api-server", resolve(REPO, "artifacts/api-server"), "pnpm", ["dev"], {});
  const web = spawnServer("vite", resolve(REPO, "artifacts/finance-tracker"), "pnpm", ["dev"], {
    PORT: String(WEB_PORT),
    BASE_PATH: "/",
  });

  await waitReady(api, `${API_BASE}/api/healthz`, API_READY_TIMEOUT_MS);
  await waitReady(web, `${WEB_BASE}/`, WEB_READY_TIMEOUT_MS);

  if (await seedPresent()) {
    console.log("[inspect] seed user present — skipping seed");
  } else {
    console.log("[inspect] seed user absent — seeding (idempotent, dev branch only)");
    await runToCompletion("seed:dev", resolve(REPO, "scripts"), "pnpm", ["run", "seed:dev"]);
    if (!(await seedPresent())) {
      throw new Error("seed ran but the seeded user still cannot sign in — the harness would fail at login");
    }
  }

  await runToCompletion("screenshot", resolve(REPO, "scripts"), "pnpm", ["run", "screenshot", "--", ...passthrough]);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stopAll().then(() => process.exit(130));
  });
}

main()
  .then(async () => {
    await stopAll();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error("[inspect] failed:", err instanceof Error ? err.message : err);
    await stopAll();
    process.exit(1);
  });
