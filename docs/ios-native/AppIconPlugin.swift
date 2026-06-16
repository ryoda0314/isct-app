import Foundation
import Capacitor
import UIKit

/// Lets the web app switch the home-screen app icon between the primary icon
/// and the bundled alternate icons.
///
/// iOS exposes `UIApplication.setAlternateIconName(_:)` for this. The alternate
/// icons themselves live in the asset catalog as additional "iOS App Icon" sets
/// (`IconPurple.appiconset` … `IconPink.appiconset`) and are wired up through two
/// build settings on the App target:
///   • ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES
///   • ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "IconPurple IconGreen …"
/// With those set, no Info.plist / loose-file management is needed (Xcode 14+).
///
/// JS bridge:  campus-sns/plugins/appIcon.js  (registerPlugin("AppIcon"))
///
/// NOTE: Calling setAlternateIconName triggers the system alert
/// "You have changed the icon for ScienceTokyo". This is unavoidable on iOS —
/// there is no public API to suppress it.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["supported": UIApplication.shared.supportsAlternateIcons])
        }
    }

    /// Returns the active alternate icon name, or null when the primary icon is in use.
    @objc func getIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let name = UIApplication.shared.alternateIconName
            call.resolve(["name": name as Any])
        }
    }

    /// Switches the home-screen icon. Pass the alternate icon name to set it,
    /// or null / "default" to restore the primary icon.
    @objc func setIcon(_ call: CAPPluginCall) {
        let raw = call.getString("name")
        // null / "" / "default" all mean "back to the primary icon" (nil).
        let target: String? = (raw == nil || raw == "" || raw == "default") ? nil : raw

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Alternate icons are not supported on this device")
                return
            }
            if UIApplication.shared.alternateIconName == target {
                call.resolve(["name": target as Any])
                return
            }
            UIApplication.shared.setAlternateIconName(target) { error in
                if let error = error {
                    call.reject("Failed to set app icon: \(error.localizedDescription)")
                } else {
                    call.resolve(["name": target as Any])
                }
            }
        }
    }
}
