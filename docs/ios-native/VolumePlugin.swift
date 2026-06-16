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
        // outputVolume の KVO は session が active なときに確実に発火する。
        // .mixWithOthers を付けて WebView 側の音声再生を止めずに共存させる。
        try? session.setCategory(.playback, options: [.mixWithOthers])
        try? session.setActive(true)

        observation = session.observe(\.outputVolume, options: [.new]) { [weak self] sess, _ in
            let v = sess.outputVolume
            // KVO は任意のスレッド（多くはバックグラウンド）で発火する。一方
            // notifyListeners → WKWebView の JS 評価はメインスレッド必須で、別スレッド
            // から呼ぶとイベントがサイレントに破棄される。必ずメインへディスパッチする。
            DispatchQueue.main.async {
                self?.notifyListeners("volumeChange", data: ["value": Double(v)])
            }
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // 1x1 では内部 UISlider が生成されないことがあるため実寸を与え、
            // 画面外 + ほぼ透明 + 操作不可で「見えないが生きている」状態にする。
            let v = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 200, height: 40))
            v.alpha = 0.001
            v.isUserInteractionEnabled = false
            self.bridge?.viewController?.view.addSubview(v)
            self.volumeView = v
        }
    }

    /// MPVolumeView 内に埋め込まれたシステム音量 UISlider を取り出す。
    private func systemSlider() -> UISlider? {
        return volumeView?.subviews.compactMap { $0 as? UISlider }.first
    }

    @objc func getVolume(_ call: CAPPluginCall) {
        call.resolve(["value": Double(session.outputVolume)])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let requested = Float(call.getDouble("value") ?? Double(session.outputVolume))
        let clamped = max(0, min(1, requested))
        DispatchQueue.main.async { [weak self] in
            guard let slider = self?.systemSlider() else {
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
