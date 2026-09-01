// Hand-edited for iOS 27 scene adoption (Apple TN3187). Under scenes iOS
// no longer calls application(_:open:) or application(_:continue:) — those
// moved to SceneDelegate. The `configurationForConnecting` method below is
// required by TN3187 and its returned configuration NAME must match the
// UISceneConfigurationName under UIApplicationSceneManifest in Info.plist
// ("Default Configuration"). Name drift is a silent failure — the app
// launches with the wrong (or default synthesized) scene delegate and
// plugin events go missing. The lock test in
// src/lib/ios-scene-adoption.lock.test.ts asserts the three files stay in
// step (SceneDelegate exists and forwards, AppDelegate returns the same
// configuration name that Info.plist declares).
//
// `npx cap sync ios` does not touch this file. `npx cap add ios` would
// regenerate the ios/ scaffold from Capacitor's template, which still
// predates scenes as of @capacitor/ios 8.5.0 — reapply this file if that
// ever runs. See CLAUDE.md.

import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
