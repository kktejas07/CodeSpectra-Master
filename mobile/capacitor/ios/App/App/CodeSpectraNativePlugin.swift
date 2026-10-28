import UIKit
import Capacitor
import CryptoKit
import DeviceCheck

/// Native features the web app calls through frontend/lib/native-bridge.ts
/// (Capacitor.nativePromise("CodeSpectraNative", method, options)) — the iOS
/// twin of android/…/CodeSpectraNativePlugin.java, same method names and
/// event shapes.
///
/// Lockdown (proctored tests). iOS has no screen pinning an app can force;
/// the closest is Guided Access (single-app mode). startLockdown:
///   - asks for Guided Access (works silently only on supervised devices with
///     Autonomous Single App Mode; otherwise the candidate is shown how to
///     turn it on: triple-click the side button), and watches its state;
///   - hides the test while the screen is recorded / mirrored
///     (UIScreen.isCaptured) and in the app-switcher snapshot;
///   - reports "lockdownEvent"s:
///       app_background{duration_ms}  focus_lost{duration_ms}  screenshot
///       screen_recording  external_display{screens}
///       lock_task_exit (Guided Access turned off)  lock_task_declined
/// iOS can't block screenshots; they are reported, not prevented.
/// Nothing here judges the candidate: events are signals for a reviewer.
@objc(CodeSpectraNativePlugin)
public class CodeSpectraNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CodeSpectraNativePlugin"
    public let jsName = "CodeSpectraNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startLockdown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopLockdown", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lockdownStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestIntegrityToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetAppAttestKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmBiometricEnroll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricPromptStrings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSystemBarTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appInfo", returnType: CAPPluginReturnPromise),
    ]

    static let event = "lockdownEvent"
    private static let focusGrace: TimeInterval = 3
    private static let pollInterval: TimeInterval = 2
    private static let pinDeclinedAfter: TimeInterval = 10
    private static let maxShareBytes = 25 * 1024 * 1024
    private static let attestKeyDefaults = "cs_app_attest_key_id"
    private static let attestedDefaults = "cs_app_attest_attested"

    private var lockdown = false
    private var wasGuided = false
    private var declinedReported = false
    private var lockStartedAt = Date()
    private var resignedAt: Date?
    private var backgroundAt: Date?
    private var locale: String?
    private var observers: [NSObjectProtocol] = []
    private var poll: Timer?
    private var shield: UIView?

    // MARK: - Lockdown

    @objc func startLockdown(_ call: CAPPluginCall) {
        locale = validLocale(call.getString("locale"))
        let pin = call.getBool("pin") ?? true
        DispatchQueue.main.async {
            if !self.lockdown {
                self.lockdown = true
                self.wasGuided = UIAccessibility.isGuidedAccessEnabled
                self.declinedReported = false
                self.lockStartedAt = Date()
                self.resignedAt = nil
                self.backgroundAt = nil
                self.registerObservers()
                if UIScreen.main.isCaptured {
                    self.emit("screen_recording")
                    self.setShield(true)
                }
                if UIScreen.screens.count > 1 { self.emit("external_display", ["screens": UIScreen.screens.count]) }
                if pin && !UIAccessibility.isGuidedAccessEnabled { self.requestGuidedAccess() }
                self.startPoll(pinRequested: pin)
            }
            call.resolve(self.status())
        }
    }

    @objc func stopLockdown(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endLockdown()
            call.resolve(self.status())
        }
    }

    @objc func lockdownStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.status()) }
    }

    private func status() -> [String: Any] {
        return [
            "active": lockdown,
            "pinned": lockdown && UIAccessibility.isGuidedAccessEnabled,
            "secure": false, // iOS can't block screenshots
            "captured": UIScreen.main.isCaptured,
        ]
    }

    private func endLockdown() {
        guard lockdown else { return }
        lockdown = false
        poll?.invalidate()
        poll = nil
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        setShield(false)
        // Guided Access we started ourselves (supervised devices) ends with the test.
        if UIAccessibility.isGuidedAccessEnabled {
            UIAccessibility.requestGuidedAccessSession(enabled: false) { _ in }
        }
    }

    private func requestGuidedAccess() {
        UIAccessibility.requestGuidedAccessSession(enabled: true) { ok in
            DispatchQueue.main.async {
                guard self.lockdown, !ok else { return }
                // Not a supervised device: show the candidate how to turn it on.
                let alert = UIAlertController(title: nil, message: ShellStrings.get("lockdown_guided_access", self.locale), preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: ShellStrings.get("lockdown_ok", self.locale), style: .default))
                self.bridge?.viewController?.present(alert, animated: true)
            }
        }
    }

    private func startPoll(pinRequested: Bool) {
        poll = Timer.scheduledTimer(withTimeInterval: Self.pollInterval, repeats: true) { [weak self] _ in
            guard let self = self, self.lockdown else { return }
            if UIAccessibility.isGuidedAccessEnabled {
                self.wasGuided = true
            } else if pinRequested && !self.wasGuided && !self.declinedReported
                        && Date().timeIntervalSince(self.lockStartedAt) > Self.pinDeclinedAfter {
                self.declinedReported = true
                self.emit("lock_task_declined")
            }
        }
    }

    private func registerObservers() {
        let nc = NotificationCenter.default
        func on(_ name: Notification.Name, _ block: @escaping () -> Void) {
            observers.append(nc.addObserver(forName: name, object: nil, queue: .main) { _ in block() })
        }
        on(UIApplication.willResignActiveNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            self.resignedAt = Date()
            self.setShield(true) // app-switcher snapshot shows the shield, not the test
        }
        on(UIApplication.didEnterBackgroundNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            self.backgroundAt = Date()
        }
        on(UIApplication.didBecomeActiveNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            if let bg = self.backgroundAt {
                self.emit("app_background", ["duration_ms": ms(since: bg)])
            } else if let r = self.resignedAt, Date().timeIntervalSince(self.lockStartedAt) > Self.focusGrace {
                // Control Centre, notification shade, a system alert or a call took focus.
                self.emit("focus_lost", ["duration_ms": ms(since: r)])
            }
            self.backgroundAt = nil
            self.resignedAt = nil
            self.setShield(UIScreen.main.isCaptured)
        }
        on(UIApplication.userDidTakeScreenshotNotification) { [weak self] in
            if self?.lockdown == true { self?.emit("screenshot") }
        }
        on(UIScreen.capturedDidChangeNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            let captured = UIScreen.main.isCaptured
            if captured { self.emit("screen_recording") }
            self.setShield(captured)
        }
        on(UIScreen.didConnectNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            self.emit("external_display", ["screens": max(2, UIScreen.screens.count)])
        }
        on(UIAccessibility.guidedAccessStatusDidChangeNotification) { [weak self] in
            guard let self = self, self.lockdown else { return }
            if UIAccessibility.isGuidedAccessEnabled {
                self.wasGuided = true
            } else if self.wasGuided {
                self.wasGuided = false
                self.emit("lock_task_exit")
            }
        }
    }

    /// A cover over the WebView while the screen is recorded / mirrored and in the app switcher.
    private func setShield(_ on: Bool) {
        guard let host = bridge?.viewController?.view else { return }
        if on {
            if shield != nil { return }
            let v = UIView(frame: host.bounds)
            v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            v.backgroundColor = UIColor(red: 8 / 255, green: 13 / 255, blue: 23 / 255, alpha: 1)
            let label = UILabel()
            label.text = ShellStrings.get("capture_shield", locale)
            label.textColor = .white
            label.numberOfLines = 0
            label.textAlignment = .center
            label.font = UIFont.preferredFont(forTextStyle: .body)
            label.adjustsFontForContentSizeCategory = true
            label.translatesAutoresizingMaskIntoConstraints = false
            v.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerYAnchor.constraint(equalTo: v.centerYAnchor),
                label.leadingAnchor.constraint(equalTo: v.leadingAnchor, constant: 24),
                label.trailingAnchor.constraint(equalTo: v.trailingAnchor, constant: -24),
            ])
            host.addSubview(v)
            shield = v
        } else {
            shield?.removeFromSuperview()
            shield = nil
        }
    }

    private func emit(_ type: String, _ extra: [String: Any] = [:]) {
        var d = extra
        d["type"] = type
        d["at"] = Int64(Date().timeIntervalSince1970 * 1000)
        notifyListeners(Self.event, data: d)
    }

    // MARK: - Device integrity (App Attest, DeviceCheck fallback)

    @objc func requestIntegrityToken(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), nonce.range(of: "^[A-Za-z0-9_-]{16,500}={0,2}$", options: .regularExpression) != nil else {
            call.reject("Invalid nonce", "invalid_nonce")
            return
        }
        let clientDataHash = Data(SHA256.hash(data: Data(nonce.utf8)))
        if #available(iOS 14.0, *), DCAppAttestService.shared.isSupported {
            appAttest(call, clientDataHash: clientDataHash)
        } else {
            deviceCheck(call)
        }
    }

    @available(iOS 14.0, *)
    private func appAttest(_ call: CAPPluginCall, clientDataHash: Data) {
        let service = DCAppAttestService.shared
        let defaults = UserDefaults.standard
        if let keyId = defaults.string(forKey: Self.attestKeyDefaults), defaults.bool(forKey: Self.attestedDefaults) {
            service.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, error in
                if let assertion = assertion {
                    call.resolve(["kind": "assertion", "keyId": keyId, "token": assertion.base64EncodedString()])
                } else if let e = error as? DCError, e.code == .invalidKey {
                    self.clearAttestKey()
                    self.appAttest(call, clientDataHash: clientDataHash)
                } else {
                    call.reject("App Attest unavailable", "integrity_unavailable")
                }
            }
            return
        }
        service.generateKey { keyId, error in
            guard let keyId = keyId, error == nil else {
                self.deviceCheck(call)
                return
            }
            service.attestKey(keyId, clientDataHash: clientDataHash) { attestation, error in
                guard let attestation = attestation, error == nil else {
                    // Apple's servers unreachable or the key is unusable: try DeviceCheck.
                    self.deviceCheck(call)
                    return
                }
                defaults.set(keyId, forKey: Self.attestKeyDefaults)
                defaults.set(true, forKey: Self.attestedDefaults)
                call.resolve(["kind": "attestation", "keyId": keyId, "token": attestation.base64EncodedString()])
            }
        }
    }

    private func deviceCheck(_ call: CAPPluginCall) {
        guard DCDevice.current.isSupported else {
            call.reject("Device integrity unavailable", "integrity_unavailable")
            return
        }
        DCDevice.current.generateToken { token, error in
            if let token = token, error == nil {
                call.resolve(["kind": "devicecheck", "token": token.base64EncodedString()])
            } else {
                call.reject("Device integrity unavailable", "integrity_unavailable")
            }
        }
    }

    /// The server doesn't know our key (e.g. it was not configured at first attestation).
    @objc func resetAppAttestKey(_ call: CAPPluginCall) {
        clearAttestKey()
        call.resolve()
    }

    private func clearAttestKey() {
        UserDefaults.standard.removeObject(forKey: Self.attestKeyDefaults)
        UserDefaults.standard.removeObject(forKey: Self.attestedDefaults)
    }

    // MARK: - Files: save / share a generated file (certificates, PDFs)

    @objc func shareFile(_ call: CAPPluginCall) {
        guard var b64 = call.getString("base64"), b64.count <= (Self.maxShareBytes / 3) * 4 + 4 else {
            call.reject("File too large", "file_too_large")
            return
        }
        if b64.hasPrefix("data:"), let comma = b64.firstIndex(of: ",") { b64 = String(b64[b64.index(after: comma)...]) }
        guard let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else {
            call.reject("Could not share file", "share_failed")
            return
        }
        let name = Self.safeFileName(call.getString("filename"))
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("share", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let file = dir.appendingPathComponent(name)
            try data.write(to: file, options: [.atomic, .completeFileProtection])
            DispatchQueue.main.async {
                guard let vc = self.bridge?.viewController else {
                    call.reject("Could not share file", "share_failed")
                    return
                }
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                if let pop = sheet.popoverPresentationController { // iPad
                    pop.sourceView = vc.view
                    pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 0, height: 0)
                    pop.permittedArrowDirections = []
                }
                sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file) }
                vc.present(sheet, animated: true) { call.resolve() }
            }
        } catch {
            call.reject("Could not share file", "share_failed")
        }
    }

    static func safeFileName(_ raw: String?) -> String {
        let cleaned = (raw ?? "")
            .components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters))
            .joined(separator: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: ". ").union(.whitespaces))
        let name = String(cleaned.prefix(120))
        return name.isEmpty ? "codespectra-file" : name
    }

    // MARK: - Biometric enrolment consent + prompt strings in the web UI language

    @objc func confirmBiometricEnroll(_ call: CAPPluginCall) {
        locale = validLocale(call.getString("locale"))
        DispatchQueue.main.async {
            let alert = UIAlertController(
                title: ShellStrings.get("biometric_enroll_title", self.locale),
                message: ShellStrings.get("biometric_enroll_body", self.locale),
                preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: ShellStrings.get("biometric_enroll_no", self.locale), style: .cancel) { _ in
                call.resolve(["accepted": false])
            })
            alert.addAction(UIAlertAction(title: ShellStrings.get("biometric_enroll_yes", self.locale), style: .default) { _ in
                call.resolve(["accepted": true])
            })
            guard let vc = self.bridge?.viewController else {
                call.resolve(["accepted": false])
                return
            }
            vc.present(alert, animated: true)
        }
    }

    @objc func biometricPromptStrings(_ call: CAPPluginCall) {
        locale = validLocale(call.getString("locale"))
        call.resolve([
            "title": ShellStrings.get("biometric_prompt_title", locale),
            "reason": ShellStrings.get("biometric_prompt_reason", locale),
            "cancel": ShellStrings.get("biometric_prompt_cancel", locale),
        ])
    }

    private func validLocale(_ l: String?) -> String? {
        guard let l = l, ShellStrings.supported.contains(l) else { return nil }
        return l
    }

    // MARK: - Status bar follows the web app's theme

    @objc func setSystemBarTheme(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? true
        let color = call.getString("color")
        DispatchQueue.main.async {
            if let vc = self.bridge?.viewController as? CAPBridgeViewController {
                vc.setStatusBarStyle(dark ? .lightContent : .darkContent)
                if let hex = color, hex.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil,
                   let c = UIColor.capacitor.color(fromHex: hex) {
                    vc.view.backgroundColor = c
                    self.bridge?.webView?.backgroundColor = c
                    self.bridge?.webView?.scrollView.backgroundColor = c
                }
            }
            call.resolve()
        }
    }

    // MARK: - App info (for support / device trust)

    @objc func appInfo(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        call.resolve([
            "versionName": info["CFBundleShortVersionString"] as? String ?? "",
            "versionCode": Int(info["CFBundleVersion"] as? String ?? "") ?? 0,
            "packageName": Bundle.main.bundleIdentifier ?? "",
            "flavor": "prod",
            "platform": "ios",
            "osVersion": UIDevice.current.systemVersion,
            "iapEnabled": CodeSpectraViewController.iapEnabled,
        ])
    }
}

private func ms(since d: Date) -> Int64 {
    return Int64(max(0, Date().timeIntervalSince(d)) * 1000)
}
