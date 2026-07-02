import Foundation
import Capacitor
import UIKit
import UserNotifications
import CoreMotion
import CoreLocation
import HealthKit
import Photos
import LocalAuthentication
import CoreSpotlight
import MobileCoreServices
import ActivityKit
import Speech
import AVFoundation
import StoreKit
import AppIntents
import BackgroundTasks
import WidgetKit
import SQLite3
import GroupActivities

// ─── IronTracksNative Capacitor Plugin ───────────────────────────────────────
@objc(IronTracksNativePlugin)
public class IronTracksNativePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {

    public let identifier = "IronTracksNativePlugin"
    public let jsName = "IronTracksNative"
    public let pluginMethods: [CAPPluginMethod] = [
        // Screen
        CAPPluginMethod(name: "setIdleTimerDisabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        // Notifications
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setupNotificationActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleRestTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelRestTimer", returnType: CAPPluginReturnPromise),
        // Live Activity
        CAPPluginMethod(name: "startRestLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRestLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRestLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAllRestLiveActivities", returnType: CAPPluginReturnPromise),
        // App notification
        CAPPluginMethod(name: "scheduleAppNotification", returnType: CAPPluginReturnPromise),
        // Alarm sound
        CAPPluginMethod(name: "stopAlarmSound", returnType: CAPPluginReturnPromise),
        // Haptics
        CAPPluginMethod(name: "triggerHaptic", returnType: CAPPluginReturnPromise),
        // Biometrics
        CAPPluginMethod(name: "checkBiometricsAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticateWithBiometrics", returnType: CAPPluginReturnPromise),
        // Spotlight
        CAPPluginMethod(name: "indexWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeWorkoutIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAllWorkoutIndexes", returnType: CAPPluginReturnPromise),
        // Accelerometer
        CAPPluginMethod(name: "startAccelerometer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAccelerometer", returnType: CAPPluginReturnPromise),
        // HealthKit
        CAPPluginMethod(name: "isHealthKitAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestHealthKitPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkoutToHealth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHealthSteps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRestingHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHRV", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveCalories", returnType: CAPPluginReturnPromise),
        // Photos
        CAPPluginMethod(name: "saveImageToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFileToPhotos", returnType: CAPPluginReturnPromise),
        // Voice
        CAPPluginMethod(name: "requestVoicePermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSpeechRecognition", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "stopSpeechRecognition", returnType: CAPPluginReturnPromise),
        // Widget intents
        CAPPluginMethod(name: "checkPendingWidgetAction", returnType: CAPPluginReturnPromise),
        // Story video composition (AVFoundation hardware-accelerated overlay)
        CAPPluginMethod(name: "composeStoryVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelStoryCompose", returnType: CAPPluginReturnPromise),
        // App Store review (SKStoreReviewController — respects Apple's per-year limit)
        CAPPluginMethod(name: "requestStoreReview", returnType: CAPPluginReturnPromise),
        // HealthKit sleep data
        CAPPluginMethod(name: "getSleepData", returnType: CAPPluginReturnPromise),
        // Workout Live Activity (session-level — exercise / set / volume / elapsed)
        CAPPluginMethod(name: "startWorkoutLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateWorkoutLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endWorkoutLiveActivity", returnType: CAPPluginReturnPromise),
        // App Intents (Siri shortcuts) — read pending action triggered by intent
        CAPPluginMethod(name: "checkPendingIntentAction", returnType: CAPPluginReturnPromise),
        // Geofencing — gym auto check-in (CLCircularRegion monitoring)
        CAPPluginMethod(name: "startGymGeofence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopGymGeofence", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkGeofenceStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlwaysLocationPermission", returnType: CAPPluginReturnPromise),
        // BGTaskScheduler — schedule next opportunistic refresh / sync
        CAPPluginMethod(name: "scheduleBackgroundTasks", returnType: CAPPluginReturnPromise),
        // App Shortcuts — push the user's recent workouts so AppEntity.suggestedEntities()
        // can surface them as Siri-suggested intents (no-op when array is empty).
        CAPPluginMethod(name: "updateSiriWorkoutSuggestions", returnType: CAPPluginReturnPromise),
        // Live Activity push tokens — captured at request time + on update
        CAPPluginMethod(name: "getLiveActivityPushTokens", returnType: CAPPluginReturnPromise),
        // SQLite3-backed native cache (Feature 16) — fast KV + offline queue
        CAPPluginMethod(name: "kvGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvDelete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvKeys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queuePut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueGetAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueDelete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvStoreStats", returnType: CAPPluginReturnPromise),
        // SharePlay — train together via FaceTime (Feature 18)
        CAPPluginMethod(name: "startSharePlayWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSharePlayWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendSharePlayMessage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSharePlayState", returnType: CAPPluginReturnPromise),
        // Watch (WatchConnectivity)
        CAPPluginMethod(name: "watchGetState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchSendDashboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchSendWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchSendNearestGyms", returnType: CAPPluginReturnPromise),
    ]

    private let motionManager = CMMotionManager()
    private let healthStore = HKHealthStore()

    // ── Geofencing state (gym auto check-in) ─────────────────────────────────
    /// Lazy CLLocationManager — only instantiated when JS calls a geofence method.
    /// Setting `delegate = self` is what wires didEnterRegion → notifyListeners.
    private lazy var locationManager: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        return m
    }()
    /// Pending always-permission request (resolved in didChangeAuthorization).
    private var pendingAlwaysAuthCall: CAPPluginCall?
    /// Throttle: don't fire more than one geofence notification per N seconds.
    private var lastGeofenceFireMs: Double = 0

    // ── Live Activity push tokens (captured at start, updated on rotation) ───
    /// Keyed by activity-kind so JS can correlate when sending to the backend.
    /// Values are hex strings ready for the APNs `apns-topic` header.
    /// Updated by Tasks observing each Activity's pushTokenUpdates async sequence.
    private var liveActivityPushTokens: [String: String] = [:]
    /// Tasks listening for token rotation — cancelled when activities end.
    private var liveActivityTokenObservers: [String: Task<Void, Never>] = [:]

    // ── SharePlay state (Feature 18) ─────────────────────────────────────────
    /// Active GroupSession when a SharePlay workout is running. Single session
    /// at a time — starting a new one ends the previous.
    /// `Any?` because GroupSession is iOS 15+ and we need to avoid forcing the
    /// whole class to be @available(iOS 15.0, *).
    private var sharePlaySession: Any?
    private var sharePlayMessenger: Any?
    /// Tasks observing the session lifecycle (state, participants, messages).
    /// Cancelled in `endSharePlayWorkout`.
    private var sharePlayObservers: [Task<Void, Never>] = []

    // ── Speech Recognition state ─────────────────────────────────────────────
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine = AVAudioEngine()
    private var speechCallId: String?

    /// Native task that marks the Live Activity as finished after `seconds` seconds.
    /// Runs independently of JS so the Dynamic Island / Lock Screen update even when
    /// the app is backgrounded and JavaScript execution is throttled by iOS.
    private var autoFinishTask: Task<Void, Never>? = nil

    /// On plugin load, end any stale Live Activities left from a previous session
    /// (e.g. app was killed while a rest timer was running).
    /// Also register observer so StartSetIntent can relay the "start set" action to JS.
    public override func load() {
        autoFinishTask?.cancel()
        autoFinishTask = nil
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<RestTimerAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
        // Observe the notification posted by StartSetIntent.perform() (App process only).
        // When received, relay the action to JS via Capacitor event and clear UserDefaults.
        NotificationCenter.default.addObserver(
            forName: IronTracksStartSetNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            UserDefaults.standard.removeObject(forKey: IronTracksWidgetPendingActionKey)
            self?.notifyListeners("widgetStartSet", data: [:])
        }
        // Observe Siri / Shortcuts App Intent triggers. The intent writes the action
        // name to UserDefaults and posts this notification — JS picks it up and
        // routes (open dashboard, open last workout, focus streak card, etc).
        NotificationCenter.default.addObserver(
            forName: IronTracksIntentActionNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let action = (note.userInfo?["action"] as? String) ?? ""
            UserDefaults.standard.removeObject(forKey: IronTracksIntentPendingActionKey)
            self?.notifyListeners("intentAction", data: ["action": action])
        }
        // Observe BGTaskScheduler firings — AppDelegate runs the actual task callback,
        // we just relay to JS so it can perform the actual sync / refresh logic.
        NotificationCenter.default.addObserver(
            forName: IronTracksBGRefreshNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("backgroundRefresh", data: ["kind": "refresh"])
        }
        NotificationCenter.default.addObserver(
            forName: IronTracksBGSyncNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("backgroundRefresh", data: ["kind": "sync"])
        }

        // ── Watch (WatchConnectivity) — instancia o bridge e observa eventos ──
        // O singleton ativa a WCSession no init.
        _ = WatchBridge.shared

        NotificationCenter.default.addObserver(
            forName: .watchSetLogged,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let payload = (note.userInfo?["payload"] as? String) ?? ""
            self?.notifyListeners("watchSetLogged", data: ["payload": payload])
        }
        NotificationCenter.default.addObserver(
            forName: .watchCardioFinished,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let payload = (note.userInfo?["payload"] as? String) ?? ""
            self?.notifyListeners("watchCardioFinished", data: ["payload": payload])
        }
        NotificationCenter.default.addObserver(
            forName: .watchRefreshRequested,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyListeners("watchRefreshRequested", data: [:])
        }
        NotificationCenter.default.addObserver(
            forName: .watchCheckinRequested,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let payload = (note.userInfo?["payload"] as? String) ?? ""
            self?.notifyListeners("watchCheckinRequested", data: ["payload": payload])
        }
        NotificationCenter.default.addObserver(
            forName: .watchReachabilityChanged,
            object: nil,
            queue: .main
        ) { [weak self] note in
            let info = note.userInfo as? [String: Any] ?? [:]
            self?.notifyListeners("watchReachabilityChanged", data: info.mapValues { "\($0)" })
        }
    }

    // ── Widget intent bridge ─────────────────────────────────────────────────

    /// Called by JS on mount as a cold-start fallback: reads and clears the
    /// UserDefaults flag written by StartSetIntent.perform() before the
    /// NotificationCenter observer could relay it (e.g. app was just launched).
    @objc func checkPendingWidgetAction(_ call: CAPPluginCall) {
        let action = UserDefaults.standard.string(forKey: IronTracksWidgetPendingActionKey) ?? ""
        if !action.isEmpty {
            UserDefaults.standard.removeObject(forKey: IronTracksWidgetPendingActionKey)
        }
        call.resolve(["action": action])
    }

    /// Cold-start fallback for App Intents: reads and clears the action set by an
    /// Intent that just opened the app. JS calls this on bootstrap to detect Siri
    /// triggers that fired before the NotificationCenter observer was attached.
    @objc func checkPendingIntentAction(_ call: CAPPluginCall) {
        let action = UserDefaults.standard.string(forKey: IronTracksIntentPendingActionKey) ?? ""
        if !action.isEmpty {
            UserDefaults.standard.removeObject(forKey: IronTracksIntentPendingActionKey)
        }
        call.resolve(["action": action])
    }

    // ─── Screen ────────────────────────────────────────────────────────────────

    @objc func setIdleTimerDisabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
        }
        call.resolve()
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        }
        call.resolve(["ok": true])
    }

    // ─── Notifications ─────────────────────────────────────────────────────────

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        // .timeSensitive é REQUIRED em runtime — a entitlement
        // com.apple.developer.usernotifications.time-sensitive sozinha não basta.
        // Sem isso o iOS rebaixa silenciosamente interruptionLevel=.timeSensitive
        // pra .active, suprimindo o alerta quando app está em background ou
        // Foco/DND ativo. Foi o que quebrou o aviso de fim do timer de descanso.
        // Commit 322e0304 removeu por engano (assumiu deprecação falsa — o option
        // foi INTRODUZIDO em iOS 15, não deprecado).
        var options: UNAuthorizationOptions = [.alert, .sound, .badge]
        if #available(iOS 15.0, *) {
            options.insert(.timeSensitive)
        }
        UNUserNotificationCenter.current().requestAuthorization(options: options) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    @objc func checkNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status: String
            switch settings.authorizationStatus {
            case .authorized: status = "granted"
            case .denied: status = "denied"
            case .notDetermined: status = "notDetermined"
            case .provisional: status = "provisional"
            case .ephemeral: status = "ephemeral"
            @unknown default: status = "unknown"
            }
            var result: [String: Any] = ["status": status]
            // timeSensitiveStatus: tells JS whether the user has disabled
            // Time Sensitive Notifications for this app in Settings.
            // "disabled" means iOS downgrades .timeSensitive → .active, which
            // breaks the screen-wake guarantee when Focus Mode is active.
            if #available(iOS 15.0, *) {
                let tsStatus: String
                switch settings.timeSensitiveSetting {
                case .enabled: tsStatus = "enabled"
                case .disabled: tsStatus = "disabled"
                case .notSupported: tsStatus = "notSupported"
                @unknown default: tsStatus = "unknown"
                }
                result["timeSensitiveStatus"] = tsStatus
            }
            call.resolve(result)
        }
    }

    @objc func setupNotificationActions(_ call: CAPPluginCall) {
        // options: [] means the action works directly on the lock screen without unlocking
        let restDoneAction = UNNotificationAction(
            identifier: "REST_DONE",
            title: "Iniciar Serie",
            options: []
        )
        let skipRestAction = UNNotificationAction(
            identifier: "SKIP_REST",
            title: "Pular Descanso",
            options: []
        )
        let restCategory = UNNotificationCategory(
            identifier: "REST_TIMER",
            actions: [restDoneAction, skipRestAction],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([restCategory])
        call.resolve()
    }

    @objc func scheduleRestTimer(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? "rest_timer"
        let seconds = call.getInt("seconds") ?? 60
        let title = call.getString("title") ?? "IronTracks"
        let body = call.getString("body") ?? "Descanso encerrado — hora de treinar!"
        let repeatCount = call.getInt("repeatCount") ?? 0
        let repeatEvery = call.getInt("repeatEverySeconds") ?? 5

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        // Alarme sonoro CUSTOM (~8s) empacotado no app — toca com o app ABERTO
        // (presentationOptions inclui .sound) E com a tela BLOQUEADA. Substitui o
        // "ding" fraco do UNNotificationSound.default.
        content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "rest_alarm.wav"))
        content.categoryIdentifier = "REST_TIMER"
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        // ★ Cancel any previous notifications with this ID before scheduling new ones
        var cancelIds = [id]
        for i in 1...60 { cancelIds.append("\(id)_repeat_\(i)") }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: cancelIds)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: cancelIds)

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, seconds)), repeats: false)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                call.reject("Failed to schedule notification: \(error.localizedDescription)")
                return
            }
            // Schedule repeat notifications if requested
            if repeatCount > 0 {
                for i in 1...min(repeatCount, 60) {
                    let repeatTrigger = UNTimeIntervalNotificationTrigger(
                        timeInterval: TimeInterval(seconds + i * repeatEvery), repeats: false)
                    let repeatContent = UNMutableNotificationContent()
                    repeatContent.title = title
                    repeatContent.body = body
                    repeatContent.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: "rest_alarm.wav"))
                    repeatContent.categoryIdentifier = "REST_TIMER"
                    if #available(iOS 15.0, *) {
                        repeatContent.interruptionLevel = .timeSensitive
                    }
                    let repeatRequest = UNNotificationRequest(
                        identifier: "\(id)_repeat_\(i)", content: repeatContent, trigger: repeatTrigger)
                    UNUserNotificationCenter.current().add(repeatRequest, withCompletionHandler: nil)
                }
            }
            call.resolve()
        }
    }

    @objc func cancelRestTimer(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? "rest_timer"
        var ids = [id]
        for i in 1...60 { ids.append("\(id)_repeat_\(i)") }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
        call.resolve()
    }

    @objc func scheduleAppNotification(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? UUID().uuidString
        let title = call.getString("title") ?? ""
        let body = call.getString("body") ?? ""
        let delay = call.getInt("delaySeconds") ?? 0

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = UNNotificationSound.default
        // Match scheduleRestTimer: time-sensitive wakes the screen and bypasses Focus Mode.
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, delay)), repeats: false)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { _ in
            call.resolve(["id": id])
        }
    }

    // ─── Live Activity (Dynamic Island + Lock Screen) ─────────────────────────

    @objc func startRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let id       = call.getString("id")      ?? "rest"
            let seconds  = call.getInt("seconds")    ?? 60
            let title    = call.getString("title")   ?? ""
            // workoutStartMs: Unix epoch ms of when the workout session began.
            // If absent or zero, fall back to now (workout just started).
            let workoutStartMs = call.getDouble("workoutStartMs") ?? 0.0
            let workoutStartDate = workoutStartMs > 0
                ? Date(timeIntervalSince1970: workoutStartMs / 1000.0)
                : Date()

            // Cancel any pending auto-finish from a previous timer
            autoFinishTask?.cancel()
            autoFinishTask = nil

            Task { @MainActor in
                // End ALL existing activities before starting a new one
                // (covers ghost activities from killed sessions)
                for activity in Activity<RestTimerAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }

                let endDate = Date().addingTimeInterval(Double(seconds))
                let attrs = RestTimerAttributes(timerID: id, exerciseName: title, workoutStartDate: workoutStartDate)
                let state = RestTimerAttributes.ContentState(
                    endDate: endDate,
                    targetSeconds: seconds,
                    isFinished: false
                )
                do {
                    // staleDate = 5 minutes after timer ends — generous window so the
                    // finished state remains visible even if the app is slow to update.
                    let staleDate = endDate.addingTimeInterval(300)
                    let content = ActivityContent(state: state, staleDate: staleDate)
                    // pushType: .token = ask APNs to issue a push token so the backend
                    // can update this activity remotely (used by Feature 11).
                    let activity = try Activity<RestTimerAttributes>.request(
                        attributes: attrs,
                        content: content,
                        pushType: .token
                    )
                    self.observePushToken(activity: activity, kind: "rest")
                    call.resolve(["activityId": activity.id])
                } catch {
                    print("[IronTracks] Live Activity start failed: \(error.localizedDescription)")
                    call.resolve(["activityId": ""])
                    return
                }

                // ── Native auto-finish: update the Live Activity when the timer ends ──
                // This fires even when JS is backgrounded/throttled by iOS, ensuring the
                // Dynamic Island and Lock Screen switch to the "Hora de Treinar!" state.
                let capturedId = id
                let capturedEndDate = endDate
                let capturedSeconds = seconds
                self.autoFinishTask = Task {
                    // Sleep until the timer ends (wall-clock — survives backgrounding)
                    let nsDelay = UInt64(max(1, seconds)) * 1_000_000_000
                    try? await Task.sleep(nanoseconds: nsDelay)
                    guard !Task.isCancelled else { return }

                    let finishedState = RestTimerAttributes.ContentState(
                        endDate: capturedEndDate,
                        targetSeconds: capturedSeconds,
                        isFinished: true
                    )
                    // Keep the finished state visible for 5 minutes
                    let finishedContent = ActivityContent(
                        state: finishedState,
                        staleDate: Date().addingTimeInterval(300)
                    )
                    for activity in Activity<RestTimerAttributes>.activities
                        where activity.attributes.timerID == capturedId {
                        await activity.update(finishedContent)
                    }
                }
            }
        } else {
            call.resolve()
        }
    }

    @objc func updateRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let id            = call.getString("id")           ?? "rest"
            let targetSeconds = call.getInt("targetSeconds")   ?? 60
            let isFinished    = call.getBool("isFinished")     ?? false
            // endDateMs: Unix timestamp in ms sent from JS (for +30 s support)
            // If absent, reconstruct from secondsRemaining
            let endDate: Date
            if let ms = call.getDouble("endDateMs"), ms > 0 {
                endDate = Date(timeIntervalSince1970: ms / 1000.0)
            } else {
                let secondsRemaining = call.getInt("secondsRemaining") ?? 0
                endDate = isFinished
                    ? Date().addingTimeInterval(-1)          // slightly in the past = finished
                    : Date().addingTimeInterval(Double(max(0, secondsRemaining)))
            }

            let state = RestTimerAttributes.ContentState(
                endDate: endDate,
                targetSeconds: targetSeconds,
                isFinished: isFinished
            )
            // When finished: keep visible for 5 min. When running: end of timer + 5 min.
            let staleDate = isFinished
                ? Date().addingTimeInterval(300)
                : endDate.addingTimeInterval(300)
            let content = ActivityContent(state: state, staleDate: staleDate)
            Task {
                for activity in Activity<RestTimerAttributes>.activities
                    where activity.attributes.timerID == id {
                    await activity.update(content)
                }
            }
            call.resolve()
        } else {
            call.resolve()
        }
    }

    @objc func endRestLiveActivity(_ call: CAPPluginCall) {
        // Cancel the native auto-finish task so it doesn't fire on a dead activity
        autoFinishTask?.cancel()
        autoFinishTask = nil
        if #available(iOS 16.2, *) {
            let id = call.getString("id") ?? "rest"
            Task {
                for activity in Activity<RestTimerAttributes>.activities
                    where activity.attributes.timerID == id {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
            call.resolve()
        } else {
            call.resolve()
        }
    }

    @objc func endAllRestLiveActivities(_ call: CAPPluginCall) {
        // Cancel the native auto-finish task
        autoFinishTask?.cancel()
        autoFinishTask = nil
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<RestTimerAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
            call.resolve()
        } else {
            call.resolve()
        }
    }

    // ─── Workout Live Activity (session-level) ────────────────────────────────
    //
    // Tracks the entire workout session — not just the rest timer. Shows the
    // current exercise, set progress (e.g. "3/4"), total volume in kg and an
    // elapsed timer that the system drives autonomously via Date.distantFuture.
    // Coexists with the rest-timer LA: iOS displays both stacked on the lock
    // screen, with the rest LA briefly taking the Dynamic Island during rests.

    @objc func startWorkoutLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let workoutName    = call.getString("workoutName") ?? "Treino"
            let workoutStartMs = call.getDouble("workoutStartMs") ?? 0.0
            let exerciseName   = call.getString("currentExerciseName") ?? ""
            let setIndex       = call.getInt("currentSetIndex") ?? 1
            let setsForEx      = call.getInt("totalSetsForExercise") ?? 0
            let setsCompleted  = call.getInt("totalSetsCompleted") ?? 0
            let totalVolumeKg  = call.getDouble("totalVolumeKg") ?? 0.0

            let startDate = workoutStartMs > 0
                ? Date(timeIntervalSince1970: workoutStartMs / 1000.0)
                : Date()

            Task { @MainActor in
                // End any stale workout LA from a previous session before starting
                for activity in Activity<WorkoutLiveActivityAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
                let attrs = WorkoutLiveActivityAttributes(
                    workoutName: workoutName,
                    workoutStartDate: startDate
                )
                let state = WorkoutLiveActivityAttributes.ContentState(
                    currentExerciseName: exerciseName,
                    currentSetIndex: setIndex,
                    totalSetsForExercise: setsForEx,
                    totalSetsCompleted: setsCompleted,
                    totalVolumeKg: totalVolumeKg
                )
                // staleDate = 12 h after start (safety cap; far longer than any workout)
                let staleDate = startDate.addingTimeInterval(12 * 3600)
                let content = ActivityContent(state: state, staleDate: staleDate)
                do {
                    // pushType: .token enables remote updates via APNs (Feature 11).
                    let activity = try Activity<WorkoutLiveActivityAttributes>.request(
                        attributes: attrs,
                        content: content,
                        pushType: .token
                    )
                    self.observeWorkoutPushToken(activity: activity, kind: "workout")
                    call.resolve(["activityId": activity.id])
                } catch {
                    print("[IronTracks] Workout LA start failed: \(error.localizedDescription)")
                    call.resolve(["activityId": ""])
                }
            }
        } else {
            call.resolve(["activityId": ""])
        }
    }

    @objc func updateWorkoutLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let exerciseName  = call.getString("currentExerciseName") ?? ""
            let setIndex      = call.getInt("currentSetIndex") ?? 1
            let setsForEx     = call.getInt("totalSetsForExercise") ?? 0
            let setsCompleted = call.getInt("totalSetsCompleted") ?? 0
            let totalVolumeKg = call.getDouble("totalVolumeKg") ?? 0.0

            let state = WorkoutLiveActivityAttributes.ContentState(
                currentExerciseName: exerciseName,
                currentSetIndex: setIndex,
                totalSetsForExercise: setsForEx,
                totalSetsCompleted: setsCompleted,
                totalVolumeKg: totalVolumeKg
            )
            let staleDate = Date().addingTimeInterval(12 * 3600)
            let content = ActivityContent(state: state, staleDate: staleDate)
            Task {
                for activity in Activity<WorkoutLiveActivityAttributes>.activities {
                    await activity.update(content)
                }
            }
            call.resolve()
        } else {
            call.resolve()
        }
    }

    @objc func endWorkoutLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            Task { [weak self] in
                for activity in Activity<WorkoutLiveActivityAttributes>.activities {
                    await activity.end(dismissalPolicy: .immediate)
                }
                await MainActor.run {
                    self?.liveActivityPushTokens.removeValue(forKey: "workout")
                    self?.liveActivityTokenObservers["workout"]?.cancel()
                    self?.liveActivityTokenObservers.removeValue(forKey: "workout")
                }
            }
            call.resolve()
        } else {
            call.resolve()
        }
    }

    // ─── Live Activity push tokens (Feature 11) ──────────────────────────────
    //
    // For APNs to update a Live Activity remotely the server needs the per-
    // activity pushToken. The token rotates over the lifetime of the activity,
    // so we observe pushTokenUpdates and emit a "liveActivityPushToken" event
    // whenever it changes. JS forwards each token to the backend so the server
    // can target a specific Dynamic Island / Lock Screen banner.

    @available(iOS 16.2, *)
    private func observePushToken(activity: Activity<RestTimerAttributes>, kind: String) {
        liveActivityTokenObservers[kind]?.cancel()
        liveActivityTokenObservers[kind] = Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                await MainActor.run {
                    self?.liveActivityPushTokens[kind] = hex
                    self?.notifyListeners("liveActivityPushToken", data: [
                        "kind": kind,
                        "activityId": activity.id,
                        "token": hex,
                    ])
                }
            }
        }
    }

    @available(iOS 16.2, *)
    private func observeWorkoutPushToken(activity: Activity<WorkoutLiveActivityAttributes>, kind: String) {
        liveActivityTokenObservers[kind]?.cancel()
        liveActivityTokenObservers[kind] = Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                await MainActor.run {
                    self?.liveActivityPushTokens[kind] = hex
                    self?.notifyListeners("liveActivityPushToken", data: [
                        "kind": kind,
                        "activityId": activity.id,
                        "token": hex,
                    ])
                }
            }
        }
    }

    @objc func getLiveActivityPushTokens(_ call: CAPPluginCall) {
        // Returns a snapshot — JS can poll on resume in case it missed an event.
        var tokens: [[String: String]] = []
        for (kind, token) in liveActivityPushTokens {
            tokens.append(["kind": kind, "token": token])
        }
        call.resolve(["tokens": tokens])
    }

    // ─── Native cache — SQLite3-backed KV + Queue (Feature 16) ───────────────
    //
    // Bridge methods that delegate to IronTracksKVStore.shared (defined at the
    // bottom of this file). All work runs on the store's serial queue, so the
    // plugin call returns immediately after we resolve the Capacitor promise.

    @objc func kvGet(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        guard !key.isEmpty else { call.resolve(["value": NSNull(), "exists": false]); return }
        let value = IronTracksKVStore.shared.kvGet(key)
        if let v = value {
            call.resolve(["value": v, "exists": true])
        } else {
            call.resolve(["value": NSNull(), "exists": false])
        }
    }

    @objc func kvSet(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        let value = call.getString("value") ?? ""
        guard !key.isEmpty else { call.resolve(["ok": false]); return }
        let ok = IronTracksKVStore.shared.kvSet(key, value: value)
        call.resolve(["ok": ok])
    }

    @objc func kvDelete(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        let ok = IronTracksKVStore.shared.kvDelete(key)
        call.resolve(["ok": ok])
    }

    @objc func kvKeys(_ call: CAPPluginCall) {
        let prefix = call.getString("prefix")
        let limit = call.getInt("limit") ?? 5000
        let keys = IronTracksKVStore.shared.kvKeys(prefix: prefix, limit: limit)
        call.resolve(["keys": keys])
    }

    @objc func queuePut(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let payload = call.getString("payload") ?? ""
        let status = call.getString("status")
        let attempts = call.getInt("attempts")
        let nextAttemptAt = call.getDouble("nextAttemptAt").map { Int64($0) }
        guard !id.isEmpty, !payload.isEmpty else { call.resolve(["ok": false]); return }
        let ok = IronTracksKVStore.shared.queuePut(
            id: id, payload: payload, status: status,
            attempts: attempts, nextAttemptAt: nextAttemptAt
        )
        call.resolve(["ok": ok])
    }

    @objc func queueGetAll(_ call: CAPPluginCall) {
        let limit = call.getInt("limit") ?? 1000
        let payloads = IronTracksKVStore.shared.queueGetAll(limit: limit)
        call.resolve(["payloads": payloads])
    }

    @objc func queueDelete(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let ok = IronTracksKVStore.shared.queueDelete(id)
        call.resolve(["ok": ok])
    }

    @objc func queueClear(_ call: CAPPluginCall) {
        let ok = IronTracksKVStore.shared.queueClear()
        call.resolve(["ok": ok])
    }

    @objc func kvStoreStats(_ call: CAPPluginCall) {
        let stats = IronTracksKVStore.shared.stats()
        call.resolve(stats as PluginCallResultData)
    }

    // ─── SharePlay — train together via FaceTime (Feature 18) ────────────────
    //
    // Bridge to the GroupActivities framework. The flow:
    //   1. JS calls startSharePlayWorkout({ workoutId, workoutName, hostName })
    //   2. We instantiate WorkoutSharePlayActivity and call .activate()
    //   3. iOS prompts the user (when in FaceTime) to "Start" — if accepted, we
    //      receive a GroupSession and pair it with a Messenger.
    //   4. JS calls sendSharePlayMessage({ type, payload }) → messenger.send(...)
    //   5. Incoming messages → notifyListeners("sharePlayMessage", ...)
    //   6. State / participant changes → notifyListeners("sharePlayState", ...)
    //
    // When NOT in a FaceTime call, .activate() returns false and JS shows a
    // hint asking the user to start a FaceTime first.

    @objc func startSharePlayWorkout(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["ok": false, "error": "ios15_required"]); return
        }
        let workoutId   = call.getString("workoutId") ?? ""
        let workoutName = call.getString("workoutName") ?? "Treino"
        let hostName    = call.getString("hostName") ?? ""
        guard !workoutId.isEmpty else {
            call.resolve(["ok": false, "error": "missing_workoutId"]); return
        }

        Task { [weak self] in
            guard let self = self else { return }
            // End any previous session before activating a new one.
            await self.teardownSharePlay()

            let activity = WorkoutSharePlayActivity(
                workoutId: workoutId,
                workoutName: workoutName,
                hostName: hostName
            )
            do {
                let activated = try await activity.activate()
                if !activated {
                    // User dismissed the prompt OR no FaceTime call active.
                    call.resolve(["ok": false, "error": "not_activated"])
                    return
                }
                // Wait for the session iOS hands us once at least one peer joins.
                self.beginObservingSharePlaySessions()
                call.resolve(["ok": true])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func endSharePlayWorkout(_ call: CAPPluginCall) {
        Task { [weak self] in
            await self?.teardownSharePlay()
            call.resolve(["ok": true])
        }
    }

    @objc func sendSharePlayMessage(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve(["ok": false, "error": "ios15_required"]); return
        }
        guard let messenger = self.sharePlayMessenger as? GroupSessionMessenger else {
            call.resolve(["ok": false, "error": "no_active_session"]); return
        }
        let type = call.getString("type") ?? ""
        let payload = call.getObject("payload") ?? [:]
        guard !type.isEmpty else {
            call.resolve(["ok": false, "error": "missing_type"]); return
        }

        // Encode payload as a JSON string — Swift Codable can't represent arbitrary
        // [String: Any], but JS can decode the string trivially.
        var payloadString = "{}"
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let str = String(data: data, encoding: .utf8) {
            payloadString = str
        }

        let message = WorkoutSharePlayMessage(
            type: type,
            payloadJSON: payloadString,
            sentAtMs: Int64(Date().timeIntervalSince1970 * 1000)
        )

        Task {
            do {
                try await messenger.send(message)
                call.resolve(["ok": true])
            } catch {
                call.resolve(["ok": false, "error": error.localizedDescription])
            }
        }
    }

    @objc func getSharePlayState(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) {
            if let session = self.sharePlaySession as? GroupSession<WorkoutSharePlayActivity> {
                let participantCount = session.activeParticipants.count
                call.resolve([
                    "active": true,
                    "participantCount": participantCount,
                    "workoutId": session.activity.workoutId,
                    "workoutName": session.activity.workoutName,
                    "hostName": session.activity.hostName,
                ])
                return
            }
        }
        call.resolve(["active": false, "participantCount": 0])
    }

    /// Observes GroupActivities for any SharePlay sessions matching our activity type.
    /// Called once after activate() succeeds. The async sequence yields each new
    /// session — typically one per FaceTime call — and we wire it up.
    @available(iOS 15.0, *)
    private func beginObservingSharePlaySessions() {
        // Cancel existing observers (defensive — teardownSharePlay should have run).
        for t in sharePlayObservers { t.cancel() }
        sharePlayObservers.removeAll()

        let task = Task { [weak self] in
            for await session in WorkoutSharePlayActivity.sessions() {
                guard let self = self else { return }
                await MainActor.run {
                    self.attach(session: session)
                }
            }
        }
        sharePlayObservers.append(task)
    }

    @available(iOS 15.0, *)
    @MainActor
    private func attach(session: GroupSession<WorkoutSharePlayActivity>) {
        self.sharePlaySession = session
        let messenger = GroupSessionMessenger(session: session)
        self.sharePlayMessenger = messenger

        // Forward every state change so JS can show a banner / participant chip.
        let stateTask = Task { [weak self] in
            for await state in session.$state.values {
                let stateStr: String
                switch state {
                case .waiting:    stateStr = "waiting"
                case .joined:     stateStr = "joined"
                case .invalidated: stateStr = "invalidated"
                @unknown default: stateStr = "unknown"
                }
                await MainActor.run {
                    self?.notifyListeners("sharePlayState", data: [
                        "state": stateStr,
                        "workoutId": session.activity.workoutId,
                    ])
                }
            }
        }
        sharePlayObservers.append(stateTask)

        // Forward participant changes (name list + count).
        let participantsTask = Task { [weak self] in
            for await participants in session.$activeParticipants.values {
                await MainActor.run {
                    self?.notifyListeners("sharePlayParticipants", data: [
                        "count": participants.count,
                    ])
                }
            }
        }
        sharePlayObservers.append(participantsTask)

        // Forward incoming messages — JS decodes payloadJSON itself.
        let messagesTask = Task { [weak self] in
            for await (message, context) in messenger.messages(of: WorkoutSharePlayMessage.self) {
                await MainActor.run {
                    self?.notifyListeners("sharePlayMessage", data: [
                        "type": message.type,
                        "payloadJSON": message.payloadJSON,
                        "sentAtMs": Double(message.sentAtMs),
                        "fromParticipantId": context.source.id.uuidString,
                    ])
                }
            }
        }
        sharePlayObservers.append(messagesTask)

        session.join()
    }

    @available(iOS 15.0, *)
    private func teardownSharePlayInner() async {
        for t in sharePlayObservers { t.cancel() }
        sharePlayObservers.removeAll()
        if let session = sharePlaySession as? GroupSession<WorkoutSharePlayActivity> {
            session.end()
        }
        sharePlaySession = nil
        sharePlayMessenger = nil
    }

    private func teardownSharePlay() async {
        if #available(iOS 15.0, *) {
            await teardownSharePlayInner()
        }
    }

    // ─── Geofencing — gym auto check-in (Feature 6) ──────────────────────────
    //
    // Monitors a CLCircularRegion (~100 m) around the user's favourite gym.
    // didEnterRegion fires even when the app is killed (iOS launches us with
    // launchOptions.location set). We post a local notification asking the
    // user to start their workout — toggle is opt-in via Settings.

    @objc func requestAlwaysLocationPermission(_ call: CAPPluginCall) {
        let status = locationManager.authorizationStatus
        if status == .authorizedAlways {
            call.resolve(["status": "authorizedAlways"])
            return
        }
        if status == .denied || status == .restricted {
            call.resolve(["status": "denied"])
            return
        }
        // Request "always" — iOS may show only a "while-using" prompt first,
        // then require the user to upgrade in Settings later. We resolve the
        // call from didChangeAuthorization once iOS reaches a terminal state.
        pendingAlwaysAuthCall = call
        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else {
            // We already have whenInUse — request the upgrade.
            locationManager.requestAlwaysAuthorization()
        }
    }

    @objc func startGymGeofence(_ call: CAPPluginCall) {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
            call.resolve(["ok": false, "error": "monitoring_unavailable"])
            return
        }
        let lat    = call.getDouble("lat") ?? 0
        let lng    = call.getDouble("lng") ?? 0
        let radius = call.getDouble("radius") ?? 120 // metres — small enough to avoid false fires
        let name   = call.getString("name") ?? "Academia"
        guard lat != 0, lng != 0 else {
            call.resolve(["ok": false, "error": "invalid_coordinates"])
            return
        }
        // Stop any previously monitored gym so we never accumulate stale regions.
        for region in locationManager.monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
        let region = CLCircularRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            radius: radius,
            identifier: "irontracks.gym"
        )
        region.notifyOnEntry = true
        region.notifyOnExit  = false
        locationManager.startMonitoring(for: region)

        // Persist gym name so didEnterRegion can render a personalised notif
        // even on cold-start (the JS layer may not be running at that point).
        UserDefaults.standard.set(name, forKey: "irontracks.geofence.gymName")
        UserDefaults.standard.set(lat,  forKey: "irontracks.geofence.lat")
        UserDefaults.standard.set(lng,  forKey: "irontracks.geofence.lng")
        call.resolve(["ok": true])
    }

    @objc func stopGymGeofence(_ call: CAPPluginCall) {
        for region in locationManager.monitoredRegions {
            locationManager.stopMonitoring(for: region)
        }
        UserDefaults.standard.removeObject(forKey: "irontracks.geofence.gymName")
        UserDefaults.standard.removeObject(forKey: "irontracks.geofence.lat")
        UserDefaults.standard.removeObject(forKey: "irontracks.geofence.lng")
        call.resolve(["ok": true])
    }

    @objc func checkGeofenceStatus(_ call: CAPPluginCall) {
        let active = !locationManager.monitoredRegions.isEmpty
        let auth = locationManager.authorizationStatus
        let authStr: String
        switch auth {
        case .authorizedAlways:    authStr = "authorizedAlways"
        case .authorizedWhenInUse: authStr = "authorizedWhenInUse"
        case .denied:              authStr = "denied"
        case .restricted:          authStr = "restricted"
        case .notDetermined:       authStr = "notDetermined"
        @unknown default:          authStr = "unknown"
        }
        call.resolve([
            "active": active,
            "authorization": authStr,
            "gymName": UserDefaults.standard.string(forKey: "irontracks.geofence.gymName") ?? "",
        ])
    }

    // CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        guard let pending = pendingAlwaysAuthCall else { return }
        switch status {
        case .authorizedAlways:
            pending.resolve(["status": "authorizedAlways"])
            pendingAlwaysAuthCall = nil
        case .authorizedWhenInUse:
            // Got whenInUse — escalate to always now (system prompt step 2).
            manager.requestAlwaysAuthorization()
            // Don't clear pendingAlwaysAuthCall — wait for the next callback.
        case .denied, .restricted:
            pending.resolve(["status": "denied"])
            pendingAlwaysAuthCall = nil
        case .notDetermined:
            break
        @unknown default:
            pending.resolve(["status": "unknown"])
            pendingAlwaysAuthCall = nil
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == "irontracks.gym" else { return }
        // Throttle: ignore re-entries within 4 hours so a user who steps in/out of
        // the door doesn't get spammed. iOS already filters near-instant re-fires
        // but we add an app-level guard for the long tail.
        let nowMs = Date().timeIntervalSince1970 * 1000
        if nowMs - lastGeofenceFireMs < 4 * 60 * 60 * 1000 { return }
        lastGeofenceFireMs = nowMs

        let gymName = UserDefaults.standard.string(forKey: "irontracks.geofence.gymName") ?? "Academia"
        // Local notification (works even when app is killed and JS isn't running).
        let content = UNMutableNotificationContent()
        content.title = "Você está na \(gymName)"
        content.body  = "Toque para iniciar seu treino do dia."
        content.sound = .default
        content.userInfo = ["type": "gym_geofence", "gymName": gymName]
        content.categoryIdentifier = "GYM_GEOFENCE"
        let request = UNNotificationRequest(
            identifier: "irontracks.geofence.notif.\(Int(nowMs))",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
        // Relay to JS (if app happens to be running, no-op otherwise)
        notifyListeners("gymGeofenceEntered", data: ["gymName": gymName])
    }

    public func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        notifyListeners("gymGeofenceError", data: [
            "regionId": region?.identifier ?? "",
            "error": error.localizedDescription,
        ])
    }

    // ─── BGTaskScheduler — schedule next refresh / sync (Feature 15) ─────────

    @objc func scheduleBackgroundTasks(_ call: CAPPluginCall) {
        // AppDelegate exposes static helpers — call via the shared delegate.
        DispatchQueue.main.async {
            if let delegate = UIApplication.shared.delegate as? AppDelegate {
                delegate.scheduleNextAppRefresh()
                delegate.scheduleNextSync()
            }
            // Reload widgets too — callers usually invoke this on app pause.
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve(["ok": true])
        }
    }

    // ─── App Shortcuts dynamic suggestions (Feature 19) ──────────────────────
    //
    // JS calls this with the user's ~5 most-recent / favourite workouts so the
    // SuggestedWorkoutEntity below can return them from suggestedEntities().
    // Stored in the App Group so the AppEntity (which may run in a separate
    // process for Spotlight indexing) can read them too.

    @objc func updateSiriWorkoutSuggestions(_ call: CAPPluginCall) {
        let workouts = call.getArray("workouts") ?? []
        // Each entry: { id: string, name: string }
        var serialised: [[String: String]] = []
        for w in workouts {
            if let dict = w as? [String: Any],
               let id = dict["id"] as? String,
               let name = dict["name"] as? String,
               !id.isEmpty, !name.isEmpty {
                serialised.append(["id": id, "name": name])
            }
        }
        if let data = try? JSONSerialization.data(withJSONObject: serialised) {
            UserDefaults.standard.set(data, forKey: "irontracks.siri.suggestedWorkouts")
        }
        // Tell the system to refresh shortcut suggestions
        if #available(iOS 16.0, *) {
            IronTracksAppShortcuts.updateAppShortcutParameters()
        }
        call.resolve(["ok": true, "count": serialised.count])
    }

    // ─── Alarm Sound ───────────────────────────────────────────────────────────

    // No-op INTENCIONAL: hoje NÃO existe um alarme sonoro NATIVO tocando em
    // background pra ser parado. O loop de beep/vibração do fim de descanso é
    // in-JS (WebView); com o app em background o iOS emite só 1 notificação local.
    // Este método fica como ponto de extensão pra quando/se um alarme de background
    // for implementado (exigiria AVAudioSession + background audio mode + teste em
    // device físico). Até lá, resolver sem efeito é o comportamento correto.
    @objc func stopAlarmSound(_ call: CAPPluginCall) {
        call.resolve()
    }

    // ─── Haptics ───────────────────────────────────────────────────────────────

    @objc func triggerHaptic(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "medium"
        DispatchQueue.main.async {
            switch style {
            case "light":
                let gen = UIImpactFeedbackGenerator(style: .light)
                gen.prepare(); gen.impactOccurred()
            case "heavy":
                let gen = UIImpactFeedbackGenerator(style: .heavy)
                gen.prepare(); gen.impactOccurred()
            case "rigid":
                let gen = UIImpactFeedbackGenerator(style: .rigid)
                gen.prepare(); gen.impactOccurred()
            case "soft":
                let gen = UIImpactFeedbackGenerator(style: .soft)
                gen.prepare(); gen.impactOccurred()
            case "success":
                let gen = UINotificationFeedbackGenerator()
                gen.prepare(); gen.notificationOccurred(.success)
            case "warning":
                let gen = UINotificationFeedbackGenerator()
                gen.prepare(); gen.notificationOccurred(.warning)
            case "error":
                let gen = UINotificationFeedbackGenerator()
                gen.prepare(); gen.notificationOccurred(.error)
            case "selection":
                let gen = UISelectionFeedbackGenerator()
                gen.prepare(); gen.selectionChanged()
            default: // medium
                let gen = UIImpactFeedbackGenerator(style: .medium)
                gen.prepare(); gen.impactOccurred()
            }
        }
        call.resolve()
    }

    // ─── Biometrics ────────────────────────────────────────────────────────────

    @objc func checkBiometricsAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let biometryType: String
        if #available(iOS 11.0, *) {
            switch context.biometryType {
            case .faceID: biometryType = "faceID"
            case .touchID: biometryType = "touchID"
            default: biometryType = "none"
            }
        } else {
            biometryType = available ? "touchID" : "none"
        }
        call.resolve(["available": available, "biometryType": biometryType])
    }

    @objc func authenticateWithBiometrics(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Autenticar no IronTracks"
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            if success {
                call.resolve(["success": true, "error": ""])
            } else {
                let msg = error?.localizedDescription ?? "Authentication failed"
                call.resolve(["success": false, "error": msg])
            }
        }
    }

    // ─── Spotlight ─────────────────────────────────────────────────────────────

    @objc func indexWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let title = call.getString("title") else {
            call.reject("id and title are required"); return
        }
        let attributes = CSSearchableItemAttributeSet(contentType: .text)
        attributes.title = title
        attributes.contentDescription = call.getString("subtitle") ?? "Treino IronTracks"
        let dateMs = call.getDouble("dateMs")
        if let ms = dateMs { attributes.contentCreationDate = Date(timeIntervalSince1970: ms / 1000) }
        let item = CSSearchableItem(uniqueIdentifier: "irontracks_workout_\(id)",
                                    domainIdentifier: "com.irontracks.workout",
                                    attributeSet: attributes)
        CSSearchableIndex.default().indexSearchableItems([item]) { _ in call.resolve() }
    }

    @objc func removeWorkoutIndex(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: ["irontracks_workout_\(id)"]) { _ in
            call.resolve()
        }
    }

    @objc func clearAllWorkoutIndexes(_ call: CAPPluginCall) {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["com.irontracks.workout"]) { _ in
            call.resolve()
        }
    }

    // ─── Accelerometer ─────────────────────────────────────────────────────────

    @objc func startAccelerometer(_ call: CAPPluginCall) {
        let interval = (call.getInt("intervalMs") ?? 100)
        guard motionManager.isAccelerometerAvailable else {
            call.reject("Accelerometer not available"); return
        }
        motionManager.accelerometerUpdateInterval = Double(interval) / 1000.0
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let data = data else { return }
            self?.notifyListeners("accelerometer", data: [
                "x": data.acceleration.x,
                "y": data.acceleration.y,
                "z": data.acceleration.z,
            ])
        }
        call.resolve()
    }

    @objc func stopAccelerometer(_ call: CAPPluginCall) {
        motionManager.stopAccelerometerUpdates()
        call.resolve()
    }

    // ─── HealthKit ─────────────────────────────────────────────────────────────

    @objc func isHealthKitAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestHealthKitPermission(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "error": "HealthKit not available on this device"])
            return
        }
        let writeTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        ]
        let readTypes: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.workoutType(),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
        ]
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            let errMsg = error?.localizedDescription ?? ""
            call.resolve(["granted": success, "error": errMsg])
        }
    }

    @objc func saveWorkoutToHealth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["saved": false, "error": "HealthKit not available"]); return
        }
        let startMs = call.getDouble("startMs") ?? 0
        let endMs = call.getDouble("endMs") ?? 0
        let calories = call.getDouble("calories") ?? 0

        let startDate = Date(timeIntervalSince1970: startMs / 1000)
        let endDate = Date(timeIntervalSince1970: endMs / 1000)

        var samples: [HKSample] = []
        if calories > 0, let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
            let energyQuantity = HKQuantity(unit: .kilocalorie(), doubleValue: calories)
            let energySample = HKQuantitySample(type: energyType, quantity: energyQuantity,
                                                start: startDate, end: endDate)
            samples.append(energySample)
        }

        let workout = HKWorkout(activityType: .traditionalStrengthTraining,
                                start: startDate, end: endDate,
                                workoutEvents: nil,
                                totalEnergyBurned: calories > 0 ? HKQuantity(unit: .kilocalorie(), doubleValue: calories) : nil,
                                totalDistance: nil,
                                metadata: ["HKMetadataKeySource": "IronTracks"])

        healthStore.save(workout) { success, error in
            if !success {
                call.resolve(["saved": false, "error": error?.localizedDescription ?? "Unknown error"])
                return
            }
            if !samples.isEmpty {
                self.healthStore.add(samples, to: workout) { _, _ in }
            }
            call.resolve(["saved": true, "error": ""])
        }
    }

    @objc func getHealthSteps(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            call.resolve(["steps": 0]); return
        }
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { _, result, _ in
            let steps = Int(result?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0)
            call.resolve(["steps": steps])
        }
        healthStore.execute(query)
    }

    // ── Heart Rate (latest sample — typically from Apple Watch) ──────────────

    @objc func getHeartRate(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            call.resolve(["bpm": 0, "timestamp": 0]); return
        }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: hrType, predicate: nil, limit: 1,
                                  sortDescriptors: [sortDescriptor]) { _, results, _ in
            guard let sample = results?.first as? HKQuantitySample else {
                call.resolve(["bpm": 0, "timestamp": 0]); return
            }
            let bpm = sample.quantity.doubleValue(for: HKUnit(from: "count/min"))
            let ts = sample.endDate.timeIntervalSince1970 * 1000
            call.resolve(["bpm": Int(bpm), "timestamp": ts])
        }
        healthStore.execute(query)
    }

    // ── Resting Heart Rate (daily average — computed by Apple Watch) ────────

    @objc func getRestingHeartRate(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let rhrType = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) else {
            call.resolve(["bpm": 0, "timestamp": 0]); return
        }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: rhrType, predicate: nil, limit: 1,
                                  sortDescriptors: [sortDescriptor]) { _, results, _ in
            guard let sample = results?.first as? HKQuantitySample else {
                call.resolve(["bpm": 0, "timestamp": 0]); return
            }
            let bpm = sample.quantity.doubleValue(for: HKUnit(from: "count/min"))
            let ts = sample.endDate.timeIntervalSince1970 * 1000
            call.resolve(["bpm": Int(bpm), "timestamp": ts])
        }
        healthStore.execute(query)
    }

    // ── Heart Rate Variability (SDNN — computed during sleep by Watch) ──────

    @objc func getHRV(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let hrvType = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            call.resolve(["sdnn": 0, "timestamp": 0]); return
        }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: hrvType, predicate: nil, limit: 1,
                                  sortDescriptors: [sortDescriptor]) { _, results, _ in
            guard let sample = results?.first as? HKQuantitySample else {
                call.resolve(["sdnn": 0, "timestamp": 0]); return
            }
            let sdnn = sample.quantity.doubleValue(for: HKUnit.secondUnit(with: .milli))
            let ts = sample.endDate.timeIntervalSince1970 * 1000
            call.resolve(["sdnn": sdnn, "timestamp": ts])
        }
        healthStore.execute(query)
    }

    // ── Active Calories burned today ────────────────────────────────────────

    @objc func getActiveCalories(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let calType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) else {
            call.resolve(["calories": 0]); return
        }
        let calendar = Calendar.current
        let now = Date()
        let startOfDay = calendar.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: calType, quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { _, result, _ in
            let cals = Int(result?.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? 0)
            call.resolve(["calories": cals])
        }
        healthStore.execute(query)
    }

    // ─── Voice Permissions ─────────────────────────────────────────────────────
    //
    // webkitSpeechRecognition in WKWebView requires TWO separate iOS permissions:
    //   1. Microphone  — AVAudioSession.requestRecordPermission
    //   2. SpeechRecognition — SFSpeechRecognizer.requestAuthorization
    //
    // Both must be "authorized" before recognition.start() can succeed.
    // This method requests them in sequence and returns the combined status so the
    // JS layer can decide whether to proceed or prompt the user to open Settings.

    @objc func requestVoicePermissions(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
            if !micGranted {
                call.resolve(["microphone": "denied", "speechRecognition": "denied"])
                return
            }
            SFSpeechRecognizer.requestAuthorization { status in
                let speech: String
                switch status {
                case .authorized:             speech = "granted"
                case .denied, .restricted:    speech = "denied"
                case .notDetermined:          speech = "undetermined"
                @unknown default:             speech = "undetermined"
                }
                call.resolve(["microphone": "granted", "speechRecognition": speech])
            }
        }
    }

    // ─── Photos ────────────────────────────────────────────────────────────────

    @objc func saveImageToPhotos(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64") else {
            call.reject("base64 is required"); return
        }
        let cleanBase64 = base64.components(separatedBy: ",").last ?? base64
        guard let data = Data(base64Encoded: cleanBase64),
              let image = UIImage(data: data) else {
            call.resolve(["saved": false, "error": "Invalid base64 image data"]); return
        }
        PHPhotoLibrary.requestAuthorization { status in
            guard status == .authorized || status == .limited else {
                call.resolve(["saved": false, "error": "Photo library access denied"]); return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }) { success, error in
                call.resolve(["saved": success, "error": error?.localizedDescription ?? ""])
            }
        }
    }

    @objc func saveFileToPhotos(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("path is required"); return
        }
        let isVideo = call.getBool("isVideo") ?? false
        let url = URL(fileURLWithPath: path)
        PHPhotoLibrary.requestAuthorization { status in
            guard status == .authorized || status == .limited else {
                call.resolve(["saved": false, "error": "Photo library access denied"]); return
            }
            PHPhotoLibrary.shared().performChanges({
                if isVideo {
                    PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
                } else {
                    PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: url)
                }
            }) { success, error in
                call.resolve(["saved": success, "error": error?.localizedDescription ?? ""])
            }
        }
    }

    // ─── Native Speech Recognition ────────────────────────────────────────────
    //
    // Uses SFSpeechRecognizer + AVAudioEngine to perform on-device speech
    // recognition. This bypasses the unreliable webkitSpeechRecognition in
    // WKWebView. Results are streamed back to JS via keepAlive callbacks.

    @objc func startSpeechRecognition(_ call: CAPPluginCall) {
        call.keepAlive = true
        speechCallId = call.callbackId
        let lang = call.getString("lang") ?? "pt-BR"

        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: lang))

        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            call.resolve(["error": "speech_unavailable"])
            return
        }

        // Stop any previous session
        stopRecognitionEngine()

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            call.resolve(["error": "request_init_failed"])
            return
        }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            try audioEngine.start()
        } catch {
            call.resolve(["error": "audio_engine_failed", "message": error.localizedDescription])
            return
        }

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let result = result {
                let transcript = result.bestTranscription.formattedString
                let isFinal = result.isFinal
                call.resolve([
                    "transcript": transcript,
                    "isFinal": isFinal,
                ])
                if isFinal {
                    self.stopRecognitionEngine()
                }
            }

            if let error = error {
                let nsError = error as NSError
                // Code 1110 = no speech detected (normal timeout), 216 = cancelled
                if nsError.code != 216 {
                    call.resolve([
                        "error": "recognition_error",
                        "message": error.localizedDescription,
                        "code": nsError.code,
                    ])
                }
                self.stopRecognitionEngine()
            }
        }
    }

    @objc func stopSpeechRecognition(_ call: CAPPluginCall) {
        stopRecognitionEngine()
        // Release the keepAlive callback
        if let callId = speechCallId {
            bridge?.releaseCall(withID: callId)
            speechCallId = nil
        }
        call.resolve(["ok": true])
    }

    private func stopRecognitionEngine() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        // Deactivate recording session and restore the baseline playback + mixWithOthers
        // category set in AppDelegate so background music (Spotify/Apple Music) resumes.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        try? AVAudioSession.sharedInstance().setCategory(
            .playback, mode: .default,
            options: [.mixWithOthers, .duckOthers, .allowAirPlay, .allowBluetoothA2DP]
        )
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // ─── App Store Review ─────────────────────────────────────────────────────
    //
    // Uses SKStoreReviewController — Apple enforces a hard cap of 3 prompts per
    // 365 days per app version, so it's safe to call at meaningful milestones
    // without risking user annoyance. Never shows when the sandbox is active.

    @objc func requestStoreReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // requestReview(in:) requires iOS 16+; requestReview() is deprecated since
            // iOS 14. IronTracks targets iOS 16+, so the else branch is unreachable,
            // but the guard makes the intent explicit and keeps the compiler happy.
            if #available(iOS 16.0, *) {
                if let scene = UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .first(where: { $0.activationState == .foregroundActive }) {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }

    // ─── HealthKit Sleep Data ─────────────────────────────────────────────────
    //
    // Returns total sleep for the most recent night (last 24 h window).
    // Apple Watch writes HKCategoryValueSleepAnalysis samples — either the
    // old asleep/inBed values (watchOS < 9) or the newer Core/Deep/REM/Awake
    // breakdown (watchOS 9+ / iOS 16+). We treat any non-inBed value as actual
    // sleep time for compatibility across both generations.

    @objc func getSleepData(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.resolve(["totalMinutes": 0, "asleepMinutes": 0, "inBedMinutes": 0, "startMs": 0, "endMs": 0])
            return
        }
        let now = Date()
        let windowStart = Calendar.current.date(byAdding: .hour, value: -24, to: now) ?? now
        let predicate = HKQuery.predicateForSamples(withStart: windowStart, end: now, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: sleepType, predicate: predicate,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, results, _ in
            guard let samples = results as? [HKCategorySample], !samples.isEmpty else {
                call.resolve(["totalMinutes": 0, "asleepMinutes": 0, "inBedMinutes": 0, "startMs": 0, "endMs": 0])
                return
            }
            var asleepSecs: TimeInterval = 0
            var inBedSecs: TimeInterval = 0
            var earliest = Date.distantFuture
            var latest = Date.distantPast
            for s in samples {
                let dur = s.endDate.timeIntervalSince(s.startDate)
                if s.startDate < earliest { earliest = s.startDate }
                if s.endDate > latest { latest = s.endDate }
                if s.value == HKCategoryValueSleepAnalysis.inBed.rawValue {
                    inBedSecs += dur
                } else {
                    // asleepUnspecified (0), asleepCore (3), asleepDeep (4), asleepREM (5)
                    asleepSecs += dur
                }
            }
            let asleepMins = Int(asleepSecs / 60)
            let inBedMins  = Int(inBedSecs / 60)
            call.resolve([
                "totalMinutes":  asleepMins > 0 ? asleepMins : inBedMins,
                "asleepMinutes": asleepMins,
                "inBedMinutes":  inBedMins,
                "startMs": earliest == Date.distantFuture ? 0 : earliest.timeIntervalSince1970 * 1000,
                "endMs":   latest  == Date.distantPast   ? 0 : latest.timeIntervalSince1970  * 1000,
            ])
        }
        healthStore.execute(query)
    }

    // ─── Story Video Composition (AVFoundation, hardware-accelerated) ─────────
    //
    // Composites a transparent overlay PNG (rendered by JS canvas — same
    // drawStory() as the preview) onto a source video using AVMutableComposition
    // + AVVideoCompositionCoreAnimationTool, then exports via AVAssetExportSession
    // with HighestQuality preset. The export uses VideoToolbox (Apple's hardware
    // H.264 encoder), running entirely outside the WKWebView. Typical 30s clip
    // exports in 3-8s on modern iPhones vs 30-60s for the JS Canvas+MediaRecorder
    // pipeline.
    //
    // The overlay is sized exactly outputWidth x outputHeight (720x1280 in
    // practice). The source video is cover-fit scaled into the same canvas using
    // a CGAffineTransform that respects the source's preferredTransform (so
    // portrait videos shot on iPhone stay upright).

    private var activeExportSession: AVAssetExportSession?
    private var activeProgressTimer: DispatchSourceTimer?

    @objc func composeStoryVideo(_ call: CAPPluginCall) {
        guard let videoPath = call.getString("videoPath"), !videoPath.isEmpty else {
            call.reject("videoPath is required"); return
        }
        guard let overlayPath = call.getString("overlayPath"), !overlayPath.isEmpty else {
            call.reject("overlayPath is required"); return
        }
        let outputW = CGFloat(call.getDouble("outputWidth") ?? 720)
        let outputH = CGFloat(call.getDouble("outputHeight") ?? 1280)
        let trimStart = call.getDouble("trimStartSec") ?? 0
        let trimEnd = call.getDouble("trimEndSec") ?? 0
        let outputSize = CGSize(width: outputW, height: outputH)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let (path, duration) = try self.runStoryComposition(
                    videoPath: videoPath,
                    overlayPath: overlayPath,
                    outputSize: outputSize,
                    trimStart: trimStart,
                    trimEnd: trimEnd
                )
                DispatchQueue.main.async {
                    call.resolve([
                        "outputPath": path,
                        "durationSec": duration,
                        "mime": "video/mp4",
                        "error": "",
                    ])
                }
            } catch let error {
                DispatchQueue.main.async {
                    call.resolve([
                        "outputPath": "",
                        "durationSec": 0,
                        "mime": "",
                        "error": error.localizedDescription,
                    ])
                }
            }
        }
    }

    @objc func cancelStoryCompose(_ call: CAPPluginCall) {
        activeExportSession?.cancelExport()
        activeProgressTimer?.cancel()
        activeProgressTimer = nil
        activeExportSession = nil
        call.resolve(["ok": true])
    }

    private func runStoryComposition(
        videoPath: String,
        overlayPath: String,
        outputSize: CGSize,
        trimStart: Double,
        trimEnd: Double
    ) throws -> (path: String, duration: Double) {
        let videoURL = URL(fileURLWithPath: videoPath)
        let overlayURL = URL(fileURLWithPath: overlayPath)

        guard FileManager.default.fileExists(atPath: videoURL.path) else {
            throw NSError(domain: "VideoComposer", code: 100, userInfo: [NSLocalizedDescriptionKey: "Source video not found at path"])
        }
        guard FileManager.default.fileExists(atPath: overlayURL.path) else {
            throw NSError(domain: "VideoComposer", code: 101, userInfo: [NSLocalizedDescriptionKey: "Overlay PNG not found at path"])
        }

        let asset = AVURLAsset(url: videoURL)
        guard let sourceVideoTrack = asset.tracks(withMediaType: .video).first else {
            throw NSError(domain: "VideoComposer", code: 102, userInfo: [NSLocalizedDescriptionKey: "No video track in source asset"])
        }

        let assetDuration = CMTimeGetSeconds(asset.duration)
        let safeStart = max(0, trimStart)
        let safeEnd = (trimEnd > 0 && trimEnd <= assetDuration) ? trimEnd : assetDuration
        let duration = max(0.1, safeEnd - safeStart)

        let timeRange = CMTimeRange(
            start: CMTime(seconds: safeStart, preferredTimescale: 600),
            duration: CMTime(seconds: duration, preferredTimescale: 600)
        )

        let composition = AVMutableComposition()
        guard let compositionVideoTrack = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw NSError(domain: "VideoComposer", code: 103, userInfo: [NSLocalizedDescriptionKey: "Failed to add video track to composition"])
        }
        try compositionVideoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: .zero)

        // Audio is optional — some videos have none, and missing audio shouldn't
        // fail the whole pipeline.
        if let sourceAudioTrack = asset.tracks(withMediaType: .audio).first,
           let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
           ) {
            try? compositionAudioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: .zero)
        }

        // ── Cover-fit transform ───────────────────────────────────────────────
        // Mirrors the JS fitCover() logic: scale the source so it fully covers
        // the output canvas, then center it. Respects preferredTransform so
        // portrait iPhone footage stays upright.
        let naturalSize = sourceVideoTrack.naturalSize
        let preferredTransform = sourceVideoTrack.preferredTransform
        let transformedRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
        let renderedW = abs(transformedRect.width)
        let renderedH = abs(transformedRect.height)
        let coverScale = max(outputSize.width / renderedW, outputSize.height / renderedH)
        let scaledW = renderedW * coverScale
        let scaledH = renderedH * coverScale
        let centerX = (outputSize.width - scaledW) / 2
        let centerY = (outputSize.height - scaledH) / 2

        var finalTransform = preferredTransform
        // After preferredTransform the rect may have negative origin (rotated
        // around 0,0). Translate so it sits at origin, then scale, then center.
        finalTransform = finalTransform.concatenating(
            CGAffineTransform(translationX: -transformedRect.origin.x, y: -transformedRect.origin.y)
        )
        finalTransform = finalTransform.concatenating(
            CGAffineTransform(scaleX: coverScale, y: coverScale)
        )
        finalTransform = finalTransform.concatenating(
            CGAffineTransform(translationX: centerX, y: centerY)
        )

        let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
        layerInstruction.setTransform(finalTransform, at: .zero)

        let mainInstruction = AVMutableVideoCompositionInstruction()
        mainInstruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)
        mainInstruction.layerInstructions = [layerInstruction]

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = outputSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
        videoComposition.instructions = [mainInstruction]

        // ── Overlay layer hierarchy ───────────────────────────────────────────
        // The overlay PNG was rendered by JS canvas (top-left origin). With
        // isGeometryFlipped=true on the parent layer, CoreAnimation interprets
        // sublayer positions and content rendering using top-left origin too,
        // so the overlay maps 1:1 to what the user saw in the preview.
        guard let overlayUIImage = UIImage(contentsOfFile: overlayURL.path),
              let overlayCGImage = overlayUIImage.cgImage else {
            throw NSError(domain: "VideoComposer", code: 104, userInfo: [NSLocalizedDescriptionKey: "Failed to load overlay PNG"])
        }

        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: outputSize)
        parentLayer.isGeometryFlipped = true

        let videoLayer = CALayer()
        videoLayer.frame = CGRect(origin: .zero, size: outputSize)
        parentLayer.addSublayer(videoLayer)

        let overlayLayer = CALayer()
        overlayLayer.frame = CGRect(origin: .zero, size: outputSize)
        overlayLayer.contents = overlayCGImage
        overlayLayer.contentsGravity = .resize
        parentLayer.addSublayer(overlayLayer)

        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )

        // ── Export ────────────────────────────────────────────────────────────
        // Output in Caches so JS can read it back via Capacitor.convertFileSrc().
        let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let outputURL = cachesDir.appendingPathComponent("irontracks-story-\(timestamp).mp4")
        try? FileManager.default.removeItem(at: outputURL)

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            throw NSError(domain: "VideoComposer", code: 105, userInfo: [NSLocalizedDescriptionKey: "Failed to create export session"])
        }
        exportSession.videoComposition = videoComposition
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        self.activeExportSession = exportSession

        // Progress polling — emit to JS via Capacitor event listener.
        let progressTimer = DispatchSource.makeTimerSource(queue: .main)
        progressTimer.schedule(deadline: .now() + .milliseconds(150), repeating: .milliseconds(150))
        progressTimer.setEventHandler { [weak self] in
            guard let self = self, let session = self.activeExportSession else { return }
            self.notifyListeners("storyComposeProgress", data: ["progress": Double(session.progress)])
        }
        progressTimer.resume()
        self.activeProgressTimer = progressTimer

        let semaphore = DispatchSemaphore(value: 0)
        var exportError: Error?

        exportSession.exportAsynchronously {
            switch exportSession.status {
            case .failed:
                exportError = exportSession.error
                    ?? NSError(domain: "VideoComposer", code: 106, userInfo: [NSLocalizedDescriptionKey: "Export failed (unknown reason)"])
            case .cancelled:
                exportError = NSError(domain: "VideoComposer", code: 107, userInfo: [NSLocalizedDescriptionKey: "Export cancelled"])
            default:
                break
            }
            semaphore.signal()
        }
        semaphore.wait()

        progressTimer.cancel()
        self.activeProgressTimer = nil
        self.activeExportSession = nil

        if let err = exportError {
            try? FileManager.default.removeItem(at: outputURL)
            throw err
        }

        // Final 100% progress tick
        self.notifyListeners("storyComposeProgress", data: ["progress": Double(1.0)])

        return (path: outputURL.path, duration: duration)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MARK: - Watch (WatchConnectivity bridge)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Os métodos abaixo expõem o WatchBridge à camada JS. JS:
    //   - lê o estado de pareamento + alcance (watchGetState)
    //   - empurra o dashboard, treino do dia e academias próximas pro Watch
    //
    // O Watch envia eventos de volta (watchSetLogged, watchCardioFinished,
    // watchRefreshRequested, watchCheckinRequested, watchReachabilityChanged)
    // que o JS pode escutar via Capacitor.addListener.

    @objc func watchGetState(_ call: CAPPluginCall) {
        Task { @MainActor in
            let state = WatchBridge.shared.currentState()
            call.resolve(state.mapValues { v -> Any in
                if let b = v as? Bool { return b }
                if let s = v as? String { return s }
                return String(describing: v)
            })
        }
    }

    @objc func watchSendDashboard(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("Missing 'json' string parameter")
            return
        }
        Task { @MainActor in
            WatchBridge.shared.sendDashboard(json)
            call.resolve(["ok": true])
        }
    }

    @objc func watchSendWorkout(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("Missing 'json' string parameter")
            return
        }
        Task { @MainActor in
            WatchBridge.shared.sendWorkout(json)
            call.resolve(["ok": true])
        }
    }

    @objc func watchSendNearestGyms(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("Missing 'json' string parameter")
            return
        }
        Task { @MainActor in
            WatchBridge.shared.sendNearestGyms(json)
            call.resolve(["ok": true])
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MARK: - App Intents (Siri Shortcuts)
// ══════════════════════════════════════════════════════════════════════════════
//
// Each intent below:
//   1. Opens the app (openAppWhenRun = true)
//   2. Writes its action name to UserDefaults under IronTracksIntentPendingActionKey
//   3. Posts IronTracksIntentActionNotification so the plugin can relay to JS
//      immediately if the app was already running.
//
// JS handles routing — the intent itself doesn't navigate. This keeps Swift
// thin and lets us evolve UX without re-submitting native code.

/// Notification posted by App Intent .perform() when running inside the App process.
/// IronTracksNativePlugin observes this and relays to JS via notifyListeners.
let IronTracksIntentActionNotification = NSNotification.Name("IronTracksIntentActionFromSiri")

/// UserDefaults key used as a cold-start fallback (JS polls on bootstrap).
let IronTracksIntentPendingActionKey = "it.intent.pendingAction"

/// Helper shared by all App Intents — writes the action and notifies listeners.
@available(iOS 16.0, *)
private func recordIntentAction(_ action: String) async {
    UserDefaults.standard.set(action, forKey: IronTracksIntentPendingActionKey)
    await MainActor.run {
        NotificationCenter.default.post(
            name: IronTracksIntentActionNotification,
            object: nil,
            userInfo: ["action": action]
        )
    }
}

@available(iOS 16.0, *)
struct StartWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Iniciar Treino"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks no painel para começar um treino.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        await recordIntentAction("startWorkout")
        return .result()
    }
}

// ─── Dynamic workout entity (Feature 19) ──────────────────────────────────────
//
// Surfaces the user's recent workouts as Siri-suggested intents. JS pushes the
// list via IronTracksNative.updateSiriWorkoutSuggestions() and we persist it in
// UserDefaults under "irontracks.siri.suggestedWorkouts". Shortcuts.app picks
// these up automatically and "Hey Siri, iniciar Treino A no IronTracks" works.

@available(iOS 16.0, *)
struct SuggestedWorkoutEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Treino")
    }
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
    static var defaultQuery = SuggestedWorkoutQuery()
}

@available(iOS 16.0, *)
struct SuggestedWorkoutQuery: EntityQuery {
    /// Read the cached workout list written by JS via UserDefaults.
    private func loadCached() -> [SuggestedWorkoutEntity] {
        guard let data = UserDefaults.standard.data(forKey: "irontracks.siri.suggestedWorkouts"),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
            return []
        }
        return arr.compactMap { dict in
            guard let id = dict["id"], let name = dict["name"] else { return nil }
            return SuggestedWorkoutEntity(id: id, name: name)
        }
    }

    func entities(for identifiers: [String]) async throws -> [SuggestedWorkoutEntity] {
        let all = loadCached()
        return all.filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [SuggestedWorkoutEntity] {
        return loadCached()
    }
}

/// Parameterised "Iniciar Treino X" intent — Siri prompts the user to pick a
/// workout from the suggested list when the phrase doesn't include one.
@available(iOS 16.0, *)
struct StartSpecificWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Iniciar Treino Específico"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks já filtrando o treino escolhido.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Treino")
    var workout: SuggestedWorkoutEntity

    func perform() async throws -> some IntentResult {
        // Encode action + workout id so JS can route to the specific workout.
        UserDefaults.standard.set("startWorkout:\(workout.id)", forKey: IronTracksIntentPendingActionKey)
        await MainActor.run {
            NotificationCenter.default.post(
                name: IronTracksIntentActionNotification,
                object: nil,
                userInfo: ["action": "startWorkout:\(workout.id)"]
            )
        }
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenLastWorkoutIntent: AppIntent {
    static var title: LocalizedStringResource = "Ver Último Treino"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks no relatório do treino mais recente.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        await recordIntentAction("openLastWorkout")
        return .result()
    }
}

@available(iOS 16.0, *)
struct CheckStreakIntent: AppIntent {
    static var title: LocalizedStringResource = "Ver Streak"
    static var description: IntentDescription? = IntentDescription("Mostra quantos dias de treino consecutivos você acumulou.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        await recordIntentAction("checkStreak")
        return .result()
    }
}

@available(iOS 16.0, *)
struct OpenHistoryIntent: AppIntent {
    static var title: LocalizedStringResource = "Histórico de Treinos"
    static var description: IntentDescription? = IntentDescription("Abre o IronTracks na tela de histórico.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        await recordIntentAction("openHistory")
        return .result()
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MARK: - SharePlay (Feature 18)
// ══════════════════════════════════════════════════════════════════════════════
//
// GroupActivity surfacing as "Treinar Junto" in the SharePlay tray when the
// user is on a FaceTime call. Once activated, every participant who taps
// "Open" joins the same GroupSession and exchanges WorkoutSharePlayMessages
// via GroupSessionMessenger — used to mirror set-completion events between
// devices in real time.
//
// The activity carries only IDs + display strings — actual workout data is
// fetched by each participant from Supabase via the workoutId. This keeps
// the message payload small (Apple caps it at ~64 KB).

@available(iOS 15.0, *)
struct WorkoutSharePlayActivity: GroupActivity {
    static let activityIdentifier = "com.irontracks.app.sharedworkout"

    let workoutId: String
    let workoutName: String
    let hostName: String

    var metadata: GroupActivityMetadata {
        var meta = GroupActivityMetadata()
        meta.type = .generic
        meta.title = "Treinar Junto: \(workoutName)"
        meta.subtitle = hostName.isEmpty ? "IronTracks" : "Convite de \(hostName)"
        meta.previewImage = nil   // TODO: thumbnail of the workout (resource asset)
        return meta
    }
}

/// Wire-format for the per-set updates exchanged over GroupSessionMessenger.
/// `payloadJSON` is opaque to Swift — JS encodes / decodes its own schemas
/// (e.g. `{ exIdx, setIdx, weight, reps, rpe }`) so we can evolve the protocol
/// without touching the Swift side.
@available(iOS 15.0, *)
struct WorkoutSharePlayMessage: Codable {
    let type: String
    let payloadJSON: String
    let sentAtMs: Int64
}

// ══════════════════════════════════════════════════════════════════════════════
// MARK: - SQLite3-backed cache (Feature 16)
// ══════════════════════════════════════════════════════════════════════════════
//
// Lightweight native persistence for the IronTracks Capacitor shell. Replaces
// the IndexedDB + Filesystem-JSON paths on iOS — JS calls IronTracksNative.kv*
// / queue* methods which go through this store. The IDB / FS / localStorage
// fallbacks remain on the JS side as a safety net for non-native platforms and
// migration windows.
//
// Why SQLite3 (not GRDB / SwiftData)?
//   • Built into iOS — no SPM packages, no project.pbxproj edits needed.
//   • Same DB is opened from watchOS extension / Widgets / NotificationService
//     via App Group `group.com.irontracks.shared` (F-005).
//   • Indexed columns on `status` + `next_attempt_at` make queue scans
//     10–100× faster than iterating IDB cursors or one JSON file per job.
//
// Concurrency: every public method dispatches to a private serial queue so
// callers can hit it from any thread without locking themselves.

final class IronTracksKVStore {

    static let shared = IronTracksKVStore()

    /// App Group identifier — compartilhado entre App, Widgets, NotificationService
    /// e Watch. Mantém o cache acessível por todas as extensões. Definido nos 4
    /// .entitlements files (F-005). Se o entitlement não estiver presente (ex.
    /// build local sem provisioning regenerado) o `containerURL(...)` retorna
    /// nil e o fallback do sandbox individual é usado.
    static let appGroupIdentifier = "group.com.irontracks.shared"

    /// One-shot migration flag — copia o `cache.db` legado do sandbox individual
    /// pro App Group container na primeira vez que o store é tocado depois do
    /// entitlement ser instalado. Sem essa migração usuários existentes perderiam
    /// streak / offline queue após o update.
    private static var didMigrate = false

    private var db: OpaquePointer?
    private let queue = DispatchQueue(label: "com.irontracks.kvstore", qos: .userInitiated)
    private let schemaVersion: Int32 = 1

    /// Re-create SQLITE_TRANSIENT (Swift can't import the function-pointer macro directly).
    private static let SQLITE_TRANSIENT_PTR = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private init() {
        queue.sync {
            self.migrateLegacyKVStoreIfNeeded()
            self.openAndMigrate()
        }
    }

    /// Caminho do `cache.db`. Prioriza o App Group container; cai pro sandbox
    /// individual em Application Support se o entitlement não estiver disponível
    /// (build de dev sem provisioning regenerado, runtime em ambiente sem App Group).
    private func dbPath() -> String {
        let fm = FileManager.default
        // Primeiro tenta App Group (compartilhado com Widgets / NSE / Watch)
        if let groupURL = fm.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            let dir = groupURL.appendingPathComponent("IronTracks", isDirectory: true)
            if !fm.fileExists(atPath: dir.path) {
                try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            }
            var dirURL = dir
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try? dirURL.setResourceValues(resourceValues)
            return dir.appendingPathComponent("cache.db").path
        }
        // Fallback: sandbox individual (comportamento legado)
        return Self.legacySandboxDBPath()
    }

    /// Caminho legado em Library/Application Support/IronTracks/cache.db.
    /// Usado pelo fallback e pela migração one-shot.
    private static func legacySandboxDBPath() -> String {
        let fm = FileManager.default
        let appSupport = (try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let dir = appSupport.appendingPathComponent("IronTracks", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        var dirURL = dir
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try? dirURL.setResourceValues(resourceValues)
        return dir.appendingPathComponent("cache.db").path
    }

    /// Migra o cache.db do sandbox individual pro App Group container, uma única
    /// vez por instalação. Idempotente: se o destino já existe, no-op. Copia
    /// também os WAL/SHM se presentes pra preservar transações em vôo.
    private func migrateLegacyKVStoreIfNeeded() {
        guard !Self.didMigrate else { return }
        Self.didMigrate = true

        let fm = FileManager.default
        guard let groupURL = fm.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) else {
            return // sem App Group, nada pra migrar
        }
        let groupDir = groupURL.appendingPathComponent("IronTracks", isDirectory: true)
        if !fm.fileExists(atPath: groupDir.path) {
            try? fm.createDirectory(at: groupDir, withIntermediateDirectories: true)
        }
        let groupDB = groupDir.appendingPathComponent("cache.db")
        if fm.fileExists(atPath: groupDB.path) {
            return // já migrado
        }

        let legacyDBPath = Self.legacySandboxDBPath()
        guard fm.fileExists(atPath: legacyDBPath) else { return }
        let legacyURL = URL(fileURLWithPath: legacyDBPath)
        do {
            try fm.copyItem(at: legacyURL, to: groupDB)
            // Copia WAL/SHM auxiliares se existirem (write-ahead log + shared memory)
            for suffix in ["-wal", "-shm"] {
                let src = URL(fileURLWithPath: legacyDBPath + suffix)
                if fm.fileExists(atPath: src.path) {
                    let dst = groupDir.appendingPathComponent("cache.db" + suffix)
                    try? fm.copyItem(at: src, to: dst)
                }
            }
            print("[IronTracksKVStore] Migrated legacy cache.db → App Group container")
        } catch {
            print("[IronTracksKVStore] Migration failed: \(error). Falling back to fresh DB.")
        }
    }

    private func openAndMigrate() {
        let path = dbPath()
        if sqlite3_open(path, &db) != SQLITE_OK {
            print("[IronTracksKVStore] Failed to open DB at \(path)")
            db = nil
            return
        }
        execRaw("PRAGMA journal_mode=WAL")
        execRaw("PRAGMA synchronous=NORMAL")
        execRaw("PRAGMA temp_store=MEMORY")
        execRaw("PRAGMA foreign_keys=ON")
        execRaw("CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value BLOB, updated_at INTEGER NOT NULL DEFAULT 0)")
        execRaw("CREATE TABLE IF NOT EXISTS offline_queue (id TEXT PRIMARY KEY NOT NULL, payload BLOB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)")
        execRaw("CREATE INDEX IF NOT EXISTS offline_queue_status_idx ON offline_queue(status, next_attempt_at)")
        execRaw("PRAGMA user_version = \(schemaVersion)")
    }

    private func execRaw(_ sql: String) {
        guard let db = db else { return }
        var err: UnsafeMutablePointer<Int8>?
        let rc = sqlite3_exec(db, sql, nil, nil, &err)
        if rc != SQLITE_OK, let err = err {
            print("[IronTracksKVStore] exec failed for '\(sql)': \(String(cString: err))")
            sqlite3_free(err)
        }
    }

    // ── KV API ───────────────────────────────────────────────────────────────

    @discardableResult
    func kvSet(_ key: String, value: String) -> Bool {
        guard !key.isEmpty else { return false }
        return queue.sync {
            guard let db = db else { return false }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            let sql = "INSERT INTO kv_store(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) != SQLITE_OK { return false }
            sqlite3_bind_text(stmt, 1, key, -1, Self.SQLITE_TRANSIENT_PTR)
            sqlite3_bind_text(stmt, 2, value, -1, Self.SQLITE_TRANSIENT_PTR)
            sqlite3_bind_int64(stmt, 3, Int64(Date().timeIntervalSince1970 * 1000))
            return sqlite3_step(stmt) == SQLITE_DONE
        }
    }

    func kvGet(_ key: String) -> String? {
        guard !key.isEmpty else { return nil }
        return queue.sync {
            guard let db = db else { return nil }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            if sqlite3_prepare_v2(db, "SELECT value FROM kv_store WHERE key = ?", -1, &stmt, nil) != SQLITE_OK {
                return nil
            }
            sqlite3_bind_text(stmt, 1, key, -1, Self.SQLITE_TRANSIENT_PTR)
            if sqlite3_step(stmt) == SQLITE_ROW, let cstr = sqlite3_column_text(stmt, 0) {
                return String(cString: cstr)
            }
            return nil
        }
    }

    @discardableResult
    func kvDelete(_ key: String) -> Bool {
        guard !key.isEmpty else { return false }
        return queue.sync {
            guard let db = db else { return false }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            if sqlite3_prepare_v2(db, "DELETE FROM kv_store WHERE key = ?", -1, &stmt, nil) != SQLITE_OK {
                return false
            }
            sqlite3_bind_text(stmt, 1, key, -1, Self.SQLITE_TRANSIENT_PTR)
            return sqlite3_step(stmt) == SQLITE_DONE
        }
    }

    func kvKeys(prefix: String? = nil, limit: Int = 5000) -> [String] {
        return queue.sync {
            guard let db = db else { return [] }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            let useLike = !(prefix?.isEmpty ?? true)
            let sql = useLike
                ? "SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key LIMIT ?"
                : "SELECT key FROM kv_store ORDER BY key LIMIT ?"
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) != SQLITE_OK { return [] }
            if useLike, let p = prefix {
                sqlite3_bind_text(stmt, 1, "\(p)%", -1, Self.SQLITE_TRANSIENT_PTR)
                sqlite3_bind_int(stmt, 2, Int32(max(1, limit)))
            } else {
                sqlite3_bind_int(stmt, 1, Int32(max(1, limit)))
            }
            var keys: [String] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let cstr = sqlite3_column_text(stmt, 0) {
                    keys.append(String(cString: cstr))
                }
            }
            return keys
        }
    }

    // ── Queue API ────────────────────────────────────────────────────────────

    @discardableResult
    func queuePut(id: String, payload: String, status: String?, attempts: Int?, nextAttemptAt: Int64?) -> Bool {
        guard !id.isEmpty else { return false }
        return queue.sync {
            guard let db = db else { return false }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            let sql = "INSERT INTO offline_queue(id, payload, status, attempts, next_attempt_at, created_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, status=excluded.status, attempts=excluded.attempts, next_attempt_at=excluded.next_attempt_at"
            if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) != SQLITE_OK { return false }
            sqlite3_bind_text(stmt, 1, id, -1, Self.SQLITE_TRANSIENT_PTR)
            sqlite3_bind_text(stmt, 2, payload, -1, Self.SQLITE_TRANSIENT_PTR)
            sqlite3_bind_text(stmt, 3, status ?? "pending", -1, Self.SQLITE_TRANSIENT_PTR)
            sqlite3_bind_int(stmt, 4, Int32(attempts ?? 0))
            sqlite3_bind_int64(stmt, 5, nextAttemptAt ?? 0)
            sqlite3_bind_int64(stmt, 6, Int64(Date().timeIntervalSince1970 * 1000))
            return sqlite3_step(stmt) == SQLITE_DONE
        }
    }

    func queueGetAll(limit: Int = 1000) -> [String] {
        return queue.sync {
            guard let db = db else { return [] }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            if sqlite3_prepare_v2(db, "SELECT payload FROM offline_queue ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?", -1, &stmt, nil) != SQLITE_OK {
                return []
            }
            sqlite3_bind_int(stmt, 1, Int32(max(1, limit)))
            var jobs: [String] = []
            while sqlite3_step(stmt) == SQLITE_ROW {
                if let cstr = sqlite3_column_text(stmt, 0) {
                    jobs.append(String(cString: cstr))
                }
            }
            return jobs
        }
    }

    @discardableResult
    func queueDelete(_ id: String) -> Bool {
        guard !id.isEmpty else { return false }
        return queue.sync {
            guard let db = db else { return false }
            var stmt: OpaquePointer?
            defer { sqlite3_finalize(stmt) }
            if sqlite3_prepare_v2(db, "DELETE FROM offline_queue WHERE id = ?", -1, &stmt, nil) != SQLITE_OK {
                return false
            }
            sqlite3_bind_text(stmt, 1, id, -1, Self.SQLITE_TRANSIENT_PTR)
            return sqlite3_step(stmt) == SQLITE_DONE
        }
    }

    @discardableResult
    func queueClear() -> Bool {
        return queue.sync {
            guard let db = db else { return false }
            return sqlite3_exec(db, "DELETE FROM offline_queue", nil, nil, nil) == SQLITE_OK
        }
    }

    func stats() -> [String: Any] {
        return queue.sync {
            guard let db = db else { return ["available": false] }
            var kvCount: Int = 0
            var queueCount: Int = 0
            var stmt: OpaquePointer?

            sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM kv_store", -1, &stmt, nil)
            if sqlite3_step(stmt) == SQLITE_ROW { kvCount = Int(sqlite3_column_int(stmt, 0)) }
            sqlite3_finalize(stmt)
            stmt = nil

            sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM offline_queue", -1, &stmt, nil)
            if sqlite3_step(stmt) == SQLITE_ROW { queueCount = Int(sqlite3_column_int(stmt, 0)) }
            sqlite3_finalize(stmt)

            let attrs = try? FileManager.default.attributesOfItem(atPath: dbPath())
            let size = (attrs?[.size] as? NSNumber)?.intValue ?? 0
            return [
                "available": true,
                "kvCount": kvCount,
                "queueCount": queueCount,
                "sizeBytes": size,
            ]
        }
    }
}

/// AppShortcutsProvider — registers all intents with the system. Phrases here
/// appear in the Shortcuts app and become Siri voice commands. The "(.applicationName)"
/// token is required by Apple — every phrase must include it.
@available(iOS 16.0, *)
struct IronTracksAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartWorkoutIntent(),
            phrases: [
                "Iniciar treino no \(.applicationName)",
                "Começar treino no \(.applicationName)",
                "Abrir treino no \(.applicationName)",
            ],
            shortTitle: "Iniciar Treino",
            systemImageName: "figure.strengthtraining.traditional"
        )
        AppShortcut(
            intent: StartSpecificWorkoutIntent(),
            phrases: [
                "Iniciar \(\.$workout) no \(.applicationName)",
                "Começar \(\.$workout) no \(.applicationName)",
                "Treinar \(\.$workout) no \(.applicationName)",
            ],
            shortTitle: "Iniciar Treino Específico",
            systemImageName: "figure.strengthtraining.traditional"
        )
        AppShortcut(
            intent: CheckStreakIntent(),
            phrases: [
                "Ver streak no \(.applicationName)",
                "Quantos dias seguidos no \(.applicationName)",
                "Sequência no \(.applicationName)",
            ],
            shortTitle: "Ver Streak",
            systemImageName: "flame.fill"
        )
        AppShortcut(
            intent: OpenLastWorkoutIntent(),
            phrases: [
                "Último treino no \(.applicationName)",
                "Ver relatório no \(.applicationName)",
                "Abrir relatório no \(.applicationName)",
            ],
            shortTitle: "Último Treino",
            systemImageName: "chart.bar.fill"
        )
        AppShortcut(
            intent: OpenHistoryIntent(),
            phrases: [
                "Histórico no \(.applicationName)",
                "Ver histórico no \(.applicationName)",
                "Treinos anteriores no \(.applicationName)",
            ],
            shortTitle: "Histórico",
            systemImageName: "calendar"
        )
    }
}
