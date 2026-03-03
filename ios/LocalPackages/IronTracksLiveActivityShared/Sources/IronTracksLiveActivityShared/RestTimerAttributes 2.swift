import Foundation
import ActivityKit

@available(iOS 16.1, *)
public struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var endTime: Date
        public var title: String
        public init(endTime: Date, title: String) {
            self.endTime = endTime
            self.title = title
        }
    }

    public var startTime: Date
    public var totalSeconds: Int

    public init(startTime: Date, totalSeconds: Int) {
        self.startTime = startTime
        self.totalSeconds = totalSeconds
    }
}
