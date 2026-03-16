import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var pluginRegistered = false

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // UIScene lifecycle adoption for iPadOS 26+ compatibility.
        // Capacitor manages the WKWebView internally via CAPBridgeViewController.
        // We only need to anchor the window to the new scene here.
        guard let windowScene = scene as? UIWindowScene else { return }
        window?.windowScene = windowScene
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Register the Capacitor plugin once the scene is active and the bridge is ready.
        guard !pluginRegistered else { return }
        if let vc = window?.rootViewController as? CAPBridgeViewController,
           let bridge = vc.bridge {
            bridge.registerPluginInstance(IronTracksNativePlugin())
            pluginRegistered = true
            print("⚡ [IronTracks] IronTracksNativePlugin registered via SceneDelegate")
        }
    }

    func sceneDidDisconnect(_ scene: UIScene) {}

    func sceneWillResignActive(_ scene: UIScene) {}

    func sceneWillEnterForeground(_ scene: UIScene) {}

    func sceneDidEnterBackground(_ scene: UIScene) {}
}
