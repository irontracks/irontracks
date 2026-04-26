import ActivityKit
import AppIntents

// ── Interactive lock-screen buttons for the RestTimer Live Activity ────────────
//
// iOS 17.0+ only — on earlier versions the buttons simply don't appear.
//
// StartSetIntent  — opens the IronTracks app so the user can start the next set.
//                   The overlay (RestTimerOverlay) is still visible inside the app;
//                   the user taps START there to begin exercising.
//
// DismissTimerIntent — ends the Live Activity immediately without opening the app.
//                      Useful when the user just wants to clear the lock-screen banner.
// ─────────────────────────────────────────────────────────────────────────────

@available(iOS 17.0, *)
struct StartSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Iniciar Série"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks para iniciar a próxima série.")
    /// Opens the app when the button is tapped.
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        // The Live Activity stays alive — the running app will end it once
        // the user taps START inside the overlay.
        return .result()
    }
}

@available(iOS 17.0, *)
struct DismissTimerIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "OK"
    static var description: IntentDescription? = IntentDescription("Dispensa o aviso de descanso.")
    /// Does NOT open the app — just clears the lock-screen banner.
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
