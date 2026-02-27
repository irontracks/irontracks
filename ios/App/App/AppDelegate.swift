import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        // Register notification categories with actions (rest timer)
        let skipAction = UNNotificationAction(
            identifier: "SKIP_REST",
            title: "Pular",
            options: [.foreground]
        )
        let add30Action = UNNotificationAction(
            identifier: "ADD_30S",
            title: "+30s",
            options: []
        )
        let restCategory = UNNotificationCategory(
            identifier: "REST_TIMER",
            actions: [skipAction, add30Action],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([restCategory])

        // Request notification permissions on first launch
        // This ensures the app appears in iOS Settings > Notifications
        var authOptions: UNAuthorizationOptions = [.alert, .sound, .badge]
        if #available(iOS 15.0, *) {
            authOptions.insert(.timeSensitive) // fura Focus Mode sem entitlement especial
        }
        center.requestAuthorization(options: authOptions) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            if let error = error {
                print("[IronTracks] Notification auth error: \(error.localizedDescription)")
            }
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // Background fetch handler
    func application(_ application: UIApplication, performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        completionHandler(.noData)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    // Show notifications even when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let categoryId = notification.request.content.categoryIdentifier
        let appState = UIApplication.shared.applicationState

        // REST_TIMER: se o app não está visível (ex: áudio em background com tela bloqueada),
        // retorna [] para que o iOS entregue a notificação na lock screen e acorde a tela.
        // Se o app está ativo (visível), mostra como banner in-app normalmente.
        if categoryId == "REST_TIMER" && appState != .active {
            completionHandler([])
            return
        }

        completionHandler([.banner, .sound, .badge])
    }

    // Handle notification action taps
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionIdentifier = response.actionIdentifier
        let notificationId = response.notification.request.identifier

        // Post to JS via NotificationCenter so the Capacitor plugin can forward it
        NotificationCenter.default.post(
            name: NSNotification.Name("IronTracksNotificationAction"),
            object: nil,
            userInfo: ["actionId": actionIdentifier, "notificationId": notificationId]
        )
        completionHandler()
    }
}
