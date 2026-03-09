import UIKit
import Capacitor

/// Custom ViewController that registers local plugins with the Capacitor bridge.
/// Main.storyboard references this class via customClass="ViewController".
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(IronTracksNativePlugin())
    }
}
