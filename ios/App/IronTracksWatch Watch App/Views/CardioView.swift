//
//  CardioView.swift
//  IronTracksWatch
//
//  Tela 3 — Cardio: corrida / caminhada / bike com GPS do relógio + FC do HealthKit.
//
//  ⚠️ Reescrita em 02/09/2026. O que estava quebrado aqui custava a corrida inteira:
//
//   • PAUSAR VOLTAVA PARA A TELA INICIAL. A tela trocava por `if health.isRunning`,
//     e o delegate zerava esse flag ao pausar. Pausar num semáforo levava ao
//     `idleView` sem botão de retomar — e "INICIAR" criava uma segunda sessão por
//     cima da primeira, que ficava órfã. Hoje a tela olha `hasActiveSession`, que
//     inclui pausado.
//   • A ABA ADOTAVA A SESSÃO DA OUTRA TELA. Como o HealthKitManager é singleton,
//     uma sessão de musculação iniciada na aba Treino fazia esta tela se desenhar
//     como "corrida em andamento" — sem GPS, sem cronômetro, sem rota. Hoje só
//     assume a tela ativa se `activeKind == .cardio`.
//   • GPS NEGADO INICIAVA MESMO ASSIM, sem avisar: o usuário corria 40 min para
//     descobrir no fim que a distância era zero.
//

import SwiftUI
import HealthKit

struct CardioView: View {

    @EnvironmentObject var session: WatchSessionManager
    @EnvironmentObject var health: HealthKitManager
    @EnvironmentObject var location: LocationManager

    @State private var elapsedSeconds: Int = 0
    @State private var timer: Timer?
    @State private var sport: Sport = .running
    @State private var aviso: String?

    /// Esta tela só se considera ativa se a sessão viva for DELA. Sem isto, a aba
    /// Cardio se desenhava por causa de um treino de musculação da aba vizinha.
    private var cardioAtivo: Bool {
        health.hasActiveSession && health.activeKind == .cardio
    }

    enum Sport: String, CaseIterable {
        case running = "Corrida"
        case walking = "Caminhada"
        case cycling = "Bike"

        var hkType: HKWorkoutActivityType {
            switch self {
            case .running: return .running
            case .walking: return .walking
            case .cycling: return .cycling
            }
        }

        var icon: String {
            switch self {
            case .running: return "figure.run"
            case .walking: return "figure.walk"
            case .cycling: return "bicycle"
            }
        }

        /// O vocabulário que `/api/gps/cardio/save` aceita (`VALID_ACTIVITY_TYPES`).
        /// Mandar o rawValue em português ("Corrida") seria 400 no servidor.
        var serverActivityType: String {
            switch self {
            case .running: return "running"
            case .walking: return "walking"
            case .cycling: return "cycling"
            }
        }

        /// Perfil de filtro do GPS. Bike passa de 45 km/h em qualquer descida — o
        /// limiar fixo antigo descartava esses pontos e o traçado virava uma corda
        /// reta cortando a descida, com a distância do trecho perdida.
        var locationProfile: LocationManager.SportProfile {
            switch self {
            case .running: return .running
            case .walking: return .walking
            case .cycling: return .cycling
            }
        }
    }

    var body: some View {
        Group {
            if !session.dashboard.isVip {
                // Bloqueia feature VIP — não inicia HKWorkoutSession nem GPS.
                VipGatePaywallView()
            } else {
                ScrollView {
                    if cardioAtivo {
                        activeView
                    } else {
                        idleView
                    }
                }
                .navigationTitle("Cardio")
            }
        }
        .onDisappear {
            // Sem isto o Timer seguia no RunLoop retendo o closure quando a view
            // era descartada com o treino ativo.
            if !cardioAtivo { pararTimer() }
        }
    }

    // ─── Ocioso ─────────────────────────────────────────────────────────

    private var idleView: some View {
        VStack(spacing: 8) {
            Picker("Esporte", selection: $sport) {
                ForEach(Sport.allCases, id: \.self) { s in
                    Label(s.rawValue, systemImage: s.icon).tag(s)
                }
            }
            .pickerStyle(.navigationLink)
            .frame(height: 36)
            .accessibilityLabel("Esporte")
            .accessibilityValue(sport.rawValue)

            Button(action: startCardio) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("INICIAR")
                        .font(.system(size: 15, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(Brand.success)
            .accessibilityLabel("Iniciar \(sport.rawValue)")

            statusBadge

            if let aviso {
                Text(aviso)
                    .font(Brand.labelFont)
                    .foregroundStyle(Brand.warning)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(6)
    }

    // ─── Ativo ──────────────────────────────────────────────────────────

    private var activeView: some View {
        VStack(spacing: 6) {
            // HERÓI: distância. Uma métrica domina — as outras apoiam. Antes os
            // quatro números tinham o mesmo peso e nenhum se lia de relance.
            VStack(spacing: 0) {
                Text(formatDistance(location.distanceMeters))
                    .font(Brand.heroFont)
                    .foregroundStyle(Brand.goldGradient)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(location.distanceMeters >= 1000 ? "km" : "metros")
                    .font(Brand.labelFont)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Distância")
            .accessibilityValue("\(formatDistance(location.distanceMeters)) \(location.distanceMeters >= 1000 ? "quilômetros" : "metros")")

            // SEGUNDO: o tempo, que é o número que o corredor cruza com a distância.
            Text(formatTime(elapsedSeconds))
                .font(Brand.secondaryMetricFont)
                .foregroundStyle(health.isPaused ? Brand.warning : .white)
                .accessibilityLabel("Tempo")
                .accessibilityValue(formatTime(elapsedSeconds))

            // APOIO: pace, FC e calorias.
            HStack(spacing: 4) {
                statTile(label: "PACE", value: formatPace, color: Brand.goldLight, acessivel: "Ritmo")
                statTile(label: "FC", value: health.heartRate > 0 ? "\(health.heartRate)" : "—", color: Brand.danger, acessivel: "Frequência cardíaca")
                statTile(label: "KCAL", value: "\(Int(health.caloriesActive))", color: Brand.warning, acessivel: "Calorias")
            }

            if health.isPaused {
                Text("PAUSADO")
                    .font(Brand.labelFont)
                    .foregroundStyle(Brand.warning)
            }

            HStack {
                Image(systemName: gpsIcon)
                    .foregroundStyle(gpsColor)
                Text(location.accuracyMeters > 0 ? "±\(Int(location.accuracyMeters))m" : "GPS…")
                    .font(Brand.labelFont)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Precisão do GPS")

            if let erro = health.lastError ?? location.lastError {
                Text(erro)
                    .font(Brand.labelFont)
                    .foregroundStyle(Brand.warning)
                    .multilineTextAlignment(.leading)
            }

            HStack(spacing: 4) {
                if health.isPaused {
                    Button(action: resumeCardio) {
                        Image(systemName: "play.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Brand.success)
                    .accessibilityLabel("Retomar")
                } else {
                    Button(action: pauseCardio) {
                        Image(systemName: "pause.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                    .tint(Brand.goldLight)
                    .accessibilityLabel("Pausar")
                }
                Button(action: { Task { await stopCardio() } }) {
                    Image(systemName: "stop.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.danger)
                .accessibilityLabel("Encerrar \(sport.rawValue)")
            }
        }
        .padding(.horizontal, 4)
    }

    // ─── Componentes ────────────────────────────────────────────────────

    private func statTile(label: String, value: String, color: Color, acessivel: String) -> some View {
        VStack(spacing: 0) {
            Text(label)
                .font(Brand.labelFont)
                .foregroundStyle(.secondary)
            Text(value)
                .font(Brand.tileValueFont)
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .brandTile()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(acessivel)
        .accessibilityValue(value)
    }

    private var gpsLiberado: Bool {
        location.authorizationStatus == .authorizedWhenInUse || location.authorizationStatus == .authorizedAlways
    }

    private var statusBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: gpsLiberado ? "location.fill" : "location.slash")
                .foregroundStyle(gpsLiberado ? Brand.success : Brand.warning)
            Text(gpsLiberado ? "GPS pronto" : "GPS pendente")
                .font(Brand.labelFont)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(gpsLiberado ? "GPS pronto" : "GPS pendente")
    }

    // ─── Ações ──────────────────────────────────────────────────────────

    private func startCardio() {
        guard session.dashboard.isVip else { return }
        aviso = nil

        // GPS negado não pode iniciar em silêncio: sem localização não há
        // distância, pace nem traçado — o usuário correria para nada.
        switch location.authorizationStatus {
        case .notDetermined:
            location.requestAuthorization()
            aviso = "Autorize a localização e toque em INICIAR de novo."
            return
        case .denied, .restricted:
            aviso = "Sem GPS não dá para medir a corrida. Libere a localização nos Ajustes."
            return
        default:
            break
        }

        location.configure(for: sport.locationProfile)
        location.reset()
        location.onValidLocation = { locs in
            health.appendLocations(locs)
        }
        location.startTracking()

        // `start` devolve false quando já existe sessão viva — antes isso era um
        // guard mudo e a tela seguia como se tivesse começado.
        guard health.start(kind: .cardio, activityType: sport.hkType, locationType: .outdoor) else {
            location.stopTracking()
            aviso = "Já existe um treino em andamento."
            return
        }

        elapsedSeconds = 0
        iniciarTimer()
        WKInterfaceDeviceShim.success()
    }

    private func pauseCardio() {
        location.stopTracking()
        health.pause()
    }

    private func resumeCardio() {
        location.startTracking()
        health.resume()
    }

    private func stopCardio() async {
        pararTimer()
        location.stopTracking()
        let summary = await health.stop(
            saveToHealth: true,
            activityType: sport.serverActivityType,
            route: location.trackPoints
        )
        location.reset()
        elapsedSeconds = 0

        guard let summary else {
            // Antes o app tocava o háptico de SUCESSO e limpava a tela mesmo
            // quando o resumo tinha evaporado — confirmação tátil de um treino
            // que foi descartado.
            aviso = "Não consegui fechar o treino. Nada foi perdido no relógio."
            WKInterfaceDeviceShim.failure()
            return
        }
        session.sendCardioFinish(summary)
        WKInterfaceDeviceShim.notification()
    }

    private func iniciarTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                // O cronômetro segue o estado REAL da sessão: pausado não conta,
                // e é a mesma conta que vai no resumo salvo.
                if health.sessionState == .running { elapsedSeconds += 1 }
            }
        }
    }

    private func pararTimer() {
        timer?.invalidate()
        timer = nil
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private func formatDistance(_ meters: Double) -> String {
        if meters < 1000 { return "\(Int(meters))" }
        return String(format: "%.2f", meters / 1000)
    }

    private func formatTime(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    private var formatPace: String {
        guard location.distanceMeters > 0, elapsedSeconds > 0 else { return "—" }
        let km = location.distanceMeters / 1000
        let pace = (Double(elapsedSeconds) / 60) / km
        let mins = Int(pace)
        let secs = Int((pace - Double(mins)) * 60)
        return String(format: "%d'%02d\"", mins, secs)
    }

    private var gpsIcon: String {
        if location.accuracyMeters == 0 { return "location.slash" }
        if location.accuracyMeters <= 10 { return "location.fill" }
        if location.accuracyMeters <= 30 { return "location" }
        return "location.slash"
    }

    private var gpsColor: Color {
        if location.accuracyMeters == 0 { return .gray }
        if location.accuracyMeters <= 10 { return Brand.success }
        if location.accuracyMeters <= 30 { return Brand.goldLight }
        return Brand.danger
    }
}

#Preview {
    CardioView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
        .environmentObject(LocationManager.shared)
}
