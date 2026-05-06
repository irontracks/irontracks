//
//  WatchBridge.swift
//  App
//
//  Lado iPhone do WatchConnectivity. Roda dentro do app Capacitor e
//  é a contraparte do WatchSessionManager do Watch.
//
//  Função: receber mensagens do Watch (logSet, cardioFinish, requestRefresh,
//  checkinRequest) e relé-las pra camada JS via Capacitor events. Também
//  envia mensagens em sentido contrário (dashboard, workout push, gym list).
//

import Foundation
import WatchConnectivity
import Capacitor

/// Notification names — IronTracksNativePlugin observa estas e relé pra JS.
extension Notification.Name {
    static let watchSetLogged           = Notification.Name("WatchSetLogged")
    static let watchCardioFinished      = Notification.Name("WatchCardioFinished")
    static let watchRefreshRequested    = Notification.Name("WatchRefreshRequested")
    static let watchCheckinRequested    = Notification.Name("WatchCheckinRequested")
    static let watchReachabilityChanged = Notification.Name("WatchReachabilityChanged")
}

/// Mesmas constantes do lado Watch — tudo string pra wire-protocol estável.
enum WatchBridgeKind: String {
    // iPhone → Watch
    case dashboardUpdate    = "dashboard.update"
    case workoutPush        = "workout.push"
    case nearestGym         = "gym.nearest"
    case sessionAuth        = "session.auth"
    // Watch → iPhone
    case requestRefresh     = "refresh.request"
    case logSet             = "set.log"
    case cardioFinish       = "cardio.finish"
    case checkinRequest     = "checkin.request"
}

@MainActor
final class WatchBridge: NSObject {

    static let shared = WatchBridge()

    private let session: WCSession?

    @Published private(set) var isReachable = false
    @Published private(set) var isPaired = false
    @Published private(set) var isWatchAppInstalled = false

    private override init() {
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        super.init()
        self.session?.delegate = self
        self.session?.activate()
    }

    // ─── API pública (chamada pelo plugin) ──────────────────────────────────

    /// Envia o estado completo do dashboard pro Watch (via applicationContext —
    /// persistente, sobrevive a reinícios do Watch).
    func sendDashboard(_ dashboardJson: String) {
        guard let data = dashboardJson.data(using: .utf8) else { return }
        let dict: [String: Any] = [
            "kind": WatchBridgeKind.dashboardUpdate.rawValue,
            "payload": data,
            "sentAt": Date().timeIntervalSince1970,
        ]
        try? session?.updateApplicationContext(dict)

        // Tenta também via sendMessage pra entrega instantânea se reach.
        if session?.isReachable == true {
            session?.sendMessage(dict, replyHandler: nil, errorHandler: nil)
        }
    }

    /// Pusha um workout específico pro Watch.
    func sendWorkout(_ workoutJson: String) {
        guard let data = workoutJson.data(using: .utf8) else { return }
        sendWithFallback(kind: .workoutPush, payload: data)
    }

    /// Manda lista de academias próximas pro Watch.
    func sendNearestGyms(_ gymsJson: String) {
        guard let data = gymsJson.data(using: .utf8) else { return }
        sendWithFallback(kind: .nearestGym, payload: data)
    }

    private func sendWithFallback(kind: WatchBridgeKind, payload: Data) {
        guard let session = session else { return }
        let dict: [String: Any] = [
            "kind": kind.rawValue,
            "payload": payload,
            "sentAt": Date().timeIntervalSince1970,
        ]
        if session.isReachable {
            session.sendMessage(dict, replyHandler: nil) { _ in
                // Fallback offline
                session.transferUserInfo(dict)
            }
        } else {
            session.transferUserInfo(dict)
        }
    }

    /// Estado pra JS.
    func currentState() -> [String: Any] {
        return [
            "isPaired": isPaired,
            "isReachable": isReachable,
            "isWatchAppInstalled": isWatchAppInstalled,
            "isSupported": WCSession.isSupported(),
        ]
    }

    // ─── Recepção (delegate handlers) ───────────────────────────────────────

    fileprivate func handleIncoming(_ dict: [String: Any]) {
        guard let kindRaw = dict["kind"] as? String,
              let kind = WatchBridgeKind(rawValue: kindRaw) else { return }
        let payloadString: String? = {
            if let data = dict["payload"] as? Data {
                return String(data: data, encoding: .utf8)
            }
            return nil
        }()

        let userInfo: [String: Any] = [
            "kind": kind.rawValue,
            "payload": payloadString ?? "",
        ]

        switch kind {
        case .requestRefresh:
            NotificationCenter.default.post(name: .watchRefreshRequested, object: nil, userInfo: userInfo)
        case .logSet:
            NotificationCenter.default.post(name: .watchSetLogged, object: nil, userInfo: userInfo)
        case .cardioFinish:
            NotificationCenter.default.post(name: .watchCardioFinished, object: nil, userInfo: userInfo)
        case .checkinRequest:
            NotificationCenter.default.post(name: .watchCheckinRequested, object: nil, userInfo: userInfo)
        case .dashboardUpdate, .workoutPush, .nearestGym, .sessionAuth:
            break  // mensagens iPhone→Watch — não chegam aqui
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchBridge: WCSessionDelegate {

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isPaired = session.isPaired
            self.isWatchAppInstalled = session.isWatchAppInstalled
            self.isReachable = session.isReachable
            NotificationCenter.default.post(name: .watchReachabilityChanged, object: nil, userInfo: self.currentState())
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {
        // Re-activate on the next foreground
        WCSession.default.activate()
    }

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isPaired = session.isPaired
            self.isWatchAppInstalled = session.isWatchAppInstalled
            NotificationCenter.default.post(name: .watchReachabilityChanged, object: nil, userInfo: self.currentState())
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            NotificationCenter.default.post(name: .watchReachabilityChanged, object: nil, userInfo: self.currentState())
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            self.handleIncoming(message)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in
            self.handleIncoming(userInfo)
        }
    }
}
