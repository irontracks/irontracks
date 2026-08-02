//
//  RestTimerEngine.swift
//  IronTracksWatch
//
//  Timer de descanso entre séries.
//
//  Por que existe (o timer antigo tinha 3 defeitos sérios):
//   1. Contava com `Timer` decrementando um Int. Se o app saísse de foreground — pulso
//      abaixado, troca de app, Always-On — o tique atrasava ou parava, e o usuário
//      voltava pra um descanso errado. Aqui a VERDADE é uma data de término (`endDate`);
//      o restante é sempre calculado a partir do relógio, então nunca desvia.
//   2. Não avisava se você não estivesse olhando. Agora: háptico de contagem nos últimos
//      3s, háptico forte no fim e uma notificação local como rede de segurança caso o
//      app tenha sido suspenso.
//   3. Não dava pra esticar o descanso sem reiniciar. Agora tem +30s.
//

import Foundation
import WatchKit
import UserNotifications

@MainActor
final class RestTimerEngine: ObservableObject {

    static let shared = RestTimerEngine()

    /// Instante em que o descanso acaba. Fonte da verdade — nil = não está descansando.
    @Published private(set) var endDate: Date?
    /// Duração cheia do descanso atual, pra desenhar o anel de progresso.
    @Published private(set) var totalSeconds: Int = 0

    private var tickTimer: Timer?
    private var lastHapticSecond: Int = -1
    private let notificationID = "irontracks.rest.finished"

    private init() {}

    var isResting: Bool { endDate != nil }

    // ─── Ciclo de vida ──────────────────────────────────────────────────────

    /// Começa (ou reinicia) o descanso.
    func start(seconds: Int) {
        let clamped = max(1, seconds)
        totalSeconds = clamped
        endDate = Date().addingTimeInterval(TimeInterval(clamped))
        lastHapticSecond = -1
        scheduleTick()
        scheduleFinishNotification(after: clamped)
    }

    /// Estica o descanso sem perder o que já correu.
    func addTime(_ seconds: Int) {
        guard let current = endDate else { return }
        let newEnd = current.addingTimeInterval(TimeInterval(seconds))
        endDate = newEnd
        totalSeconds += seconds
        lastHapticSecond = -1
        scheduleFinishNotification(after: max(0, Int(newEnd.timeIntervalSinceNow)))
        WKInterfaceDevice.current().play(.click)
    }

    /// Encerra por ação do usuário (pular) — sem háptico de conclusão.
    func skip() {
        clear()
    }

    /// Encerra porque o tempo acabou — com háptico forte.
    private func complete() {
        clear()
        WKInterfaceDevice.current().play(.notification)
    }

    private func clear() {
        tickTimer?.invalidate()
        tickTimer = nil
        endDate = nil
        totalSeconds = 0
        lastHapticSecond = -1
        cancelFinishNotification()
    }

    // ─── Leitura (sempre derivada do relógio) ───────────────────────────────

    /// Segundos restantes num dado instante. Nunca negativo.
    func remaining(at now: Date = Date()) -> Int {
        guard let endDate = endDate else { return 0 }
        return max(0, Int(endDate.timeIntervalSince(now).rounded(.up)))
    }

    /// Progresso 0...1 do descanso (1 = acabou), pro anel.
    func progress(at now: Date = Date()) -> Double {
        guard totalSeconds > 0 else { return 1 }
        let done = Double(totalSeconds - remaining(at: now))
        return min(1, max(0, done / Double(totalSeconds)))
    }

    // ─── Tique (só pra háptico; a UI lê pelo relógio) ───────────────────────

    private func scheduleTick() {
        tickTimer?.invalidate()
        // 0.25s pra não perder a virada do segundo por arredondamento.
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        // .common: continua tiquetaqueando enquanto a tela rola.
        RunLoop.main.add(timer, forMode: .common)
        tickTimer = timer
    }

    private func tick() {
        guard endDate != nil else { return }
        let left = remaining()

        if left <= 0 {
            complete()
            return
        }

        // Contagem regressiva tátil: um toque por segundo nos últimos 3.
        if left <= 3, left != lastHapticSecond {
            lastHapticSecond = left
            WKInterfaceDevice.current().play(.click)
        }
    }

    // ─── Rede de segurança: notificação local ───────────────────────────────
    //
    // Enquanto há um HKWorkoutSession ativo o app fica vivo em background
    // (WKBackgroundModes = workout-processing) e o háptico acima basta. Mas se a
    // sessão não estiver rodando — ou o sistema suspender o app — a notificação
    // garante que o usuário sinta o fim do descanso mesmo assim.

    /// Pede permissão de notificação. Chamado no launch, junto do HealthKit.
    /// Silencioso: se o usuário negar, o app segue funcionando com háptico in-app.
    static func requestNotificationPermission() async {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound])
    }

    private func scheduleFinishNotification(after seconds: Int) {
        cancelFinishNotification()
        guard seconds > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Descanso concluído"
        content.body = "Bora pra próxima série."
        content.sound = .default

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: TimeInterval(seconds),
            repeats: false
        )
        let request = UNNotificationRequest(
            identifier: notificationID,
            content: content,
            trigger: trigger
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func cancelFinishNotification() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [notificationID])
    }
}
