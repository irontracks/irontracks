import ActivityKit
import WidgetKit
import SwiftUI
import IronTracksLiveActivityShared

@available(iOSApplicationExtension 16.1, *)
struct RestTimerLiveActivity: Widget {
    private let brandYellow = Color(red: 0.93, green: 0.79, blue: 0.15)
    private let brandGreen = Color(red: 0.20, green: 0.85, blue: 0.35)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            let finished = context.state.isFinished || Date() >= context.state.endTime
            if finished {
                finishedLockScreenView(context: context)
            } else {
                countingLockScreenView(context: context)
            }
        } dynamicIsland: { context in
            let finished = context.state.isFinished || Date() >= context.state.endTime
            DynamicIsland {
                // Expanded view
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        logotypeView()
                            .scaleEffect(0.78, anchor: .leading)
                        Spacer(minLength: 0)
                        pulsingDot(color: finished ? brandGreen : brandYellow)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if finished {
                        // Count UP from endTime
                        Text(timerInterval: context.state.endTime...Date.distantFuture, countsDown: false)
                            .font(.system(size: 20, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(brandGreen)
                    } else {
                        Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                            .font(.system(size: 20, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if finished {
                        HStack {
                            Text("BORAAAA!")
                                .font(.system(size: 14, weight: .black, design: .rounded))
                                .foregroundColor(brandGreen)
                            Spacer()
                            Text("Tempo extra")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    } else {
                        HStack {
                            Text("Tempo de Descanso")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white.opacity(0.7))
                            Spacer()
                            Text("Recupere e volte")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    }
                }
            } compactLeading: {
                pulsingDot(color: finished ? brandGreen : brandYellow)
            } compactTrailing: {
                if finished {
                    Text(timerInterval: context.state.endTime...Date.distantFuture, countsDown: false)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(brandGreen)
                } else {
                    Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.white)
                }
            } minimal: {
                pulsingDot(color: finished ? brandGreen : brandYellow)
            }
            .keylineTint(finished ? brandGreen : brandYellow)
        }
    }

    @available(iOSApplicationExtension 16.1, *)
    @ViewBuilder
    private func logotypeView() -> some View {
        HStack(spacing: 1) {
            Text("IRON")
                .font(.system(size: 14, weight: .black, design: .rounded))
                .italic()
                .foregroundColor(.white)
            Text("TRACKS")
                .font(.system(size: 14, weight: .black, design: .rounded))
                .italic()
                .foregroundColor(brandYellow)
        }
        .lineLimit(1)
    }

    @available(iOSApplicationExtension 16.1, *)
    @ViewBuilder
    private func pulsingDot(color: Color) -> some View {
        TimelineView(.periodic(from: .now, by: 0.8)) { timeline in
            let pulse = Int(timeline.date.timeIntervalSince1970 * 10) % 2 == 0
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
                .opacity(pulse ? 1 : 0.25)
        }
    }

    // MARK: - Lock Screen Views

    @available(iOSApplicationExtension 16.1, *)
    @ViewBuilder
    private func countingLockScreenView(context: ActivityViewContext<RestTimerAttributes>) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                logotypeView()
                    .padding(.bottom, 2)
                Text("TEMPO DE DESCANSO")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .tracking(1.5)

                Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                    .font(.system(size: 32, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)

                Text("Recupere e volte mais forte")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }

            Spacer()

            pulsingDot(color: brandYellow)
                .padding(.trailing, 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .activityBackgroundTint(Color.black.opacity(0.92))
    }

    @available(iOSApplicationExtension 16.1, *)
    @ViewBuilder
    private func finishedLockScreenView(context: ActivityViewContext<RestTimerAttributes>) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                logotypeView()
                    .padding(.bottom, 2)
                Text("BORAAAA!")
                    .font(.system(size: 18, weight: .black, design: .rounded))
                    .foregroundColor(.white)

                // Count UP — extra time since timer ended
                Text(timerInterval: context.state.endTime...Date.distantFuture, countsDown: false)
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white.opacity(0.9))

                Text("Tempo extra \u{2022} Volte ao treino!")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white.opacity(0.8))
            }

            Spacer()

            pulsingDot(color: brandGreen)
                .padding(.trailing, 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .activityBackgroundTint(brandGreen)
    }
}

@main
struct RestTimerLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}
