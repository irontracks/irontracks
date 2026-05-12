//
//  WatchSessionManager.swift
//  IronTracksWatch
//
//  Gerencia a comunicação WatchConnectivity entre Watch <-> iPhone.
//  Singleton — UI observa via @Published.
//

import Foundation
import WatchConnectivity

@MainActor
final class WatchSessionManager: NSObject, ObservableObject {

    static let shared = WatchSessionManager()

    // ─── Estado público observável ──────────────────────────────────────────
    @Published private(set) var isReachable: Bool = false
    @Published private(set) var dashboard: WatchDashboard = .placeholder
    @Published private(set) var nearestGyms: [WatchGym] = []
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var hasSession: Bool = false
    @Published private(set) var lastError: String?

    // ─── WCSession ──────────────────────────────────────────────────────────
    private let session: WCSession?

    private override init() {
        if WCSession.isSupported() {
            self.session = WCSession.default
        } else {
            self.session = nil
        }
        super.init()
        self.session?.delegate = self
        self.session?.activate()

        // Tenta recuperar estado persistido (latest applicationContext) imediatamente.
        if let context = self.session?.receivedApplicationContext, !context.isEmpty {
            self.handleApplicationContext(context)
        }
    }

    // ─── API pública ────────────────────────────────────────────────────────

    /// Pede ao iPhone para mandar os dados mais recentes (dashboard, treino do dia, etc).
    func requestRefresh() {
        sendMessage(WatchMessage(kind: .requestRefresh))
    }

    /// Notifica o iPhone que uma série foi registrada no Watch.
    func logSet(_ log: WatchSetLog) {
        do {
            let msg = try WatchMessage.encode(.logSet, payload: log)
            sendMessage(msg, transmitOffline: true)
        } catch {
            self.lastError = "logSet encode falhou: \(error.localizedDescription)"
        }
    }

    /// Notifica o iPhone que um cardio terminou (com pontos de GPS, FC, etc).
    func sendCardioFinish(_ summary: WatchCardioSummary) {
        do {
            let msg = try WatchMessage.encode(.cardioFinish, payload: summary)
            sendMessage(msg, transmitOffline: true)
        } catch {
            self.lastError = "cardioFinish encode falhou: \(error.localizedDescription)"
        }
    }

    /// Watch pede pra fazer check-in numa academia (iPhone executa).
    func requestCheckin(gym: WatchGym) {
        do {
            let msg = try WatchMessage.encode(.checkinRequest, payload: gym)
            sendMessage(msg, transmitOffline: true)
        } catch {
            self.lastError = "checkinRequest encode falhou: \(error.localizedDescription)"
        }
    }

    // ─── Envio (com fallback offline via transferUserInfo) ──────────────────

    private func sendMessage(_ msg: WatchMessage, transmitOffline: Bool = false) {
        guard let session = session, session.activationState == .activated else {
            self.lastError = "Sessão Watch não ativa."
            return
        }

        let dict = msg.toDictionary()

        // Caminho rápido: iPhone alcançável → sendMessage (instantâneo).
        if session.isReachable {
            session.sendMessage(dict, replyHandler: nil) { [weak self] error in
                Task { @MainActor in
                    self?.lastError = "sendMessage falhou: \(error.localizedDescription)"
                    // Fallback pra fila offline se permitido
                    if transmitOffline {
                        session.transferUserInfo(dict)
                    }
                }
            }
            return
        }

        // Sem reach: usar transferUserInfo (entregue quando o iPhone vier).
        if transmitOffline {
            session.transferUserInfo(dict)
        } else {
            self.lastError = "iPhone não alcançável e sem fallback offline."
        }
    }

    // ─── Handlers internos (dispatch a partir do delegate) ──────────────────

    fileprivate func handleApplicationContext(_ context: [String: Any]) {
        guard let msg = WatchMessage.fromDictionary(context) else { return }
        self.dispatch(msg)
    }

    fileprivate func handleMessage(_ message: [String: Any]) {
        guard let msg = WatchMessage.fromDictionary(message) else { return }
        self.dispatch(msg)
    }

    private func dispatch(_ msg: WatchMessage) {
        switch msg.kind {
        case .dashboardUpdate:
            do {
                let dash = try msg.decodePayload(as: WatchDashboard.self)
                self.dashboard = dash
                self.lastSyncDate = Date()
                self.hasSession = true
            } catch {
                self.lastError = "Dashboard decode falhou: \(error.localizedDescription)"
            }

        case .workoutPush:
            do {
                let workout = try msg.decodePayload(as: WatchWorkout.self)
                // Atualiza o dashboard refletindo o treino pushado.
                self.dashboard = WatchDashboard(
                    streakDays: self.dashboard.streakDays,
                    weekWorkouts: self.dashboard.weekWorkouts,
                    weekGoal: self.dashboard.weekGoal,
                    nextWorkout: workout,
                    userName: self.dashboard.userName,
                    isWorkoutActive: self.dashboard.isWorkoutActive,
                    activeWorkoutId: self.dashboard.activeWorkoutId
                )
                self.lastSyncDate = Date()
            } catch {
                self.lastError = "Workout decode falhou: \(error.localizedDescription)"
            }

        case .nearestGym:
            do {
                let gyms = try msg.decodePayload(as: [WatchGym].self)
                self.nearestGyms = gyms
            } catch {
                self.lastError = "Gyms decode falhou: \(error.localizedDescription)"
            }

        case .sessionAuth:
            // Watch não usa auth direto — só rebatemos via iPhone.
            self.hasSession = true

        // Mensagens Watch → iPhone (não devem chegar aqui)
        case .requestRefresh, .logSet, .cardioFinish, .checkinRequest:
            break
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if let error = error {
                self.lastError = "Activation: \(error.localizedDescription)"
            }
            // Pede um refresh assim que ativar — assim o Watch já mostra estado atual.
            if activationState == .activated, session.isReachable {
                self.requestRefresh()
            }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if session.isReachable {
                self.requestRefresh()
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in
            self.handleMessage(message)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in
            self.handleApplicationContext(applicationContext)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in
            self.handleMessage(userInfo)
        }
    }
}
