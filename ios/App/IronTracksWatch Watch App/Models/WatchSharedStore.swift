//
//  WatchSharedStore.swift
//  IronTracksWatch
//
//  Ponte de dados entre o app Watch e a extensão de Complications.
//  As duas rodam em PROCESSOS SEPARADOS — a única memória em comum é o App Group.
//  O app escreve um snapshot enxuto aqui; a complication lê na hora de montar a timeline.
//
//  Membro dos DOIS targets (Watch App + IronTracksWatchComplications).
//

import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

// MARK: - Snapshot

/// Recorte mínimo do dashboard que a watch face precisa.
/// Deliberadamente separado de `WatchDashboard`: a complication só quer o que cabe
/// num mostrador, e um payload pequeno mantém a decodificação barata.
struct WatchComplicationSnapshot: Codable, Equatable {
    let streakDays: Int
    let weekWorkouts: Int
    let weekGoal: Int
    /// Nome do próximo treino ("Peito + Tríceps") ou nil se não há treino carregado.
    let workoutName: String?
    /// Rótulo curto do dia ("Treino A").
    let dayLabel: String?
    let exerciseCount: Int
    let isWorkoutActive: Bool
    let updatedAt: Date

    init(
        streakDays: Int,
        weekWorkouts: Int,
        weekGoal: Int,
        workoutName: String?,
        dayLabel: String?,
        exerciseCount: Int,
        isWorkoutActive: Bool,
        updatedAt: Date = Date()
    ) {
        self.streakDays = streakDays
        self.weekWorkouts = weekWorkouts
        self.weekGoal = weekGoal
        self.workoutName = workoutName
        self.dayLabel = dayLabel
        self.exerciseCount = exerciseCount
        self.isWorkoutActive = isWorkoutActive
        self.updatedAt = updatedAt
    }

    /// Fração da meta semanal (0...1), à prova de meta zero/negativa.
    var weekProgress: Double {
        guard weekGoal > 0 else { return 0 }
        return min(1, max(0, Double(weekWorkouts) / Double(weekGoal)))
    }

    /// Estado exibido antes de qualquer sync (e nos previews da galeria de complications).
    static let placeholder = WatchComplicationSnapshot(
        streakDays: 0,
        weekWorkouts: 0,
        weekGoal: 5,
        workoutName: nil,
        dayLabel: nil,
        exerciseCount: 0,
        isWorkoutActive: false,
        updatedAt: .distantPast
    )

    /// Amostra usada na galeria de complications (o usuário escolhendo na watch face).
    /// Números plausíveis vendem melhor que zeros.
    static let sample = WatchComplicationSnapshot(
        streakDays: 12,
        weekWorkouts: 3,
        weekGoal: 5,
        workoutName: "Peito + Tríceps",
        dayLabel: "Treino A",
        exerciseCount: 6,
        isWorkoutActive: false
    )

    /// true quando nunca recebeu dados do iPhone — a complication mostra convite, não zeros.
    var isEmpty: Bool { updatedAt == .distantPast }
}

// MARK: - Store

enum WatchSharedStore {

    /// Mesmo App Group declarado nos entitlements dos dois targets.
    static let appGroupID = "group.com.irontracks.shared"

    private static let snapshotKey = "complication_snapshot_v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    /// Persiste o snapshot e pede à watch face pra se redesenhar.
    ///
    /// Só recarrega as timelines quando o conteúdo REALMENTE mudou: o watchOS dá um
    /// orçamento diário de reloads por complication, e queimá-lo com writes idênticos
    /// faz a face parar de atualizar no fim do dia — bug clássico e difícil de achar.
    static func save(_ snapshot: WatchComplicationSnapshot) {
        guard let defaults = defaults else { return }

        if let current = load(), current.isContentEqual(to: snapshot) {
            return
        }

        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(snapshot)
            defaults.set(data, forKey: snapshotKey)
            reloadComplications()
        } catch {
            // Falha de encode não pode derrubar a sync do app — a face só fica defasada.
        }
    }

    /// Lê o último snapshot. nil quando nunca houve escrita.
    static func load() -> WatchComplicationSnapshot? {
        guard let data = defaults?.data(forKey: snapshotKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(WatchComplicationSnapshot.self, from: data)
    }

    /// Igual a `load()` mas nunca nil — a complication sempre tem o que desenhar.
    static func loadOrPlaceholder() -> WatchComplicationSnapshot {
        load() ?? .placeholder
    }

    private static func reloadComplications() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

// MARK: - Comparação de conteúdo

private extension WatchComplicationSnapshot {
    /// Compara tudo MENOS `updatedAt` — o carimbo de tempo muda a cada sync mesmo
    /// quando nada visível mudou, e é justamente ele que causaria reload desnecessário.
    func isContentEqual(to other: WatchComplicationSnapshot) -> Bool {
        streakDays == other.streakDays
            && weekWorkouts == other.weekWorkouts
            && weekGoal == other.weekGoal
            && workoutName == other.workoutName
            && dayLabel == other.dayLabel
            && exerciseCount == other.exerciseCount
            && isWorkoutActive == other.isWorkoutActive
    }
}
