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
    /// Última falha do CoreLocation, em texto — a tela decide se/como avisar
    /// (mesmo padrão de `HealthKitManager.lastError`, exibido junto na UI).
    /// (M-4) Antes o erro morria em silêncio no delegate; agora fica visível.
    @Published private(set) var lastError: String?

    /// Threshold de precisão (em metros) — pontos com accuracy maior são descartados.
    var maxAccuracyMeters: Double = 30
    /// Movimento mínimo (m) entre pontos pra evitar drift parado.
    /// Valor por esporte — ver `configure(for:)`. Este default cobre corrida.
    var minMovementMeters: Double = 5
    /// Velocidade máxima realista (km/h) — pontos acima são considerados spike de GPS.
    /// Valor por esporte — ver `configure(for:)`. Este default cobre corrida/caminhada;
    /// **bike precisa chamar `configure(for: .cycling)` antes de `startTracking()`**,
    /// senão descidas acima de 30 km/h são descartadas como spike (C-8).
    var maxRealisticSpeedKmh: Double = 30

    /// Callback chamado a cada ponto válido — usado pra alimentar HealthKit route builder.
    /// (S-8) É limpo em `reset()`, não em `stopTracking()` — ver o comentário lá.
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

    // ─── Configuração por esporte (C-8 / S-9) ─────────────────────────────

    /// Perfil de filtro do GPS por esporte. Deliberadamente NÃO é
    /// `HKWorkoutActivityType` — LocationManager não precisa saber de
    /// HealthKit, e este enum só carrega os três casos que este app oferece
    /// (`CardioView.Sport.locationProfile` faz a ponte).
    enum SportProfile {
        case running
        case walking
        case cycling
    }

    /// Ajusta o filtro de velocidade, o piso de movimento e o `CLActivityType`
    /// conforme o esporte — **chamar ANTES de `startTracking()`**.
    ///
    /// (C-8) `maxRealisticSpeedKmh` era fixo em 45 pra tudo: bicicleta passa
    /// disso em qualquer descida, então o ponto era descartado como "spike" e
    /// o trecho virava reta — numa descida de 2 km o ciclista perdia os 2 km.
    /// (S-9) `activityType` nunca era setado (ficava `.other`, sem heurística
    /// nenhuma do CoreLocation pra fitness).
    func configure(for profile: SportProfile) {
        switch profile {
        case .cycling:
            // Descida de bike de estrada chega a 60–80 km/h; 90 dá folga sem
            // deixar passar spike de GPS de verdade (que salta centenas de km/h).
            maxRealisticSpeedKmh = 90
            // Bike sempre supera o ruído de GPS parado (mesmo subindo devagar,
            // >2 m/s já é mais que suficiente); piso mais alto filtra o jitter
            // parado no semáforo sem cortar distância real do trajeto.
            minMovementMeters = 8
            manager.activityType = .otherNavigation
        case .walking:
            // Caminhada rápida não passa de ~7–8 km/h; 30 cobre trote leve sem
            // deixar passar spike.
            maxRealisticSpeedKmh = 30
            // Caminhada anda a ~1,1 m/s — com o piso de corrida (5 m) quase
            // todo ponto era descartado (1,1 m/amostra < 5 m) e a distância de
            // caminhada saía sistematicamente menor que a real. 2 m deixa a
            // maioria das amostras contarem sem abrir mão do filtro de drift.
            minMovementMeters = 2
            manager.activityType = .fitness
        case .running:
            // Corredor amador raramente ultrapassa 25–28 km/h; 30 cobre sprint
            // sem deixar passar spike. Corrida já supera o piso de 5 m de sobra
            // a 1 ponto/s (ritmo comum ≥ 2,5 m/s).
            maxRealisticSpeedKmh = 30
            minMovementMeters = 5
            manager.activityType = .fitness
        }
    }

    // ─── Tracking ──────────────────────────────────────────────────────────

    func startTracking() {
        if authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        // (C-1) 95% de uma corrida acontece com o braço abaixado — antes disso
        // ser `false`, o GPS parava de reportar assim que a tela apagava e a
        // distância congelava até o usuário olhar o relógio de novo, virando o
        // traçado numa linha reta entre os momentos de olhada. O
        // Info.plist já declara `WKBackgroundModes = [workout-processing]` e o
        // caller (CardioView) só chama `startTracking()` depois de abrir a
        // HKWorkoutSession (`health.start`) — no watchOS, atualização de
        // localização em segundo plano só é entregue DENTRO de uma sessão de
        // workout ativa, e nesse caso autorização "When In Use" já basta (não
        // precisa de "Always"). Ver relatório: não editar o Info.plist por
        // causa disso.
        manager.allowsBackgroundLocationUpdates = true
        manager.startUpdatingLocation()
        self.isTracking = true
        self.distanceMeters = 0
        self.trackPoints = []
        self.lastError = nil
    }

    func stopTracking() {
        manager.stopUpdatingLocation()
        self.isTracking = false
        // NÃO limpar `onValidLocation` aqui: `stopTracking()` também é usado
        // pra PAUSAR (CardioView.pauseCardio), e o resume não re-arma o
        // callback — limpar aqui deixaria a rota muda depois de retomar.
        // Quem garante que pontos tardios (chegando depois do stop/pausa, já
        // sem `isTracking`) não sujam a rota é o guard em `processLocations`.
    }

    func reset() {
        self.distanceMeters = 0
        self.trackPoints = []
        self.accuracyMeters = 0
        self.lastError = nil
        // (S-8) Aqui sim é o lugar certo de soltar o callback: `reset()` só é
        // chamado nas fronteiras reais do ciclo de vida — antes de iniciar uma
        // sessão nova e depois de finalizar/descartar a anterior —, nunca no
        // meio de uma pausa. Sem isso o closure da sessão anterior ficava
        // retido no singleton para sempre, e um ponto tardio (entregue já sem
        // treino em andamento) ainda alimentava o HealthKit route builder de
        // uma sessão que já tinha terminado.
        self.onValidLocation = nil
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
        // (M-4) Falhas transientes (sinal fraco) são esperadas e comuns — não
        // vale interromper o treino por causa delas. Mas o erro morria aqui
        // sem deixar rastro nenhum; agora publicamos pra tela decidir se e
        // como avisar (não é papel deste arquivo desenhar UI).
        let description = error.localizedDescription
        Task { @MainActor in
            self.lastError = description
        }
    }
}

// MARK: - Filter pipeline

private extension LocationManager {

    func processLocations(_ locations: [CLLocation]) {
        guard !locations.isEmpty else { return }
        // (S-8) `onValidLocation` só é liberado em `reset()` (ver comentário lá),
        // então entre um `stopTracking()` e o `reset()` seguinte o closure da
        // sessão que acabou continua vivo. Esse guard fecha a janela: ponto que
        // chega depois do stop (ou durante uma pausa) é descartado aqui, antes
        // de mexer em distância ou chamar o callback — sem isso um GPS
        // "atrasado" alimentava o HealthKit route builder de um treino que já
        // tinha terminado.
        guard isTracking else { return }
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
