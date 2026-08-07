import UIKit
import Capacitor
import UserNotifications

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var pluginRegistered = false

    /// Zera o número no ícone do app assim que o app fica ativo (cold start OU
    /// volta do background). Antes o badge só sumia quando o usuário abria o
    /// sino dentro do app — quem só entrava e treinava ficava com "32" preso no
    /// ícone pra sempre.
    ///
    /// Zerar aqui NÃO marca nada como lido: as notificações continuam não-lidas
    /// no sino e na Central de Notificações do iOS. Quem impede o número de
    /// voltar cheio no próximo push é o `badge_cleared_at` do servidor (ver
    /// `useBadgeSeen` + `sendPushToUsers`); este trecho só cuida do device.
    private func clearIconBadge() {
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0, withCompletionHandler: nil)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // UIScene lifecycle adoption for iPadOS 26+ compatibility.
        // Capacitor manages the WKWebView internally via CAPBridgeViewController.
        // We only need to anchor the window to the new scene here.
        guard let windowScene = scene as? UIWindowScene else { return }
        window?.windowScene = windowScene
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Badge do ícone: sempre, a cada ativação (NÃO fica atrás do
        // `guard pluginRegistered`, senão só zeraria no primeiro launch).
        clearIconBadge()

        // Register the Capacitor plugin once the scene is active and the bridge is ready.
        guard !pluginRegistered else { return }
        if let vc = window?.rootViewController as? CAPBridgeViewController,
           let bridge = vc.bridge {
            bridge.registerPluginInstance(IronTracksNativePlugin())
            pluginRegistered = true
            print("⚡ [IronTracks] IronTracksNativePlugin registered via SceneDelegate")
        }
        // ProMotion (120 Hz) note: WKWebView on iOS 16+ already uses adaptive frame
        // rates for scrolling and CSS animations automatically — no explicit API is
        // required. CALayer.preferredFrameRateRange is not exposed in the Xcode 26 SDK
        // for WKWebView's layer, so the OS-driven adaptive rate is the correct path.
    }

    func sceneDidDisconnect(_ scene: UIScene) {}

    func sceneWillResignActive(_ scene: UIScene) {}

    func sceneWillEnterForeground(_ scene: UIScene) {}

    func sceneDidEnterBackground(_ scene: UIScene) {}
}
