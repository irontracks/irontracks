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
import AVFoundation
import Photos

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
        CAPPluginMethod(name: "updateRestLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRestLiveActivity", returnType: CAPPluginReturnPromise),
        // Generic app notification
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

    // MARK: - State

    private static var restActivities: [String: Any] = [:]
    private static let sharedMotionManager = CMMotionManager()
    private let healthStore = HKHealthStore()
    private var notifObserver: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?

    // Alarm audio
    private var alarmPlayer: AVAudioPlayer?
    private var silentPlayer: AVAudioPlayer?
    private var alarmDispatchItem: DispatchWorkItem?
    private var alarmRestId: String?

    public override func load() {
        super.load()
        notifObserver = NotificationCenter.default.addObserver(forName: NSNotification.Name("IronTracksNotificationAction"), object: nil, queue: .main) { [weak self] note in
            guard let self else { return }
            let userInfo = note.userInfo ?? [:]
            let actionId = userInfo["actionId"] as? String ?? ""
            self.notifyListeners("notificationAction", data: ["actionId": actionId], retainUntilConsumed: true)
        }
        // Auto-stop alarm when app becomes active
        foregroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.alarmPlayer?.isPlaying == true else { return }
            self.stopAlarmInternal()
            self.notifyListeners("alarmStopped", data: [:])
        }
    }

    deinit {
        if let obs = notifObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        if let obs = foregroundObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        stopAlarmInternal()
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
        var options: UNAuthorizationOptions = [.alert, .sound, .badge]
        if #available(iOS 12.0, *) {
            options.insert(.criticalAlert)
        }
        center.requestAuthorization(options: options) { granted, _ in
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
        let repeatCount = max(0, min(120, call.getInt("repeatCount") ?? 0))
        let repeatEverySeconds = max(2.0, min(30.0, Double(call.getInt("repeatEverySeconds") ?? 5)))

        let mkContent = { () -> UNMutableNotificationContent in
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            // .defaultCriticalSound requer entitlement especial da Apple — sem ela a
            // notificação falha silenciosamente. Usamos .default que sempre funciona e
            // acende a tela mesmo com iPhone bloqueado.
            content.sound = UNNotificationSound.default
            content.categoryIdentifier = "REST_TIMER"
            content.threadIdentifier = "REST_TIMER"
            if #available(iOS 15.0, *) {
                // .timeSensitive fura o Focus Mode sem precisar de entitlement especial
                content.interruptionLevel = .timeSensitive
                content.relevanceScore = 1.0
            }
            return content
        }

        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let toRemove = pending
                .map(\.identifier)
                .filter { $0 == id || $0.hasPrefix("\(id)_alarm_") }
            if !toRemove.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: toRemove)
            }

            let baseTrigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            let baseRequest = UNNotificationRequest(identifier: id, content: mkContent(), trigger: baseTrigger)
            center.add(baseRequest) { _ in }

            if repeatCount > 0 {
                for i in 1...repeatCount {
                    let alarmId = "\(id)_alarm_\(String(format: "%03d", i))"
                    let t = seconds + (Double(i) * repeatEverySeconds)
                    let trig = UNTimeIntervalNotificationTrigger(timeInterval: t, repeats: false)
                    let req = UNNotificationRequest(identifier: alarmId, content: mkContent(), trigger: trig)
                    center.add(req) { _ in }
                }
            }
            call.resolve()
        }
    }

    @objc func cancelRestTimer(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { pending in
            let toRemove = pending
                .map(\.identifier)
                .filter { $0 == id || $0.hasPrefix("\(id)_alarm_") }
            if !toRemove.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: toRemove)
            } else {
                center.removePendingNotificationRequests(withIdentifiers: [id])
            }
            let deliveredIds = !toRemove.isEmpty ? toRemove : [id]
            center.removeDeliveredNotifications(withIdentifiers: deliveredIds)
            call.resolve()
        }
    }

    // MARK: - Live Activities

    @objc func startRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            startRestLiveActivityAvailable(call)
            return
        }
        call.resolve()
    }

    @objc func updateRestLiveActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            updateRestLiveActivityAvailable(call)
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

                // Start background alarm scheduler
                await MainActor.run {
                    self.startBackgroundAlarmScheduler(restId: id, seconds: seconds)
                }

                call.resolve()
            } catch {
                call.reject("live_activity_error", error.localizedDescription)
            }
        }
    }

    @available(iOS 16.2, *)
    private func updateRestLiveActivityAvailable(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let isFinished = call.getBool("isFinished") ?? false
        if let activity = Self.restActivities[id] as? Activity<RestTimerAttributes> {
            Task {
                let current = activity.contentState
                let updated = RestTimerAttributes.ContentState(
                    endTime: current.endTime,
                    title: current.title,
                    isFinished: isFinished
                )
                if isFinished {
                    // AlertConfiguration acorda a tela bloqueada (Apple docs)
                    let alertConfig = AlertConfiguration(
                        title: "⏰ Tempo Esgotado!",
                        body: "Hora de voltar para o treino!",
                        sound: .default
                    )
                    let content = ActivityContent(
                        state: updated,
                        staleDate: nil,
                        relevanceScore: 1.0
                    )
                    await activity.update(content, alertConfiguration: alertConfig)
                } else {
                    await activity.update(using: updated)
                }
                call.resolve()
            }
            return
        }
        call.resolve()
    }

    @available(iOS 16.2, *)
    private func endRestLiveActivityAvailable(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        // Stop alarm when ending live activity
        stopAlarmInternal()
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

    // MARK: - Background Alarm Sound System

    private func startBackgroundAlarmScheduler(restId: String, seconds: Double) {
        stopAlarmInternal()
        alarmRestId = restId

        // Configure audio session for background playback
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch { return }

        // Play near-silent audio to keep app process alive in background
        if let url = generateSilentWav() {
            do {
                silentPlayer = try AVAudioPlayer(contentsOf: url)
                silentPlayer?.numberOfLoops = -1
                silentPlayer?.volume = 0.01
                silentPlayer?.play()
            } catch {}
        }

        // Schedule the alarm to fire when rest timer ends
        let item = DispatchWorkItem { [weak self] in
            self?.fireAlarm()
        }
        alarmDispatchItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }

    private func fireAlarm() {
        // Stop silent player
        silentPlayer?.stop()
        silentPlayer = nil

        // Generate and play looping alarm tone
        if let url = generateAlarmWav() {
            do {
                alarmPlayer = try AVAudioPlayer(contentsOf: url)
                alarmPlayer?.numberOfLoops = -1
                alarmPlayer?.volume = 1.0
                alarmPlayer?.play()
            } catch {}
        }

        // Atualiza Live Activity com AlertConfiguration — acorda a tela bloqueada.
        // Apple documenta: "To wake the device's screen, use the AlertConfiguration object."
        if #available(iOS 16.2, *) {
            if let id = alarmRestId, let activity = Self.restActivities[id] as? Activity<RestTimerAttributes> {
                Task {
                    let current = activity.contentState
                    let updated = RestTimerAttributes.ContentState(
                        endTime: current.endTime,
                        title: current.title,
                        isFinished: true
                    )
                    let alertConfig = AlertConfiguration(
                        title: "⏰ Tempo Esgotado!",
                        body: "Hora de voltar para o treino!",
                        sound: .default
                    )
                    let content = ActivityContent(
                        state: updated,
                        staleDate: nil,
                        relevanceScore: 1.0
                    )
                    await activity.update(content, alertConfiguration: alertConfig)
                }
            }
        }

        // Trigger haptic
        DispatchQueue.main.async {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
    }

    private func stopAlarmInternal() {
        alarmDispatchItem?.cancel()
        alarmDispatchItem = nil
        alarmPlayer?.stop()
        alarmPlayer = nil
        silentPlayer?.stop()
        silentPlayer = nil
        alarmRestId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    @objc func stopAlarmSound(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopAlarmInternal()
            call.resolve()
        }
    }

    // MARK: - Audio Generation

    private func generateSilentWav() -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("it_silent.wav")
        if FileManager.default.fileExists(atPath: url.path) { return url }

        let sampleRate: UInt32 = 44100
        let numSamples: UInt32 = sampleRate // 1 second of silence
        let dataSize = numSamples * 2
        let fileSize = 36 + dataSize

        var data = Data()
        data.append(contentsOf: [0x52, 0x49, 0x46, 0x46]) // RIFF
        appendUInt32(&data, fileSize)
        data.append(contentsOf: [0x57, 0x41, 0x56, 0x45]) // WAVE
        data.append(contentsOf: [0x66, 0x6D, 0x74, 0x20]) // fmt
        appendUInt32(&data, 16) // chunk size
        appendUInt16(&data, 1)  // PCM
        appendUInt16(&data, 1)  // mono
        appendUInt32(&data, sampleRate)
        appendUInt32(&data, sampleRate * 2) // byte rate
        appendUInt16(&data, 2)  // block align
        appendUInt16(&data, 16) // bits per sample
        data.append(contentsOf: [0x64, 0x61, 0x74, 0x61]) // data
        appendUInt32(&data, dataSize)
        data.append(Data(count: Int(dataSize))) // silence

        try? data.write(to: url)
        return url
    }

    private func generateAlarmWav() -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("it_alarm.wav")
        if FileManager.default.fileExists(atPath: url.path) { return url }

        let sampleRate: Double = 44100
        // 3 beeps: A5(880Hz) C6(1047Hz) E6(1319Hz) with gaps
        let beepDuration: Double = 0.15
        let gapDuration: Double = 0.08
        let frequencies: [Double] = [880, 1047, 1319]
        let totalDuration = Double(frequencies.count) * beepDuration + Double(frequencies.count - 1) * gapDuration + 0.4 // trailing silence

        var samples = [Int16]()
        var t: Double = 0

        for (idx, freq) in frequencies.enumerated() {
            let numBeepSamples = Int(sampleRate * beepDuration)
            for i in 0..<numBeepSamples {
                let s = Double(i) / sampleRate
                // Envelope
                let env: Double
                if s < 0.01 { env = s / 0.01 }
                else if s > beepDuration - 0.01 { env = (beepDuration - s) / 0.01 }
                else { env = 1.0 }
                let value = sin(2.0 * .pi * freq * s) * env * 0.85
                samples.append(Int16(value * Double(Int16.max)))
            }
            t += beepDuration
            // Gap (silence)
            if idx < frequencies.count - 1 {
                let numGapSamples = Int(sampleRate * gapDuration)
                for _ in 0..<numGapSamples {
                    samples.append(0)
                }
                t += gapDuration
            }
        }
        // Trailing silence
        let trailSamples = Int(sampleRate * 0.4)
        for _ in 0..<trailSamples {
            samples.append(0)
        }

        let numSamples = samples.count
        let dataSize = UInt32(numSamples * 2)
        let fileSize = 36 + dataSize

        var data = Data()
        data.append(contentsOf: [0x52, 0x49, 0x46, 0x46])
        appendUInt32(&data, fileSize)
        data.append(contentsOf: [0x57, 0x41, 0x56, 0x45])
        data.append(contentsOf: [0x66, 0x6D, 0x74, 0x20])
        appendUInt32(&data, 16)
        appendUInt16(&data, 1)
        appendUInt16(&data, 1)
        appendUInt32(&data, 44100)
        appendUInt32(&data, 88200)
        appendUInt16(&data, 2)
        appendUInt16(&data, 16)
        data.append(contentsOf: [0x64, 0x61, 0x74, 0x61])
        appendUInt32(&data, dataSize)
        for sample in samples {
            data.append(contentsOf: withUnsafeBytes(of: sample.littleEndian) { Array($0) })
        }

        try? data.write(to: url)
        return url
    }

    private func appendUInt32(_ data: inout Data, _ value: UInt32) {
        data.append(contentsOf: withUnsafeBytes(of: value.littleEndian) { Array($0) })
    }

    private func appendUInt16(_ data: inout Data, _ value: UInt16) {
        data.append(contentsOf: withUnsafeBytes(of: value.littleEndian) { Array($0) })
    }

    // MARK: - Generic App Notification

    @objc func scheduleAppNotification(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? UUID().uuidString)
        let title = String(call.getString("title") ?? "IronTracks")
        let body = String(call.getString("body") ?? "")
        let delaySeconds = Double(call.getInt("delaySeconds") ?? 1)

        if body.isEmpty {
            call.resolve()
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let trigger: UNNotificationTrigger?
        if delaySeconds > 1 {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: delaySeconds, repeats: false)
        } else {
            trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        }

        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { _ in
            call.resolve(["id": id])
        }
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

    // MARK: - Photos

    @objc func saveImageToPhotos(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"),
              let data = Data(base64Encoded: base64),
              let image = UIImage(data: data) else {
            call.resolve(["saved": false, "error": "Dados de imagem inválidos"])
            return
        }

        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            switch status {
            case .authorized, .limited:
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }) { success, error in
                    if success {
                        call.resolve(["saved": true, "error": ""])
                    } else {
                        call.resolve(["saved": false, "error": error?.localizedDescription ?? "Falha ao salvar"])
                    }
                }
            case .denied, .restricted:
                call.resolve(["saved": false, "error": "permissionDenied"])
            default:
                call.resolve(["saved": false, "error": "Permissão não concedida"])
            }
        }
    }

    // MARK: - Save File to Photos (file path — no base64 overhead)

    @objc func saveFileToPhotos(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.resolve(["saved": false, "error": "Caminho do arquivo não informado"])
            return
        }
        let isVideo = call.getBool("isVideo") ?? false
        let fileURL = URL(fileURLWithPath: path)

        guard FileManager.default.fileExists(atPath: path) else {
            call.resolve(["saved": false, "error": "Arquivo não encontrado: \(path)"])
            return
        }

        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            switch status {
            case .authorized, .limited:
                PHPhotoLibrary.shared().performChanges({
                    if isVideo {
                        PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: fileURL)
                    } else {
                        guard let image = UIImage(contentsOfFile: path) else {
                            return
                        }
                        PHAssetChangeRequest.creationRequestForAsset(from: image)
                    }
                }) { success, error in
                    // Clean up temp file
                    try? FileManager.default.removeItem(at: fileURL)
                    if success {
                        call.resolve(["saved": true, "error": ""])
                    } else {
                        call.resolve(["saved": false, "error": error?.localizedDescription ?? "Falha ao salvar"])
                    }
                }
            case .denied, .restricted:
                call.resolve(["saved": false, "error": "permissionDenied"])
            default:
                call.resolve(["saved": false, "error": "Permissão não concedida"])
            }
        }
    }
}
