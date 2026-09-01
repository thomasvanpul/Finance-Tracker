// Lock: iOS 27 scene lifecycle wiring stays coherent across three files.
//
// Apple TN3187: "Beginning in iOS 27 … apps built with the latest SDK must
// adopt the scene-based life cycle or they fail to launch." Adoption is
// three coupled pieces:
//
//   1. SceneDelegate.swift forwards every UISceneDelegate callback to
//      Capacitor's own CAPSceneDelegateProxy (which @capacitor/ios ships
//      as of 8.5.0). A scene delegate that reimplements rather than
//      forwards silently drops App.addListener('appUrlOpen'), universal
//      links, and cold-start URL delivery. That's the failure mode the
//      2026-09-01 diagnosis called out.
//   2. AppDelegate.swift declares application(_:configurationForConnecting:)
//      returning a UISceneConfiguration whose NAME matches the plist.
//   3. Info.plist declares UIApplicationSceneManifest with a
//      UISceneConfigurationName equal to the string in (2).
//
// Name drift between (2) and (3) is the classic silent failure — iOS
// falls back to a synthesized default scene delegate and the app launches
// with the wrong lifecycle. This test asserts the names match, and that
// the three pieces are all present, so a future edit to any one of them
// cannot silently break the launch path.
//
// This is a cheap file-content check, not a build/runtime check. It runs
// under Vitest with the rest of the JS suite (`pnpm test`).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const IOS_APP = join(dirname(__filename), "..", "..", "ios", "App", "App");

const sceneDelegate = readFileSync(join(IOS_APP, "SceneDelegate.swift"), "utf8");
const appDelegate = readFileSync(join(IOS_APP, "AppDelegate.swift"), "utf8");
const infoPlist = readFileSync(join(IOS_APP, "Info.plist"), "utf8");

describe("iOS 27 scene lifecycle wiring (TN3187)", () => {
  it("SceneDelegate.swift forwards willConnectTo, openURLContexts, and continue to SceneDelegateProxy.shared", () => {
    expect(sceneDelegate).toMatch(/^import Capacitor$/m);

    const forwardCalls = sceneDelegate.match(/SceneDelegateProxy\.shared\.scene\(/g) ?? [];
    expect(forwardCalls.length).toBe(3);

    expect(sceneDelegate).toMatch(/willConnectTo\s+session/);
    expect(sceneDelegate).toMatch(/openURLContexts\s+URLContexts/);
    expect(sceneDelegate).toMatch(/continue\s+userActivity/);
  });

  it("AppDelegate.swift returns a UISceneConfiguration and no longer handles URL/continue at app level", () => {
    expect(appDelegate).toMatch(/func application\([^)]*configurationForConnecting/);
    expect(appDelegate).toMatch(/UISceneConfiguration\(name:\s*"[^"]+"/);

    // These delegate methods are not called under UIScene — leaving them
    // in place would run stale code paths that duplicate the proxy.
    expect(appDelegate).not.toMatch(/func application\([^)]*open url:\s*URL/);
    expect(appDelegate).not.toMatch(/func application\([^)]*continue userActivity:/);
  });

  it("Info.plist declares UIApplicationSceneManifest with a UIWindowScene role", () => {
    expect(infoPlist).toMatch(/<key>UIApplicationSceneManifest<\/key>/);
    expect(infoPlist).toMatch(/<key>UIWindowSceneSessionRoleApplication<\/key>/);
    expect(infoPlist).toMatch(/<string>\$\(PRODUCT_MODULE_NAME\)\.SceneDelegate<\/string>/);
  });

  it("configuration NAME in AppDelegate matches UISceneConfigurationName in Info.plist", () => {
    const swiftName = appDelegate.match(/UISceneConfiguration\(name:\s*"([^"]+)"/)?.[1];
    const plistName = infoPlist.match(
      /<key>UISceneConfigurationName<\/key>\s*<string>([^<]+)<\/string>/,
    )?.[1];

    expect(swiftName).toBeDefined();
    expect(plistName).toBeDefined();
    expect(plistName).toBe(swiftName);
  });
});
