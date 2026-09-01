// Hand-edited for iOS 27 scene adoption (Apple TN3187). Every method
// forwards to Capacitor's own SceneDelegateProxy (@capacitor/ios ships this
// as of 8.5.0) so that URL-scheme opens, universal links, and the deferred
// cold-start delivery via `capacitorViewDidAppear` all continue to reach
// AppPlugin as they did under the app-delegate path. Do NOT reimplement
// these methods locally — a hand-rolled scene delegate that skips the proxy
// is the "silently dead plugins" case (App.addListener('appUrlOpen'),
// universal links, cold-start URL open all stop firing).
//
// `npx cap sync ios` does not touch this file. `npx cap add ios` would
// regenerate the ios/ scaffold from Capacitor's template, which still
// predates scenes — reapply this file if that ever runs. See CLAUDE.md.

import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
