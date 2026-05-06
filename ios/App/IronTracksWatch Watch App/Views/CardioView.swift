//
//  CardioView.swift
//  IronTracksWatch
//
//  Tela 3 — Cardio: rastreamento de corrida/caminhada/bike via GPS do Watch + FC.
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
    @State private var isPaused: Bool = false

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
    }

    var body: some View {
        ScrollView {
            if health.isRunning {
                activeView
            } else {
                idleView
            }
        }
        .navigationTitle("Cardio")
    }

    // ─── Tela quando NÃO está rodando ───────────────────────────────────

    private var idleView: some View {
        VStack(spacing: 8) {
            Picker("Esporte", selection: $sport) {
                ForEach(Sport.allCases, id: \.self) { s in
                    Label(s.rawValue, systemImage: s.icon).tag(s)
                }
            }
            .pickerStyle(.navigationLink)
            .frame(height: 36)

            Button(action: startCardio) {
                HStack {
                    Image(systemName: "play.fill")
                    Text("INICIAR")
                        .font(.caption.bold())
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)

            statusBadge
        }
        .padding(6)
    }

    // ─── Tela ativa ────────────────────────────────────────────────────

    private var activeView: some View {
        VStack(spacing: 4) {
            // Distância principal (destaque)
            VStack(spacing: 0) {
                Text(formatDistance(location.distanceMeters))
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(LinearGradient(
                        colors: [Color(red: 0.95, green: 0.78, blue: 0.30), Color(red: 0.78, green: 0.55, blue: 0.10)],
                        startPoint: .top, endPoint: .bottom
                    ))
                Text(location.distanceMeters >= 1000 ? "km" : "metros")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)

            // Stats em grid
            HStack(spacing: 4) {
                statTile(label: "TEMPO", value: formatTime(elapsedSeconds), color: .white)
                statTile(label: "PACE", value: formatPace, color: .yellow)
            }
            HStack(spacing: 4) {
                statTile(label: "FC", value: health.heartRate > 0 ? "\(health.heartRate)" : "—", color: .red)
                statTile(label: "KCAL", value: "\(Int(health.caloriesActive))", color: .orange)
            }

            // Acurácia GPS (informativo)
            HStack {
                Image(systemName: gpsIcon)
                    .foregroundStyle(gpsColor)
                Text(location.accuracyMeters > 0 ? "±\(Int(location.accuracyMeters))m" : "GPS…")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            // Controles
            HStack(spacing: 4) {
                if isPaused {
                    Button(action: resumeCardio) {
                        Image(systemName: "play.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                } else {
                    Button(action: pauseCardio) {
                        Image(systemName: "pause.fill")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.bordered)
                    .tint(.yellow)
                }
                Button(action: { Task { await stopCardio() } }) {
                    Image(systemName: "stop.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
        }
        .padding(.horizontal, 4)
    }

    // ─── Componentes ────────────────────────────────────────────────────

    private func statTile(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 0) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.bold().monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
    }

    private var statusBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: location.authorizationStatus == .authorizedWhenInUse || location.authorizationStatus == .authorizedAlways ? "location.fill" : "location.slash")
                .foregroundStyle(location.authorizationStatus == .authorizedWhenInUse ? .green : .orange)
            Text(location.authorizationStatus == .authorizedWhenInUse ? "GPS pronto" : "GPS pendente")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // ─── Ações ──────────────────────────────────────────────────────────

    private func startCardio() {
        if location.authorizationStatus == .notDetermined {
            location.requestAuthorization()
        }
        location.reset()
        location.onValidLocation = { locs in
            health.appendLocations(locs)
        }
        location.startTracking()
        health.start(activityType: sport.hkType, locationType: .outdoor)
        elapsedSeconds = 0
        isPaused = false
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                if !isPaused { elapsedSeconds += 1 }
            }
        }
        WKInterfaceDeviceShim.success()
    }

    private func pauseCardio() {
        isPaused = true
        location.stopTracking()
        health.pause()
    }

    private func resumeCardio() {
        isPaused = false
        location.startTracking()
        health.resume()
    }

    private func stopCardio() async {
        timer?.invalidate()
        timer = nil
        location.stopTracking()
        let summary = await health.stop(saveToHealth: true)
        if let summary = summary {
            session.sendCardioFinish(summary)
        }
        WKInterfaceDeviceShim.notification()
        location.reset()
        elapsedSeconds = 0
        isPaused = false
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    private func formatDistance(_ meters: Double) -> String {
        if meters < 1000 {
            return "\(Int(meters))"
        }
        return String(format: "%.2f", meters / 1000)
    }

    private func formatTime(_ seconds: Int) -> String {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        if h > 0 {
            return String(format: "%d:%02d:%02d", h, m, s)
        }
        return String(format: "%d:%02d", m, s)
    }

    private var formatPace: String {
        guard location.distanceMeters > 0, elapsedSeconds > 0 else { return "—" }
        let km = location.distanceMeters / 1000
        let minutes = Double(elapsedSeconds) / 60
        let pace = minutes / km
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
        if location.accuracyMeters <= 10 { return .green }
        if location.accuracyMeters <= 30 { return .yellow }
        return .red
    }
}

#Preview {
    CardioView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
        .environmentObject(LocationManager.shared)
}
