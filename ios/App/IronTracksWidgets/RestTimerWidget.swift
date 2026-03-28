import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            // ── Lock screen / banner ──────────────────────────────────────
            LockScreenBannerView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded — shown when user long-presses the Island
                DynamicIslandExpandedRegion(.leading) {
                    Label("Descanso", systemImage: "timer")
                        .font(.caption2.bold())
                        .foregroundColor(.green)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerText(context.state.secondsRemaining))
                        .font(.title2.monospacedDigit().bold())
                        .foregroundColor(context.state.isFinished ? .green : .white)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.exerciseName)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(
                        value: Double(context.state.targetSeconds - context.state.secondsRemaining),
                        total: Double(max(1, context.state.targetSeconds))
                    )
                    .tint(.green)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 4)
                }
            } compactLeading: {
                // Compact — left side pill
                Image(systemName: "timer")
                    .foregroundColor(.green)
                    .font(.caption.bold())
            } compactTrailing: {
                // Compact — right side pill (most visible spot)
                Text(timerText(context.state.secondsRemaining))
                    .font(.caption.monospacedDigit().bold())
                    .foregroundColor(context.state.isFinished ? .green : .white)
                    .frame(minWidth: 38)
            } minimal: {
                // Minimal — tiny dot on secondary island
                Image(systemName: context.state.isFinished ? "checkmark.circle.fill" : "timer")
                    .foregroundColor(.green)
            }
            .keylineTint(.green)
        }
    }
}

// ── Lock screen banner view ───────────────────────────────────────────────────

@available(iOS 16.1, *)
struct LockScreenBannerView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        HStack(spacing: 14) {
            // Icon
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: context.state.isFinished ? "checkmark.circle.fill" : "timer")
                    .font(.title3.bold())
                    .foregroundColor(.green)
            }

            // Labels
            VStack(alignment: .leading, spacing: 2) {
                Text(context.state.isFinished ? "Hora de Treinar!" : "Descanso")
                    .font(.caption.bold())
                    .foregroundColor(.secondary)
                Text(context.attributes.exerciseName)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                    .lineLimit(1)
            }

            Spacer()

            // Timer
            Text(timerText(context.state.secondsRemaining))
                .font(.system(.title, design: .rounded).monospacedDigit().bold())
                .foregroundColor(context.state.isFinished ? .green : .primary)
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05))
        .activitySystemActionForegroundColor(.white)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

private func timerText(_ seconds: Int) -> String {
    let s = max(0, seconds)
    let m = s / 60
    let r = s % 60
    return String(format: "%d:%02d", m, r)
}
