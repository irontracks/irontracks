import UIKit
import Capacitor
import AVFoundation
import BackgroundTasks
import WidgetKit

/// Notification posted when iOS gives us a background slot. JS observes this via
/// the IronTracksNative plugin and runs the offline-sync + widget-refresh hooks.
let IronTracksBGRefreshNotification = NSNotification.Name("IronTracksBGRefreshFired")
let IronTracksBGSyncNotification    = NSNotification.Name("IronTracksBGSyncFired")

/// BGTaskScheduler identifiers — must match Info.plist BGTaskSchedulerPermittedIdentifiers
let IronTracksBGRefreshTaskID = "com.irontracks.app.refresh"
let IronTracksBGSyncTaskID    = "com.irontracks.app.sync"

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Allow background music (Spotify / Apple Music) to keep playing during workouts.
        // .playback + .mixWithOthers: our alarm / notification sounds blend in instead of
        // silencing other apps. .duckOthers briefly lowers background audio when we play.
        // Speech recognition temporarily overrides to .record and restores on completion.
        try? AVAudioSession.sharedInstance().setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers, .duckOthers, .allowAirPlay, .allowBluetoothA2DP]
        )
        try? AVAudioSession.sharedInstance().setActive(true)

        // ── BGTaskScheduler — register handlers BEFORE app finishes launching ──
        // iOS schedules these opportunistically (charging + Wi-Fi typically). Each
        // task gets ~30 s to run. We post NotificationCenter so the IronTracksNative
        // plugin can relay to JS, which actually performs the sync / refresh.
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: IronTracksBGRefreshTaskID,
            using: nil
        ) { task in
            self.handleAppRefresh(task: task as! BGAppRefreshTask)
        }
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: IronTracksBGSyncTaskID,
            using: nil
        ) { task in
            self.handleSync(task: task as! BGProcessingTask)
        }
        return true
    }

    // MARK: – Background tasks

    private func handleAppRefresh(task: BGAppRefreshTask) {
        // Schedule the next refresh BEFORE doing work — if we crash, at least the
        // chain continues. iOS picks the actual fire time based on usage patterns.
        scheduleNextAppRefresh()

        // Hand off to JS via Capacitor event with a 25 s timeout (BGAppRefresh
        // gives us ~30 s; we leave headroom for cleanup + WidgetCenter reload).
        let timeoutTask = DispatchWorkItem {
            task.setTaskCompleted(success: false)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: timeoutTask)

        task.expirationHandler = {
            timeoutTask.cancel()
            task.setTaskCompleted(success: false)
        }

        NotificationCenter.default.post(
            name: IronTracksBGRefreshNotification,
            object: nil,
            userInfo: ["taskId": IronTracksBGRefreshTaskID]
        )

        // Refresh widgets even if JS isn't running — WidgetCenter is safe in extensions
        WidgetCenter.shared.reloadAllTimelines()

        // Mark complete after a short window so JS has a chance to finish its work.
        // The JS side calls back via `bgTaskDidComplete` plugin method to flip this earlier.
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
            timeoutTask.cancel()
            task.setTaskCompleted(success: true)
        }
    }

    private func handleSync(task: BGProcessingTask) {
        scheduleNextSync()

        task.expirationHandler = {
            task.setTaskCompleted(success: false)
        }

        NotificationCenter.default.post(
            name: IronTracksBGSyncNotification,
            object: nil,
            userInfo: ["taskId": IronTracksBGSyncTaskID]
        )

        // BGProcessingTask gets up to ~3 min — generous timeout for offline-queue flushes.
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
            task.setTaskCompleted(success: true)
        }
    }

    /// Schedule the next opportunistic refresh. iOS is allowed to ignore this
    /// (battery saver, low storage, etc.) — at worst we miss a slot.
    func scheduleNextAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: IronTracksBGRefreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60) // 30 min
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Schedule the next offline-queue sync (heavier, only on power + network).
    func scheduleNextSync() {
        let request = BGProcessingTaskRequest(identifier: IronTracksBGSyncTaskID)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1 h
        try? BGTaskScheduler.shared.submit(request)
    }

    // MARK: – UIScene lifecycle delegation
    // With UIApplicationSceneManifest in Info.plist, UIKit calls these to provide
    // the configuration for each new scene session. Window management and plugin
    // registration are handled by SceneDelegate.

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication,
                     didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {}

    // MARK: – APNs token forwarding (required for @capacitor/push-notifications)
    // iOS calls these after UIApplication.registerForRemoteNotifications().
    // Without them the Capacitor plugin never receives the device token.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // MARK: – URL / Universal Links (remain here per Apple guidelines)
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
