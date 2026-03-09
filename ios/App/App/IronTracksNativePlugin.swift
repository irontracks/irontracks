import Foundation
import Capacitor
import UIKit
import UserNotifications
import CoreMotion
import HealthKit
import Photos
import LocalAuthentication
import CoreSpotlight
import MobileCoreServices

// ─── IronTracksNative Capacitor Plugin ───────────────────────────────────────
@objc(IronTracksNativePlugin)
public class IronTracksNativePlugin: CAPPlugin, CAPBridgedPlugin {

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
        // Photos
        CAPPluginMethod(name: "saveImageToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFileToPhotos", returnType: CAPPluginReturnPromise),
    ]

    private let motionManager = CMMotionManager()
    private let healthStore = HKHealthStore()

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
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
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
            call.resolve(["status": status])
        }
    }

    @objc func setupNotificationActions(_ call: CAPPluginCall) {
        let restDoneAction = UNNotificationAction(
            identifier: "REST_DONE",
            title: "Iniciar Série",
            options: [.foreground]
        )
        let restCategory = UNNotificationCategory(
            identifier: "REST_TIMER",
            actions: [restDoneAction],
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
        content.sound = UNNotificationSound.default
        content.categoryIdentifier = "REST_TIMER"

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
                    repeatContent.sound = UNNotificationSound.default
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

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(max(1, delay)), repeats: false)
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { _ in
            call.resolve(["id": id])
        }
    }

    // ─── Live Activity (stub — requires ActivityKit + WidgetExtension) ──────────

    @objc func startRestLiveActivity(_ call: CAPPluginCall) {
        // Live Activities require an ActivityKit widget extension.
        // This stub keeps the JS bridge satisfied without crashing.
        call.resolve()
    }

    @objc func updateRestLiveActivity(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func endRestLiveActivity(_ call: CAPPluginCall) {
        call.resolve()
    }

    // ─── Alarm Sound ───────────────────────────────────────────────────────────

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
        if let ms = dateMs { attributes.creationDate = Date(timeIntervalSince1970: ms / 1000) }
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
            HKObjectType.workoutType(),
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
}
