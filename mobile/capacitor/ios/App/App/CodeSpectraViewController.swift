import UIKit
import Capacitor
import WebKit

/// The Capacitor bridge view controller for the iOS app: registers the
/// in-app CodeSpectraNative plugin, tags the user agent, and opens
/// Universal Links / notification links inside the WebView.
class CodeSpectraViewController: CAPBridgeViewController {
    private var pendingURL: URL?
    private var appeared = false

    /// Build flag (Info.plist CSIAPEnabled ← build setting CS_IAP_ENABLED).
    /// Off by default: the web app then hides purchase buttons in the app.
    static var iapEnabled: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "CSIAPEnabled") as? String)?.uppercased() == "YES"
    }

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        let base = descriptor.appendedUserAgentString ?? "CodeSpectraIOS/1"
        descriptor.appendedUserAgentString = Self.iapEnabled ? "\(base) CSIAP/1" : base
        return descriptor
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CodeSpectraNativePlugin())
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        appeared = true
        if let url = pendingURL {
            pendingURL = nil
            webView?.load(URLRequest(url: url))
        }
    }

    /// Open a Universal Link (https URL on our host) in the WebView.
    func open(universalLink url: URL) {
        guard let target = DeepLinks.resolve(server: bridge?.config.serverURL, url: url, link: nil) else { return }
        if appeared, let webView = webView {
            webView.load(URLRequest(url: target))
        } else {
            pendingURL = target // cold start: after the first page load begins
        }
    }
}
