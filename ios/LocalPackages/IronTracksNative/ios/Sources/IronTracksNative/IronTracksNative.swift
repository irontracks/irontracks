import Foundation
import Capacitor
import UserNotifications
import UIKit
import ActivityKit
import IronTracksLiveActivityShared
import LocalAuthentication
import CoreSpotlight
import CoreMotion
import HealthKit

@objc(IronTracksNative)
public class IronTracksNative: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IronTracksNative"
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
        CAPPluginMethod(name: "endRestLiveActivity", returnType: CAPPluginReturnPromise),
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
    ]

    // MARK: - State

    private static var restActivities: [String: Any] = [:]
    private static let sharedMotionManager = CMMotionManager()
    private let healthStore = HKHealthStore()
    private var notifObserver: NSObjectProtocol?

    public override func load() {
        super.load()
        notifObserver = NotificationCenter.default.addObserver(forName: NSNotification.Name("IronTracksNotificationAction"), object: nil, queue: .main) { [weak self] note in
            guard let self else { return }
            let userInfo = note.userInfo ?? [:]
            let actionId = userInfo["actionId"] as? String ?? ""
            self.notifyListeners("notificationAction", data: ["actionId": actionId], retainUntilConsumed: true)
        }
    }

    deinit {
        if let obs = notifObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    // MARK: - Helpers

    private func getDoubleValue(_ call: CAPPluginCall, _ key: String) -> Double {
        if let val = call.options[key] as? Double { return val }
        if let val = call.options[key] as? Int { return Double(val) }
        if let val = call.options[key] as? Float { return Double(val) }
        return 0
    }

    // MARK: - Screen

    @objc func setIdleTimerDisabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve()
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["ok": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["ok": ok])
            }
        }
    }

    // MARK: - Notifications

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    @objc func checkNotificationPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let status: String
            switch settings.authorizationStatus {
            case .authorized:     status = "granted"
            case .denied:         status = "denied"
            case .notDetermined:  status = "notDetermined"
            case .provisional:    status = "provisional"
            case .ephemeral:      status = "ephemeral"
            @unknown default:     status = "unknown"
            }
            call.resolve(["status": status])
        }
    }

    @objc func setupNotificationActions(_ call: CAPPluginCall) {
        let skipAction = UNNotificationAction(
            identifier: "SKIP_REST",
            title: "Pular descanso",
            options: []
        )
        let addTimeAction = UNNotificationAction(
            identifier: "ADD_30S",
            title: "+30 segundos",
            options: []
        )
        let restCategory = UNNotificationCategory(
            identifier: "REST_TIMER",
            actions: [skipAction, addTimeAction],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([restCategory])
        call.resolve()
    }

    @objc func scheduleRestTimer(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let seconds = Double(call.getInt("seconds") ?? 0)
        if seconds <= 0 {
            call.resolve()
            return
        }

        let title = String(call.getString("title") ?? "⏰ Tempo Esgotado!")
        let body = String(call.getString("body") ?? "Hora de voltar para o treino!")

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = "REST_TIMER"

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        center.add(request) { _ in
            call.resolve()
        }
    }

    @objc func cancelRestTimer(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        call.resolve()
    }

    // MARK: - Live Activities

    @objc func startRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            startRestLiveActivityAvailable(call)
            return
        }
        call.resolve()
    }

    @objc func endRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            endRestLiveActivityAvailable(call)
            return
        }
        call.resolve()
    }

    @available(iOS 16.2, *)
    private func startRestLiveActivityAvailable(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let seconds = Double(call.getInt("seconds") ?? 0)
        let title = String(call.getString("title") ?? "Descanso")
        if seconds <= 0 {
            call.resolve()
            return
        }

        // End any existing activity for this id
        if let existing = Self.restActivities[id] as? Activity<RestTimerAttributes> {
            Task { await existing.end(nil, dismissalPolicy: .immediate) }
        }

        let start = Date()
        let end = start.addingTimeInterval(seconds)
        let attributes = RestTimerAttributes(startTime: start, totalSeconds: Int(seconds))
        let content = RestTimerAttributes.ContentState(endTime: end, title: title)

        Task {
            do {
                let activity = try Activity<RestTimerAttributes>.request(
                    attributes: attributes,
                    contentState: content,
                    pushType: nil
                )
                Self.restActivities[id] = activity
                call.resolve()
            } catch {
                call.reject("live_activity_error", error.localizedDescription)
            }
        }
    }

    @available(iOS 16.2, *)
    private func endRestLiveActivityAvailable(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        if let activity = Self.restActivities[id] as? Activity<RestTimerAttributes> {
            Task {
                await activity.end(nil, dismissalPolicy: .immediate)
                Self.restActivities.removeValue(forKey: id)
                call.resolve()
            }
            return
        }
        call.resolve()
    }

    // MARK: - Haptics

    @objc func triggerHaptic(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "medium"
        DispatchQueue.main.async {
            switch style {
            case "light":
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "medium":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "rigid":
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            case "soft":
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning":
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            case "selection":
                UISelectionFeedbackGenerator().selectionChanged()
            default:
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
            call.resolve()
        }
    }

    // MARK: - Biometrics

    @objc func checkBiometricsAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let biometryType: String
        switch context.biometryType {
        case .faceID:  biometryType = "faceID"
        case .touchID: biometryType = "touchID"
        default:       biometryType = "none"
        }
        call.resolve(["available": available, "biometryType": biometryType])
    }

    @objc func authenticateWithBiometrics(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Confirme sua identidade"
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            call.resolve(["success": false, "error": error?.localizedDescription ?? "Biometrics not available"])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, authError in
            call.resolve(["success": success, "error": authError?.localizedDescription ?? ""])
        }
    }

    // MARK: - Spotlight

    @objc func indexWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let title = call.getString("title") else {
            call.reject("missing_params")
            return
        }
        let subtitle = call.getString("subtitle") ?? ""
        let dateMs = getDoubleValue(call, "dateMs")
        let date = dateMs > 0 ? Date(timeIntervalSince1970: dateMs / 1000) : Date()

        let attributeSet = CSSearchableItemAttributeSet(itemContentType: "public.content")
        attributeSet.title = title
        attributeSet.contentDescription = subtitle
        attributeSet.startDate = date

        let item = CSSearchableItem(
            uniqueIdentifier: "workout_\(id)",
            domainIdentifier: "com.irontracks.workouts",
            attributeSet: attributeSet
        )
        item.expirationDate = .distantFuture

        CSSearchableIndex.default().indexSearchableItems([item]) { error in
            if let error = error {
                call.reject("spotlight_error", error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func removeWorkoutIndex(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("missing_params")
            return
        }
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: ["workout_\(id)"]) { error in
            if let error = error {
                call.reject("spotlight_error", error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func clearAllWorkoutIndexes(_ call: CAPPluginCall) {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["com.irontracks.workouts"]) { error in
            if let error = error {
                call.reject("spotlight_error", error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    // MARK: - Accelerometer

    @objc func startAccelerometer(_ call: CAPPluginCall) {
        let manager = Self.sharedMotionManager
        guard manager.isAccelerometerAvailable else {
            call.reject("accelerometer_unavailable")
            return
        }
        let intervalMs = Double(call.getInt("intervalMs") ?? 100)
        manager.accelerometerUpdateInterval = max(0.016, intervalMs / 1000.0)
        manager.startAccelerometerUpdates(to: .main) { [weak self] data, error in
            guard let data = data, error == nil else { return }
            self?.notifyListeners("accelerometerData", data: [
                "x": data.acceleration.x,
                "y": data.acceleration.y,
                "z": data.acceleration.z,
                "timestamp": data.timestamp
            ])
        }
        call.resolve()
    }

    @objc func stopAccelerometer(_ call: CAPPluginCall) {
        Self.sharedMotionManager.stopAccelerometerUpdates()
        call.resolve()
    }

    // MARK: - HealthKit

    @objc func isHealthKitAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestHealthKitPermission(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        guard
            let stepType = HKObjectType.quantityType(forIdentifier: .stepCount),
            let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
            let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            let writeEnergyType = HKSampleType.quantityType(forIdentifier: .activeEnergyBurned)
        else {
            call.resolve(["granted": false])
            return
        }
        let readTypes: Set<HKObjectType> = [stepType, heartRateType, energyType, HKObjectType.workoutType()]
        let writeTypes: Set<HKSampleType> = [writeEnergyType, HKObjectType.workoutType()]
        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            call.resolve(["granted": success, "error": error?.localizedDescription ?? ""])
        }
    }

    @objc func saveWorkoutToHealth(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("healthkit_unavailable")
            return
        }
        let startMs = getDoubleValue(call, "startMs")
        let endMs = getDoubleValue(call, "endMs")
        let calories = getDoubleValue(call, "calories")

        guard startMs > 0, endMs > startMs else {
            call.reject("invalid_dates")
            return
        }
        let startDate = Date(timeIntervalSince1970: startMs / 1000)
        let endDate = Date(timeIntervalSince1970: endMs / 1000)

        let totalEnergy: HKQuantity? = calories > 0 ? HKQuantity(unit: .kilocalorie(), doubleValue: calories) : nil
        // HKWorkout deprecated in iOS 17 but still functional; upgrade to HKWorkoutBuilder when iOS 17+ is minimum
        let workout = HKWorkout(
            activityType: .traditionalStrengthTraining,
            start: startDate,
            end: endDate,
            workoutEvents: nil,
            totalEnergyBurned: totalEnergy,
            totalDistance: nil,
            metadata: nil
        )
        healthStore.save(workout) { [weak self] success, error in
            guard success, calories > 0,
                  let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) else {
                call.resolve(["saved": success, "error": error?.localizedDescription ?? ""])
                return
            }
            let energySample = HKQuantitySample(
                type: energyType,
                quantity: HKQuantity(unit: .kilocalorie(), doubleValue: calories),
                start: startDate,
                end: endDate
            )
            self?.healthStore.add([energySample], to: workout) { _, addError in
                call.resolve(["saved": true, "error": addError?.localizedDescription ?? ""])
            }
        }
    }

    @objc func getHealthSteps(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            call.resolve(["steps": 0])
            return
        }
        let now = Date()
        let startOfDay = Calendar.current.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(
            quantityType: stepType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum
        ) { _, result, _ in
            let steps = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            call.resolve(["steps": Int(steps)])
        }
        healthStore.execute(query)
    }
}
