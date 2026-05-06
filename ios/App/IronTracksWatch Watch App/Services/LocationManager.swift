//
//  LocationManager.swift
//  IronTracksWatch
//
//  GPS nativo do Apple Watch (S2+ tem GPS próprio).
//  Streama posições durante cardio e mantém um track filtrado.
//

import Foundation
import CoreLocation
import Combine

@MainActor
final class LocationManager: NSObject, ObservableObject {

    static let shared = LocationManager()

    private let manager = CLLocationManager()

    @Published private(set) var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published private(set) var lastLocation: CLLocation?
    @Published private(set) var accuracyMeters: Double = 0
    @Published private(set) var isTracking: Bool = false
    @Published private(set) var distanceMeters: Double = 0
    @Published private(set) var trackPoints: [CLLocation] = []

    /// Threshold de precisão (em metros) — pontos com accuracy maior são descartados.
    var maxAccuracyMeters: Double = 30
    /// Movimento mínimo (m) entre pontos pra evitar drift parado.
    var minMovementMeters: Double = 5
    /// Velocidade máxima realista (km/h) — pontos acima são considerados spike.
    var maxRealisticSpeedKmh: Double = 45

    /// Callback chamado a cada ponto válido — usado pra alimentar HealthKit route builder.
    var onValidLocation: (([CLLocation]) -> Void)?

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        self.authorizationStatus = manager.authorizationStatus
    }

    // ─── Permissões ────────────────────────────────────────────────────────

    func requestAuthorization() {
        manager.requestWhenInUseAuthorization()
    }

    // ─── Tracking ──────────────────────────────────────────────────────────

    func startTracking() {
        if authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.allowsBackgroundLocationUpdates = false  // Watch app é foreground-only durante cardio
        manager.startUpdatingLocation()
        self.isTracking = true
        self.distanceMeters = 0
        self.trackPoints = []
    }

    func stopTracking() {
        manager.stopUpdatingLocation()
        self.isTracking = false
    }

    func reset() {
        self.distanceMeters = 0
        self.trackPoints = []
        self.accuracyMeters = 0
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationManager: CLLocationManagerDelegate {

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.authorizationStatus = status
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            self.processLocations(locations)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Falhas transientes são esperadas (sinal fraco) — só logamos visualmente
        // se ficar acima de threshold. Por ora silencioso.
    }
}

// MARK: - Filter pipeline

private extension LocationManager {

    func processLocations(_ locations: [CLLocation]) {
        guard !locations.isEmpty else { return }
        let validated = locations.filter { $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= maxAccuracyMeters }
        guard !validated.isEmpty else {
            // Atualiza accuracy display mesmo se rejeitado
            if let first = locations.first { self.accuracyMeters = first.horizontalAccuracy }
            return
        }

        var accepted: [CLLocation] = []
        for loc in validated {
            self.lastLocation = loc
            self.accuracyMeters = loc.horizontalAccuracy

            if let last = trackPoints.last {
                let dist = loc.distance(from: last)
                if dist < minMovementMeters {
                    continue  // standing still
                }
                let dt = loc.timestamp.timeIntervalSince(last.timestamp)
                if dt > 0 {
                    let kmh = (dist / 1000) / (dt / 3600)
                    if kmh > maxRealisticSpeedKmh {
                        continue  // GPS spike
                    }
                }
                self.distanceMeters += dist
            }
            self.trackPoints.append(loc)
            accepted.append(loc)
        }

        if !accepted.isEmpty, let cb = self.onValidLocation {
            cb(accepted)
        }
    }
}
