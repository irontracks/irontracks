import ActivityKit
import WidgetKit
import SwiftUI
import IronTracksLiveActivityShared

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            VStack(alignment: .leading, spacing: 6) {
                Text(context.state.title)
                    .font(.headline)
                Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.9))
            .activitySystemActionForegroundColor(.yellow)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("⏱")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.title)
                        .font(.caption)
                }
            } compactLeading: {
                Text("⏱")
            } compactTrailing: {
                Text(timerInterval: context.attributes.startTime...context.state.endTime, countsDown: true)
                    .font(.caption2)
                    .monospacedDigit()
            } minimal: {
                Text("⏱")
            }
        }
    }
}

@main
struct RestTimerLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}
