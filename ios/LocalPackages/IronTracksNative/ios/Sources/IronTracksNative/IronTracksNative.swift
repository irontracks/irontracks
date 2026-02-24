import Foundation
import Capacitor
import UserNotifications
import UIKit
import ActivityKit
import IronTracksLiveActivityShared

@objc(IronTracksNative)
public class IronTracksNative: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IronTracksNative"
    public let jsName = "IronTracksNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setIdleTimerDisabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotificationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleRestTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelRestTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRestLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endRestLiveActivity", returnType: CAPPluginReturnPromise)
    ]
    private static var restActivities: [String: Any] = [:]

    @objc func setIdleTimerDisabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve()
        }
    }

    @objc func requestNotificationPermission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            call.resolve(["granted": granted])
        }
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

    @objc func startRestLiveActivity(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        let seconds = Double(call.getInt("seconds") ?? 0)
        let title = String(call.getString("title") ?? "Descanso")
        if seconds <= 0 {
            call.resolve()
            return
        }
        if #available(iOS 16.1, *) {
            let start = Date()
            let end = start.addingTimeInterval(seconds)
            let attributes = RestTimerAttributes(startTime: start, totalSeconds: Int(seconds))
            let content = RestTimerAttributes.ContentState(endTime: end, title: title)
            Task {
                do {
                    let activity = try Activity<RestTimerAttributes>.request(attributes: attributes, contentState: content, pushType: nil)
                    Self.restActivities[id] = activity
                    call.resolve()
                } catch {
                    call.reject("live_activity_error")
                }
            }
        } else {
            call.resolve()
        }
    }

    @objc func endRestLiveActivity(_ call: CAPPluginCall) {
        let id = String(call.getString("id") ?? "rest_timer")
        if #available(iOS 16.1, *) {
            if let activity = Self.restActivities[id] as? Activity<RestTimerAttributes> {
                Task {
                    await activity.end(nil, dismissalPolicy: .immediate)
                    Self.restActivities.removeValue(forKey: id)
                    call.resolve()
                }
                return
            }
        }
        call.resolve()
    }
}
