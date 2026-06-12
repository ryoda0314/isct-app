import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

/// Two-way link between the in-app music volume slider and the device's
/// system (hardware) volume.
///
/// iOS WKWebView ignores `HTMLAudioElement.volume`, so the web slider alone
/// does nothing on device. This plugin bridges the gap:
///   • READ  — KVO on `AVAudioSession.outputVolume` → emits `volumeChange`
///             whenever the user presses the volume buttons / Control Center.
///   • WRITE — drives the hidden `MPVolumeView` slider so the in-app slider
///             changes the actual system volume.
///
/// JS bridge:  campus-sns/plugins/systemVolume.js  (registerPlugin("Volume"))
///
/// NOTE: The write path (driving MPVolumeView's slider programmatically) is the
/// only available way to set system volume on iOS — there is no public API.
/// It works on a real device only; the Simulator has no hardware volume.
@objc(VolumePlugin)
public class VolumePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VolumePlugin"
    public let jsName = "Volume"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
    ]

    private let session = AVAudioSession.sharedInstance()
    private var observation: NSKeyValueObservation?
    private var volumeView: MPVolumeView?

    override public func load() {
        // Observe the system output volume. KVO fires for volume buttons,
        // Control Center, and our own MPVolumeView writes alike. We deliberately
        // do NOT change the audio session category/active state here so we never
        // disturb the WebView's own audio playback.
        observation = session.observe(\.outputVolume, options: [.new]) { [weak self] sess, _ in
            self?.notifyListeners("volumeChange", data: ["value": Double(sess.outputVolume)])
        }

        // A hidden, off-screen MPVolumeView whose embedded UISlider we drive to
        // change the system volume. Placed off-screen (not hidden/alpha 0) because
        // an actually-hidden slider is ignored by the system on modern iOS.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let v = MPVolumeView(frame: CGRect(x: -3000, y: -3000, width: 1, height: 1))
            self.bridge?.viewController?.view.addSubview(v)
            self.volumeView = v
        }
    }

    @objc func getVolume(_ call: CAPPluginCall) {
        call.resolve(["value": Double(session.outputVolume)])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let requested = Float(call.getDouble("value") ?? Double(session.outputVolume))
        let clamped = max(0, min(1, requested))
        DispatchQueue.main.async { [weak self] in
            guard let slider = self?.volumeView?.subviews
                .compactMap({ $0 as? UISlider }).first else {
                call.reject("MPVolumeView slider unavailable")
                return
            }
            slider.value = clamped
            // Setting `.value` alone doesn't always commit on device; firing the
            // control's action forces the system volume to update.
            slider.sendActions(for: .valueChanged)
            call.resolve(["value": Double(clamped)])
        }
    }

    deinit {
        observation?.invalidate()
    }
}
