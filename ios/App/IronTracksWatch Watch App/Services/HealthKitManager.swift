//
//  HealthKitManager.swift
//  IronTracksWatch
//
//  Lê frequência cardíaca em tempo real e gerencia HKWorkoutSession.
//  Usado em Cardio e em Treino ativo (pra trackear FC durante séries pesadas).
//

import Foundation
import HealthKit
import CoreLocation

@MainActor
final class HealthKitManager: NSObject, ObservableObject {

    static let shared = HealthKitManager()

    private let store = HKHealthStore()

    // Workout session ativo (cardio ou força)
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private var heartQuery: HKAnchoredObjectQuery?

    // ─── Estado observável ──────────────────────────────────────────────────
    @Published private(set) var isAuthorized: Bool = false
    @Published private(set) var heartRate: Int = 0
    @Published private(set) var maxHeartRate: Int = 0
    @Published private(set) var avgHeartRate: Int = 0
    @Published private(set) var caloriesActive: Double = 0
    @Published private(set) var distanceMeters: Double = 0
    @Published private(set) var elapsedSeconds: TimeInterval = 0
    @Published private(set) var isRunning: Bool = false

    // Buffer pra calcular FC média
    private var heartRateBuffer: [Int] = []
    private var sessionStartDate: Date?

    private override init() {
        super.init()
    }

    // ─── Permissões ────────────────────────────────────────────────────────

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }

        let typesToShare: Set = [
            HKQuantityType.workoutType()
        ]

        var typesToRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
            HKObjectType.activitySummaryType()
        ]
        if let dist = HKObjectType.quantityType(forIdentifier: .distanceCycling) {
            typesToRead.insert(dist)
        }

        do {
            try await store.requestAuthorization(toShare: typesToShare, read: typesToRead)
            self.isAuthorized = true
        } catch {
            self.isAuthorized = false
        }
    }

    // ─── Workout session ────────────────────────────────────────────────────

    /// Inicia uma sessão de treino. activityType:
    ///   - .running, .walking, .cycling pra cardio
    ///   - .traditionalStrengthTraining pra musculação
    func start(activityType: HKWorkoutActivityType, locationType: HKWorkoutSessionLocationType = .outdoor) {
        guard !isRunning else { return }

        let config = HKWorkoutConfiguration()
        config.activityType = activityType
        config.locationType = locationType

        do {
            session = try HKWorkoutSession(healthStore: store, configuration: config)
            builder = session?.associatedWorkoutBuilder()
            builder?.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            session?.delegate = self
            builder?.delegate = self

            if locationType == .outdoor {
                routeBuilder = HKWorkoutRouteBuilder(healthStore: store, device: nil)
            }

            let now = Date()
            sessionStartDate = now
            session?.startActivity(with: now)
            builder?.beginCollection(withStart: now) { _, _ in }

            startHeartRateQuery()
            self.isRunning = true
            self.heartRateBuffer = []
            self.maxHeartRate = 0
            self.avgHeartRate = 0
            self.caloriesActive = 0
            self.distanceMeters = 0
            self.elapsedSeconds = 0
        } catch {
            self.isRunning = false
        }
    }

    /// Pausa a sessão atual.
    func pause() {
        session?.pause()
    }

    /// Retoma a sessão atual.
    func resume() {
        session?.resume()
    }

    /// Encerra a sessão e descarta o builder (sem salvar workout permanente —
    /// o iPhone faz isso ao receber o cardioFinish via WatchConnectivity).
    func stop(saveToHealth: Bool = true) async -> WatchCardioSummary? {
        guard let session = session, let builder = builder else { return nil }
        let endDate = Date()
        session.end()
        do {
            try await builder.endCollection(at: endDate)
            if saveToHealth {
                _ = try await builder.finishWorkout()
            }
        } catch { /* ignore */ }

        let summary = WatchCardioSummary(
            distanceMeters: self.distanceMeters,
            durationSeconds: Int(self.elapsedSeconds),
            avgHeartRate: self.avgHeartRate > 0 ? self.avgHeartRate : nil,
            maxHeartRate: self.maxHeartRate > 0 ? self.maxHeartRate : nil,
            caloriesEstimated: Int(self.caloriesActive),
            avgPaceMinKm: paceMinKm,
            startedAt: sessionStartDate ?? endDate,
            finishedAt: endDate
        )

        self.session = nil
        self.builder = nil
        self.routeBuilder = nil
        self.isRunning = false
        return summary
    }

    /// Adiciona uma localização ao route builder (chamado pelo LocationManager).
    func appendLocations(_ locations: [CLLocation]) {
        guard let routeBuilder = routeBuilder, !locations.isEmpty else { return }
        routeBuilder.insertRouteData(locations) { _, _ in }
    }

    // ─── Heart rate query (anchored — recebe novos samples conforme chegam) ──

    private func startHeartRateQuery() {
        let type = HKQuantityType.quantityType(forIdentifier: .heartRate)!
        let predicate = HKQuery.predicateForSamples(withStart: Date(), end: nil, options: .strictStartDate)

        let query = HKAnchoredObjectQuery(
            type: type,
            predicate: predicate,
            anchor: nil,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, _, _ in
            self?.processHeartSamples(samples)
        }
        query.updateHandler = { [weak self] _, samples, _, _, _ in
            self?.processHeartSamples(samples)
        }
        store.execute(query)
        self.heartQuery = query
    }

    nonisolated private func processHeartSamples(_ samples: [HKSample]?) {
        guard let samples = samples as? [HKQuantitySample] else { return }
        let unit = HKUnit.count().unitDivided(by: .minute())
        let bpms = samples.map { Int($0.quantity.doubleValue(for: unit)) }
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            for bpm in bpms {
                self.heartRateBuffer.append(bpm)
                if bpm > self.maxHeartRate { self.maxHeartRate = bpm }
            }
            if let last = bpms.last { self.heartRate = last }
            if !self.heartRateBuffer.isEmpty {
                self.avgHeartRate = self.heartRateBuffer.reduce(0, +) / self.heartRateBuffer.count
            }
        }
    }

    private var paceMinKm: Double? {
        guard distanceMeters > 0, elapsedSeconds > 0 else { return nil }
        let km = distanceMeters / 1000
        let minutes = elapsedSeconds / 60
        return minutes / km
    }
}

// MARK: - HKWorkoutSessionDelegate

extension HealthKitManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            self.isRunning = (toState == .running)
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.isRunning = false
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension HealthKitManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) { }

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let qty = type as? HKQuantityType else { continue }
            guard let stats = workoutBuilder.statistics(for: qty) else { continue }

            let value: Double?
            switch qty.identifier {
            case HKQuantityTypeIdentifier.heartRate.rawValue:
                value = stats.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                Task { @MainActor in
                    if let v = value, v > 0 { self.heartRate = Int(v) }
                }
            case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                value = stats.sumQuantity()?.doubleValue(for: .kilocalorie())
                Task { @MainActor in
                    if let v = value { self.caloriesActive = v }
                }
            case HKQuantityTypeIdentifier.distanceWalkingRunning.rawValue,
                 HKQuantityTypeIdentifier.distanceCycling.rawValue:
                value = stats.sumQuantity()?.doubleValue(for: HKUnit.meter())
                Task { @MainActor in
                    if let v = value { self.distanceMeters = v }
                }
            default:
                break
            }
        }
        // Atualiza elapsed
        if let start = workoutBuilder.startDate {
            Task { @MainActor in
                self.elapsedSeconds = Date().timeIntervalSince(start)
            }
        }
    }
}
