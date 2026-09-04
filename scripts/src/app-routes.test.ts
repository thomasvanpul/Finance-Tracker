// Lock on the route-table parser behind `inspect`'s up-front route check.
//
// The check is only as good as the parse: if parseRoutePaths silently stops
// finding routes, assertRoutesKnown starts rejecting every real route (loud,
// fine), and if it silently starts finding too many it starts accepting the
// typo it exists to catch (quiet, not fine). Both directions are asserted
// here, against fixtures AND against the live App.tsx / PhoneShell.tsx.
//
// node:test rather than vitest — scripts/ has no test runner and adding one
// for six assertions is a dependency this package does not otherwise need.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoutePaths, knownRoutes, nearest, assertRoutesKnown, routeArgsFrom } from "./app-routes.js";

test("parses literal path= attributes", () => {
  const src = `
    function R() {
      return (<Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path={"/portfolio"}>{() => <Portfolio />}</Route>
        <Route component={NotFound} />
      </Switch>);
    }`;
  assert.deepEqual(parseRoutePaths(src), ["/", "/accounts", "/portfolio"]);
});

test("parses helper-declared arrays that emit path={path}", () => {
  const src = `
    export const WRAPPED_ROUTES: readonly string[] = ["/goals", "/pension"];
    export const DESKTOP_ONLY_ROUTES: readonly string[] = ["/business"];
    function B() { return (<><Route path="/worth" />{wrappedRoute("/goals", G, "G")}</>); }`;
  assert.deepEqual(parseRoutePaths(src), ["/business", "/goals", "/pension", "/worth"]);
});

test("ignores non-literal path values rather than inventing routes", () => {
  const src = `function B() { return <Route key={path} path={path} />; }`;
  assert.deepEqual(parseRoutePaths(src), []);
});

test("the live route tables are non-empty and differ by shell", () => {
  const desktop = knownRoutes("desktop");
  const mobile = knownRoutes("mobile");
  assert.ok(desktop.length > 20, `desktop parsed only ${desktop.length} routes`);
  assert.ok(mobile.length > 10, `mobile parsed only ${mobile.length} routes`);
  assert.ok(desktop.includes("/"), "desktop table is missing the dashboard route");
  assert.ok(mobile.includes("/"), "mobile table is missing the dashboard route");
  // The D5 shell invariant (App.tsx:205) is that every desktop route has a
  // PhoneShell entry, so mobile is a strict superset. The asymmetry that
  // makes the viewport-aware check worth having runs the other way: the
  // phone tabs have no desktop route at all.
  const desktopMissingFromMobile = desktop.filter((r) => !mobile.includes(r));
  assert.deepEqual(desktopMissingFromMobile, [], "D5 invariant broken — a desktop route has no phone entry");
  for (const tab of ["/directory", "/worth", "/spending", "/markets"]) {
    assert.ok(mobile.includes(tab), `phone tab ${tab} missing from the mobile table`);
    assert.ok(!desktop.includes(tab), `phone tab ${tab} unexpectedly in the desktop table`);
  }
});

test("the reported failure is now rejected, and the real route accepted", () => {
  // The exact invocation that screenshotted a 404 and exited 0.
  assert.throws(() => assertRoutesKnown(["/dashboard"], "desktop"), /unknown route/);
  assert.doesNotThrow(() => assertRoutesKnown(["/"], "desktop"));
  assert.throws(() => assertRoutesKnown(["/dashboard"], "mobile"), /unknown route/);
  // Right path, wrong shell — /directory is a phone tab with no desktop
  // route. Validating against the union of both tables would let it pass.
  assert.throws(() => assertRoutesKnown(["/directory"], "desktop"), /unknown route/);
  assert.doesNotThrow(() => assertRoutesKnown(["/directory"], "mobile"));
});

test("the failure names a plausible alternative, and stays quiet when it has none", () => {
  assert.deepEqual(nearest("/acounts", ["/accounts", "/tax", "/settings"], 1), ["/accounts"]);
  // The reported invocation. Nothing in the router is a plausible typo of
  // "/dashboard" — the correct answer is "/", which no edit distance finds.
  // Guessing anyway is the same defect this whole change is about.
  assert.deepEqual(nearest("/dashboard", knownRoutes("desktop")), []);
});

test("route args are read the way screenshot.ts reads them", () => {
  assert.deepEqual(routeArgsFrom(["--routes", "/a, /b", "--viewport", "desktop"]), {
    routes: ["/a", "/b"],
    viewport: "desktop",
  });
  // Defaults must match screenshot.ts's, or inspect validates a different
  // route than the one that gets screenshotted.
  assert.deepEqual(routeArgsFrom([]), { routes: ["/"], viewport: "mobile" });
});
