// The app's own route table, read out of the app's own source.
//
// Why this exists: `inspect --routes /dashboard` screenshotted the 404 page
// and exited 0. The dashboard is at `/`. A design harness that reports
// success on a 404 is the exact failure mode it exists to prevent — it is
// the same shape as a migrator printing "migrations applied successfully"
// while applying nothing. A tool that cannot fail loudly is worse than no
// tool, because its output gets trusted.
//
// Two defences were added. This module is the first one: a requested route
// is checked against the router's own list BEFORE two dev servers are
// started, so a typo costs a second rather than ninety. The second lives in
// screenshot.ts, which asserts what actually rendered before writing a PNG
// (the up-front check cannot catch a route that exists but renders the 404
// component for some other reason).
//
// The route table is parsed from source rather than duplicated here, on the
// same reasoning as lock #18 (components/phone/wrapped-routes.lock.test.ts):
// a hand-copied list drifts silently, and a drifted allowlist is another
// tool that cannot fail loudly. `typescript` is resolved from the workspace
// root the same way that lock test resolves it.

import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");

export const APP_TSX = resolve(REPO, "artifacts/finance-tracker/src/App.tsx");
export const PHONE_SHELL_TSX = resolve(
  REPO,
  "artifacts/finance-tracker/src/components/phone/PhoneShell.tsx",
);

export type Viewport = "mobile" | "desktop";

// PhoneShell builds routes two ways: literal `<Route path="/worth">` JSX, and
// `wrappedRoute("/goals", …)` / `desktopOnlyRoute("/business", …)` helpers
// that emit `<Route key={path} path={path}>` from an array. The helper-built
// ones are invisible to a `path=` scan, so the two declaring arrays are read
// as well. Lock #18 already guarantees those arrays match their call sites.
const ROUTE_ARRAYS = new Set(["WRAPPED_ROUTES", "DESKTOP_ONLY_ROUTES"]);

function literalText(node: ts.Node | undefined): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isJsxExpression(node)) return literalText(node.expression);
  return null;
}

// Every route path a source file declares: `path=` JSX attributes with a
// literal value, plus the elements of the helper arrays above.
export function parseRoutePaths(source: string, fileName = "App.tsx"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const found: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "path") {
      const text = literalText(node.initializer);
      if (text !== null) found.push(text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ROUTE_ARRAYS.has(node.name.text) &&
      node.initializer !== undefined
    ) {
      // `as const` / `readonly string[]` wrap the array in an assertion.
      let init: ts.Node = node.initializer;
      while (ts.isAsExpression(init) || ts.isTypeAssertionExpression(init)) init = init.expression;
      if (ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          const text = literalText(el);
          if (text !== null) found.push(text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return [...new Set(found)].sort();
}

// Which shell resolves a route depends on the viewport: at phone widths
// App.tsx's <Switch> is never reached (`if (isMobile) return <PhoneShell />`),
// so /directory is real on mobile and a 404 on desktop, and /reports is the
// reverse. Validating against the union would let exactly the reported
// failure through.
export function knownRoutes(viewport: Viewport): string[] {
  const file = viewport === "mobile" ? PHONE_SHELL_TSX : APP_TSX;
  const routes = parseRoutePaths(readFileSync(file, "utf-8"), file);
  if (routes.length === 0) {
    throw new Error(
      `no routes parsed from ${file} — the route-table parser has gone stale against the router. ` +
        `Fix scripts/src/app-routes.ts rather than skipping the check.`,
    );
  }
  return routes;
}

// wouter patterns may carry params (`/tx/:id`). None do today, but matching
// on the pattern rather than the literal keeps this from rejecting a real
// URL the day one appears.
function matches(pattern: string, route: string): boolean {
  if (!pattern.includes(":") && !pattern.includes("*")) return pattern === route;
  const rx = new RegExp(
    "^" +
      pattern
        .split("/")
        .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg === "*" ? ".*" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/") +
      "$",
  );
  return rx.test(route);
}

function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

// Only suggest something a typo could plausibly have meant. An unbounded
// nearest-neighbour on short strings will confidently offer "/shared" for
// "/dashboard", which is the same defect in miniature: an output that reads
// as an answer when the tool has none.
export function nearest(route: string, candidates: readonly string[], take = 3): string[] {
  const budget = Math.max(2, Math.ceil(route.length / 3));
  return [...candidates]
    .map((c) => [c, distance(route, c)] as const)
    .filter(([, d]) => d <= budget)
    .sort((a, b) => a[1] - b[1])
    .slice(0, take)
    .map(([c]) => c);
}

// Throws naming the route, the shell that would have resolved it, and the
// closest real routes. Called before any server starts.
export function assertRoutesKnown(routes: readonly string[], viewport: Viewport): void {
  const known = knownRoutes(viewport);
  // A query string is not part of the route (`/settings?panel=x` is
  // /settings) — screenshot.ts already compares the landed path the same
  // way, so the pre-flight check must agree with it.
  const unknown = routes.filter((r) => !known.some((k) => matches(k, r.split("?")[0])));
  if (unknown.length === 0) return;
  const shell = viewport === "mobile" ? "PhoneShell.tsx" : "App.tsx";
  const detail = unknown
    .map((r) => {
      const guesses = nearest(r, known);
      return guesses.length > 0 ? `  ${r}  — did you mean ${guesses.join(", ")}?` : `  ${r}  — no close match`;
    })
    .join("\n");
  throw new Error(
    `unknown route${unknown.length > 1 ? "s" : ""} for --viewport ${viewport} ` +
      `(${shell} resolves this viewport; an unlisted path renders the 404 component):\n${detail}\n\n` +
      `${known.length} known routes: ${known.join(" ")}`,
  );
}

// The subset of screenshot.ts's CLI that inspect.ts needs in order to
// validate before spawning servers. Deliberately duplicates only the two
// flags that decide route resolution; screenshot.ts remains the owner of
// the full flag set.
export function routeArgsFrom(argv: readonly string[]): { routes: string[]; viewport: Viewport } {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const routes = get("--routes");
  const route = get("--route");
  const viewport = (get("--viewport") ?? "mobile") as Viewport;
  return {
    routes: routes ? routes.split(",").map((s) => s.trim()).filter(Boolean) : [route ?? "/"],
    viewport,
  };
}
