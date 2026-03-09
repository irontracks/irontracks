import UIKit
import Capacitor

/// Custom ViewController that registers local plugins with the Capacitor bridge.
/// Main.storyboard references this class via customClass="ViewController", customModule="App".
class ViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        print("⚡ [IronTracks] ViewController.viewDidLoad()")
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        print("⚡ [IronTracks] capacitorDidLoad() — registering IronTracksNativePlugin")
        bridge.registerPluginInstance(IronTracksNativePlugin())
        print("⚡ [IronTracks] Plugin registered, bridge URL: \(bridge.config.serverURL?.absoluteString ?? "nil")")
    }
}
