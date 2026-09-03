//
//  HealthKitManager.swift
//  IronTracksWatch
//
//  Dono da HKWorkoutSession: cardio (outdoor, com rota) e musculação (indoor).
//  Lê FC ao vivo, calorias e distância do HealthKit.
//
//  ⚠️ Este arquivo foi reescrito em 02/09/2026 depois de uma auditoria que achou
//  oito defeitos críticos. Os quatro que mais custavam ao usuário:
//
//   1. PAUSAR PERDIA A CORRIDA. O delegate fazia `isRunning = (toState == .running)`,
//      e a tela trocava por `if health.isRunning`. Pausar num semáforo levava de
//      volta à tela inicial, sem botão de retomar — e apertar "INICIAR" criava uma
//      SEGUNDA sessão por cima da primeira, que ficava órfã. Hoje o estado da
//      sessão é publicado como estado (`sessionState`), e pausado continua ativo.
//
//   2. AS DUAS TELAS BRIGAVAM PELO MESMO SINGLETON. Cardio e Treino chamavam
//      `start()` no mesmo objeto; a aba Cardio via `isRunning` de uma sessão de
//      musculação e se desenhava como se a corrida tivesse começado — sem GPS,
//      sem cronômetro. E "Encerrar" no Treino matava a corrida em andamento e
//      descartava o resumo. Hoje existe `activeKind`: cada tela só se considera
//      ativa se a sessão for DELA.
//
//   3. A QUERY DE FC NUNCA ERA PARADA. Sobrevivia ao fim do treino e se somava à
//      próxima, inflando a média e duplicando amostras. Hoje `stop()` a encerra.
//
//   4. SESSÃO ÓRFÃ. App morto no meio da corrida deixava a sessão viva no sistema
//      e o app achando que nada existia. Hoje há `recoverActiveSession()`.
//

import Foundation
import HealthKit
import CoreLocation

@MainActor
final class HealthKitManager: NSObject, ObservableObject {

    static let shared = HealthKitManager()

    private let store = HKHealthStore()

    /// Quem é o dono da sessão em curso. Sem isto, a aba Cardio se desenhava como
    /// ativa por causa de uma sessão de musculação (e vice-versa).
    enum WorkoutKind: String {
        case cardio
        case strength
    }

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private var heartQuery: HKAnchoredObjectQuery?

    // ─── Estado observável ──────────────────────────────────────────────────

    /// Estado real da sessão do HealthKit. `.running` E `.paused` são sessão VIVA.
    @Published private(set) var sessionState: HKWorkoutSessionState = .notStarted
    /// De quem é a sessão viva — `nil` quando não há nenhuma.
    @Published private(set) var activeKind: WorkoutKind?
    @Published private(set) var heartRate: Int = 0
    @Published private(set) var maxHeartRate: Int = 0
    @Published private(set) var avgHeartRate: Int = 0
    @Published private(set) var caloriesActive: Double = 0
    @Published private(set) var distanceMeters: Double = 0
    @Published private(set) var elapsedSeconds: TimeInterval = 0
    /// Permissão REAL de escrita do treino — não "o diálogo apareceu".
    @Published private(set) var canWriteWorkouts: Bool = false
    /// Último erro que o usuário precisa saber (permissão negada, falha ao salvar).
    @Published private(set) var lastError: String?

    /// Há sessão viva (rodando OU pausada). É o que as telas devem consultar.
    var hasActiveSession: Bool { session != nil && sessionState != .ended && sessionState != .notStarted }
    /// Compatibilidade: "rodando de fato", sem contar pausa.
    var isRunning: Bool { sessionState == .running }
    var isPaused: Bool { sessionState == .paused }

    /// Tempo que DESCONTA as pausas — é o que o cronômetro da tela mostra e o que
    /// vai no resumo. O `builder.startDate` cru é wall clock e contava a pausa
    /// inteira: quem parasse 10 min tinha 10 min a mais no registro salvo.
    private var accumulatedActiveSeconds: TimeInterval = 0
    private var lastResumeDate: Date?

    private var heartRateBuffer: [Int] = []
    private var sessionStartDate: Date?

    private override init() {
        super.init()
    }

    // ─── Permissões ────────────────────────────────────────────────────────

    /// Tudo que o app grava. Faltava quase tudo: sem `heartRate`, `activeEnergyBurned`,
    /// `distance*` e `workoutRoute`, o treino era salvo no app Saúde sem os detalhes
    /// e a rota era recusada por falta de autorização — com o erro engolido.
    private var typesToShare: Set<HKSampleType> {
        var s: Set<HKSampleType> = [HKQuantityType.workoutType(), HKSeriesType.workoutRoute()]
        for id in [HKQuantityTypeIdentifier.heartRate,
                   .activeEnergyBurned,
                   .distanceWalkingRunning,
                   .distanceCycling] {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { s.insert(t) }
        }
        return s
    }

    private var typesToRead: Set<HKObjectType> {
        var s: Set<HKObjectType> = []
        for id in [HKQuantityTypeIdentifier.heartRate,
                   .activeEnergyBurned,
                   .distanceWalkingRunning,
                   .distanceCycling] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { s.insert(t) }
        }
        return s
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            canWriteWorkouts = false
            lastError = "Este relógio não tem HealthKit."
            return
        }
        do {
            try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
        } catch {
            canWriteWorkouts = false
            lastError = "Não consegui pedir acesso à Saúde."
            return
        }
        // `requestAuthorization` NÃO lança quando o usuário nega — só em falha
        // estrutural. Antes o app marcava `isAuthorized = true` aqui e seguia com
        // números zerados; quem negasse só descobria no fim, sem nada salvo.
        refreshAuthorizationState()
    }

    /// Estado real, consultado no store. `.sharingAuthorized` é o único que garante escrita.
    func refreshAuthorizationState() {
        guard HKHealthStore.isHealthDataAvailable() else { canWriteWorkouts = false; return }
        canWriteWorkouts = store.authorizationStatus(for: HKQuantityType.workoutType()) == .sharingAuthorized
        if !canWriteWorkouts {
            lastError = "Libere a Saúde para o IronTracks nos Ajustes do relógio."
        } else if lastError?.contains("Saúde") == true {
            lastError = nil
        }
    }

    // ─── Recuperação de sessão órfã ─────────────────────────────────────────

    /// App morto no meio do treino (jetsam, crash, reboot) deixava a sessão viva no
    /// sistema — `workout-processing` garante isso — e o app voltava achando que
    /// não havia nada. O usuário perdia a corrida inteira E ficava com uma sessão
    /// zumbi drenando bateria. Chamado no `.task` da raiz.
    func recoverActiveSession() async {
        guard session == nil, HKHealthStore.isHealthDataAvailable() else { return }
        let recuperada: HKWorkoutSession?
        do {
            recuperada = try await store.recoverActiveWorkoutSession()
        } catch {
            return
        }
        guard let s = recuperada else { return }
        session = s
        builder = s.associatedWorkoutBuilder()
        s.delegate = self
        builder?.delegate = self
        let ehCardio = s.workoutConfiguration.locationType == .outdoor
        activeKind = ehCardio ? .cardio : .strength
        if ehCardio, routeBuilder == nil {
            routeBuilder = HKWorkoutRouteBuilder(healthStore: store, device: nil)
        }
        sessionStartDate = builder?.startDate ?? Date()
        // O tempo já corrido antes da morte do app não é recuperável com precisão;
        // partir do início da sessão é a aproximação honesta.
        accumulatedActiveSeconds = 0
        lastResumeDate = Date()
        sessionState = s.state
        if s.state == .running { startHeartRateQuery() }
    }

    // ─── Ciclo de vida da sessão ────────────────────────────────────────────

    /// - Returns: `false` quando já existe sessão viva — o chamador NÃO deve
    ///   desenhar tela ativa nesse caso. Antes isso era um `guard` mudo, e a tela
    ///   seguia como se tivesse iniciado.
    @discardableResult
    func start(kind: WorkoutKind, activityType: HKWorkoutActivityType, locationType: HKWorkoutSessionLocationType = .outdoor) -> Bool {
        guard !hasActiveSession else { return false }

        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType

        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            session = s
            builder = s.associatedWorkoutBuilder()
            builder?.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            builder?.delegate = self

            routeBuilder = locationType == .outdoor
                ? HKWorkoutRouteBuilder(healthStore: store, device: nil)
                : nil

            let now = Date()
            sessionStartDate = now
            accumulatedActiveSeconds = 0
            lastResumeDate = now
            heartRateBuffer = []
            maxHeartRate = 0
            avgHeartRate = 0
            heartRate = 0
            caloriesActive = 0
            distanceMeters = 0
            elapsedSeconds = 0
            lastError = nil
            activeKind = kind

            s.startActivity(with: now)
            builder?.beginCollection(withStart: now) { _, _ in }
            startHeartRateQuery()
            sessionState = .running
            return true
        } catch {
            lastError = "Não consegui iniciar o treino na Saúde."
            resetState()
            return false
        }
    }

    func pause() {
        guard hasActiveSession else { return }
        session?.pause()
    }

    func resume() {
        guard hasActiveSession else { return }
        session?.resume()
    }

    /// Encerra e devolve o resumo. `nil` = não havia o que encerrar (o chamador
    /// NÃO deve comemorar: antes o app tocava o háptico de sucesso e limpava a
    /// tela mesmo quando o resumo tinha evaporado).
    ///
    /// - Parameters:
    ///   - activityType: vocabulário do servidor (running/walking/cycling).
    ///   - route: pontos já filtrados pelo LocationManager.
    func stop(saveToHealth: Bool = true, activityType: String = "running", route: [CLLocation] = []) async -> WatchCardioSummary? {
        guard let session = session, let builder = builder else { return nil }
        let endDate = Date()

        // Fecha a janela ativa antes de qualquer await — depois disso o tempo não
        // conta mais.
        if let desde = lastResumeDate, sessionState == .running {
            accumulatedActiveSeconds += endDate.timeIntervalSince(desde)
        }
        lastResumeDate = nil

        stopHeartRateQuery()
        session.end()
        // `end()` é assíncrono: encerrar a coleta antes de a sessão transicionar é
        // a causa clássica de `finishWorkout()` falhar e as últimas amostras se
        // perderem. Espera curta, com teto — travar aqui prenderia a tela.
        await esperarEstado(.ended, ate: 3.0)

        do {
            try await builder.endCollection(at: endDate)
            if saveToHealth {
                let treino = try await builder.finishWorkout()
                // A rota só entra no app Saúde por aqui. Antes o routeBuilder era
                // zerado sem `finishRoute`, então o HKWorkout ia sem mapa.
                if let treino, let routeBuilder {
                    _ = try? await routeBuilder.finishRoute(with: treino, metadata: nil)
                }
            }
        } catch {
            lastError = "O treino não pôde ser salvo na Saúde."
        }

        let duracao = Int(accumulatedActiveSeconds.rounded())
        let summary = WatchCardioSummary(
            distanceMeters: distanceMeters,
            durationSeconds: duracao,
            avgHeartRate: avgHeartRate > 0 ? avgHeartRate : nil,
            maxHeartRate: maxHeartRate > 0 ? maxHeartRate : nil,
            caloriesEstimated: Int(caloriesActive),
            avgPaceMinKm: paceMinKm(distancia: distanceMeters, segundos: accumulatedActiveSeconds),
            startedAt: sessionStartDate ?? endDate,
            finishedAt: endDate,
            activityType: activityType,
            route: Self.decimateRoute(route, limit: 10_000)
        )

        resetState()
        return summary
    }

    private func esperarEstado(_ alvo: HKWorkoutSessionState, ate segundos: TimeInterval) async {
        let limite = Date().addingTimeInterval(segundos)
        while sessionState != alvo && Date() < limite {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
    }

    private func resetState() {
        stopHeartRateQuery()
        session = nil
        builder = nil
        routeBuilder = nil
        activeKind = nil
        sessionState = .ended
        lastResumeDate = nil
    }

    /// Reduz o traçado ao teto do servidor mantendo a FORMA do percurso.
    ///
    /// Amostragem uniforme (não corte no fim), e o último ponto é sempre
    /// preservado — senão o mapa terminaria antes da chegada.
    static func decimateRoute(_ locations: [CLLocation], limit: Int) -> [WatchRoutePoint] {
        guard limit > 0 else { return [] }
        let mapear: (CLLocation) -> WatchRoutePoint = { loc in
            WatchRoutePoint(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                ts: loc.timestamp.timeIntervalSince1970 * 1000,
                alt: loc.verticalAccuracy >= 0 ? loc.altitude : nil
            )
        }
        if locations.count <= limit { return locations.map(mapear) }
        let passo = Double(locations.count - 1) / Double(limit - 1)
        var out: [WatchRoutePoint] = []
        out.reserveCapacity(limit)
        for i in 0..<limit {
            let idx = min(locations.count - 1, Int((Double(i) * passo).rounded()))
            out.append(mapear(locations[idx]))
        }
        return out
    }

    /// Adiciona localizações à rota do HealthKit (chamado pelo LocationManager).
    func appendLocations(_ locations: [CLLocation]) {
        guard let routeBuilder, !locations.isEmpty, sessionState == .running else { return }
        routeBuilder.insertRouteData(locations) { [weak self] ok, _ in
            guard !ok else { return }
            Task { @MainActor in self?.lastError = "Parte do percurso não foi salva na Saúde." }
        }
    }

    // ─── FC ao vivo ─────────────────────────────────────────────────────────

    private func startHeartRateQuery() {
        stopHeartRateQuery()
        guard let type = HKQuantityType.quantityType(forIdentifier: .heartRate) else { return }
        let predicate = HKQuery.predicateForSamples(withStart: Date(), end: nil, options: .strictStartDate)
        let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit) { [weak self] _, samples, _, _, _ in
            self?.processHeartSamples(samples)
        }
        query.updateHandler = { [weak self] _, samples, _, _, _ in
            self?.processHeartSamples(samples)
        }
        store.execute(query)
        heartQuery = query
    }

    /// Sem isto a query sobrevivia ao fim do treino: a FC seguia "ao vivo" fora de
    /// qualquer sessão, e a query da corrida seguinte se somava à anterior —
    /// média inflada e amostras duplicadas a partir do segundo treino.
    private func stopHeartRateQuery() {
        if let q = heartQuery { store.stop(q) }
        heartQuery = nil
    }

    nonisolated private func processHeartSamples(_ samples: [HKSample]?) {
        guard let samples = samples as? [HKQuantitySample] else { return }
        let unit = HKUnit.count().unitDivided(by: .minute())
        let bpms = samples.map { Int($0.quantity.doubleValue(for: unit)) }
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Amostra que chega com a sessão pausada não entra na média: quem
            // parasse 10 min tinha a média puxada para baixo pelo repouso.
            guard self.sessionState == .running else { return }
            for bpm in bpms where bpm > 0 {
                self.heartRateBuffer.append(bpm)
                if bpm > self.maxHeartRate { self.maxHeartRate = bpm }
            }
            if let last = bpms.last, last > 0 { self.heartRate = last }
            if !self.heartRateBuffer.isEmpty {
                self.avgHeartRate = self.heartRateBuffer.reduce(0, +) / self.heartRateBuffer.count
            }
        }
    }

    private func paceMinKm(distancia: Double, segundos: TimeInterval) -> Double? {
        guard distancia > 0, segundos > 0 else { return nil }
        return (segundos / 60) / (distancia / 1000)
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HealthKitManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            // Contabiliza a janela ativa que acabou de fechar/abrir. É isto que faz
            // a duração salva bater com o cronômetro que o usuário viu.
            if fromState == .running, let desde = self.lastResumeDate {
                self.accumulatedActiveSeconds += date.timeIntervalSince(desde)
                self.lastResumeDate = nil
            }
            if toState == .running {
                self.lastResumeDate = date
                self.startHeartRateQuery()
            }
            self.sessionState = toState
            if toState == .ended { self.activeKind = nil }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.lastError = "A sessão de treino falhou."
            self.resetState()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension HealthKitManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) { }

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let qty = type as? HKQuantityType, let stats = workoutBuilder.statistics(for: qty) else { continue }
            switch qty.identifier {
            case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                let v = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
                Task { @MainActor in if let v { self.caloriesActive = v } }
            case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue,
                 HKQuantityTypeIdentifier.distanceCycling.rawValue:
                let v = stats.sumQuantity()?.doubleValue(for: HKUnit.meter())
                Task { @MainActor in if let v { self.distanceMeters = v } }
            default:
                // FC tem UMA fonte só: a anchored query. Antes o builder também
                // escrevia em `heartRate`, e os dois disputavam a mesma @Published
                // — o número oscilava na tela.
                break
            }
        }
        Task { @MainActor in
            guard self.sessionState == .running, let desde = self.lastResumeDate else { return }
            self.elapsedSeconds = self.accumulatedActiveSeconds + Date().timeIntervalSince(desde)
        }
    }
}
