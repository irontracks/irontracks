import ActivityKit
import Foundation

/// Shared ActivityKit model used by both the main App target and the
/// IronTracksWidgets extension. Must match exactly in both targets.
@available(iOS 16.1, *)
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Exact moment the rest period ends — drives Text(timerInterval:) countdown
        var endDate: Date
        /// Original rest duration in seconds (used for progress bar)
        var targetSeconds: Int
        /// True once the countdown hits zero
        var isFinished: Bool
    }

    /// Unique timer identifier (mirrors the JS timer ID)
    var timerID: String
    /// Exercise name shown in the Live Activity (e.g. "Supino Reto")
    var exerciseName: String
    /// When the overall workout session started — drives the count-up "Treino" timer
    var workoutStartDate: Date
}

/// Live Activity for the workout SESSION itself (not just rest timer).
/// Shows current exercise, set progress and total volume on the Dynamic Island
/// and Lock Screen so users can glance at their workout state without unlocking.
/// Coexists with RestTimerAttributes — both can be active simultaneously
/// (workout LA in the background, rest timer LA briefly in foreground during rest).
@available(iOS 16.1, *)
struct WorkoutLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Exercise the user is currently performing (e.g. "Supino Reto")
        var currentExerciseName: String
        /// 1-based index of the current set (e.g. 3 means "3rd set")
        var currentSetIndex: Int
        /// Total sets planned for the current exercise (for "3/4" display)
        var totalSetsForExercise: Int
        /// Total sets COMPLETED across all exercises (for the headline counter)
        var totalSetsCompleted: Int
        /// Total volume in kg accumulated this session (sum of weight × reps)
        var totalVolumeKg: Double
        /// Quando um descanso está ATIVO, o instante em que ele acaba — dirige o
        /// countdown decrescente no compact/expanded da ilha do treino. nil = sem
        /// descanso (mostra o ícone). Optional pra decodificar estados antigos.
        var restEndDate: Date?
        /// PAUSA do cronômetro do treino: segundos decorridos congelados. nil =
        /// treino correndo.
        ///
        /// O tempo na ilha/tela bloqueada é desenhado por `Text(timerInterval:)`,
        /// que o SISTEMA conta sozinho a partir de uma data — ele não sabe o que é
        /// pausa. Enquanto o app mostrava "PAUSADO 56:07", a ilha seguia subindo
        /// (relatado pelo dono em 07/08/2026). Pausado, o widget passa a desenhar
        /// texto ESTÁTICO com este valor.
        var pausedElapsedSeconds: Int?
        /// Âncora da contagem quando o treino está CORRENDO: `agora − decorrido`.
        /// Substitui `attributes.workoutStartDate`, que é imutável (atributo
        /// estático) e por isso não consegue "andar para frente" depois de uma
        /// pausa — sem isso, retomar devolveria o tempo cheio de parede.
        /// nil = nunca pausou (usa o `workoutStartDate` de sempre).
        var elapsedAnchorDate: Date?
    }

    /// Static workout title (e.g. "Treino A — Peito + Tríceps")
    var workoutName: String
    /// When the user tapped "Iniciar Treino" — drives the count-up elapsed timer
    var workoutStartDate: Date
}
