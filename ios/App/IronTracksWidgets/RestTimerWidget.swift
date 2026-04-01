import ActivityKit
import WidgetKit
import SwiftUI

// ── Timer display helper ──────────────────────────────────────────────────────
// Uses Text(timerInterval:) so the system drives the countdown automatically,
// without requiring per-second JS updates.
@available(iOS 16.1, *)
private struct TimerCountdownText: View {
    let endDate: Date
    let isFinished: Bool
    let font: Font
    let color: Color

    var body: some View {
        if isFinished {
            // Count UP from when the timer ended (shows overtime: +0:01, +0:02, …)
            Text(timerInterval: endDate...Date.distantFuture, countsDown: false)
                .font(font)
                .foregroundColor(.green)
                .monospacedDigit()
        } else {
            // Count DOWN to endDate — the system ticks this every second
            Text(timerInterval: Date()...endDate, countsDown: true)
                .font(font)
                .foregroundColor(color)
                .monospacedDigit()
        }
    }
}

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
                    TimerCountdownText(
                        endDate: context.state.endDate,
                        isFinished: context.state.isFinished,
                        font: .title2.bold(),
                        color: .white
                    )
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.exerciseName)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // Progress bar: system-driven via timerInterval — animates every second
                    // without JS updates, same mechanism as Text(timerInterval:)
                    let startDate = context.state.endDate.addingTimeInterval(
                        -Double(max(1, context.state.targetSeconds))
                    )
                    if context.state.isFinished {
                        ProgressView(value: 1.0, total: 1.0)
                            .tint(.green)
                            .padding(.horizontal, 8)
                            .padding(.bottom, 4)
                    } else {
                        ProgressView(timerInterval: startDate...context.state.endDate, countsDown: false)
                            .progressViewStyle(.linear)
                            .tint(.green)
                            .labelsHidden()
                            .padding(.horizontal, 8)
                            .padding(.bottom, 4)
                    }
                }
            } compactLeading: {
                // Compact — left side pill
                Image(systemName: "timer")
                    .foregroundColor(.green)
                    .font(.caption.bold())
            } compactTrailing: {
                // Compact — right side pill (most visible spot)
                TimerCountdownText(
                    endDate: context.state.endDate,
                    isFinished: context.state.isFinished,
                    font: .caption.bold(),
                    color: .white
                )
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

            // Timer: native countdown / count-up driven by endDate
            TimerCountdownText(
                endDate: context.state.endDate,
                isFinished: context.state.isFinished,
                font: .system(.title, design: .rounded).bold(),
                color: .primary
            )
        }
        .padding(16)
        .activityBackgroundTint(Color(red: 0.05, green: 0.05, blue: 0.05))
        .activitySystemActionForegroundColor(.white)
    }
}
