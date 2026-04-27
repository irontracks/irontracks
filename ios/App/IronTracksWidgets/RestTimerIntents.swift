import ActivityKit
import AppIntents

// ── Interactive lock-screen buttons for the RestTimer Live Activity ────────────
//
// iOS 17.0+ only — on earlier versions the buttons simply don't appear.
//
// StartSetIntent  — opens the IronTracks app and fires the "start next set"
//                   action via NotificationCenter + UserDefaults so the JS layer
//                   can auto-dismiss the rest overlay without user input.
//
// DismissTimerIntent — ends the Live Activity immediately without opening the app.
// ─────────────────────────────────────────────────────────────────────────────

/// Notification name posted by StartSetIntent.perform() inside the App process.
/// IronTracksNativePlugin observes this and relays it to JS via notifyListeners.
let IronTracksStartSetNotification = NSNotification.Name("IronTracksStartSetFromWidget")

/// UserDefaults key used as a cold-start fallback (JS polls this on mount).
let IronTracksWidgetPendingActionKey = "it.widget.pendingAction"

@available(iOS 17.0, *)
struct StartSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Iniciar Série"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks para iniciar a próxima série.")
    /// Opens the app — perform() runs inside the App process, not the widget extension.
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        // 1. Write UserDefaults flag (cold-start fallback — JS reads this on mount)
        UserDefaults.standard.set("startSet", forKey: IronTracksWidgetPendingActionKey)
        // 2. Post notification so IronTracksNativePlugin can relay the event to JS
        //    immediately if the app was already running in the background.
        await MainActor.run {
            NotificationCenter.default.post(name: IronTracksStartSetNotification, object: nil)
        }
        return .result()
    }
}

@available(iOS 17.0, *)
struct DismissTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "OK"
    static var description: IntentDescription? = IntentDescription("Dispensa o aviso de descanso.")
    /// Does NOT open the app — runs in the widget extension process.
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        // End every RestTimer Live Activity immediately.
        for activity in Activity<RestTimerAttributes>.activities {
            await activity.end(dismissalPolicy: .immediate)
        }
        return .result()
    }
}
