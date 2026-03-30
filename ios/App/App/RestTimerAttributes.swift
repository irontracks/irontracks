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
}
