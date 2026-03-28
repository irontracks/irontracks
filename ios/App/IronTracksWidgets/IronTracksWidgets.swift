import WidgetKit
import SwiftUI

@main
struct IronTracksWidgetsBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            RestTimerLiveActivity()
        }
    }
}
