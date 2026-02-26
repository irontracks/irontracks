import UIKit
import Capacitor
import IronTracksNative

class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(IronTracksNative.self)
    }
}
