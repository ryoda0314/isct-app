import Foundation
import Capacitor
import WidgetKit

/// Receives the current-quarter timetable from the web layer and stores it in
/// the shared App Group so the WidgetKit extension can render it.
///
/// JS bridge:  campus-sns/plugins/timetableWidget.js  (registerPlugin("Timetable"))
/// Widget:     TimetableWidget target (reads the same App Group key)
///
/// Setup: enable the App Group `group.ac.isct.campus` on BOTH this app target
/// and the widget extension target. See docs/ios-native/WIDGET_SETUP.md.
@objc(TimetablePlugin)
public class TimetablePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TimetablePlugin"
    public let jsName = "Timetable"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    ]

    /// Must match the App Group id configured in Xcode (both targets).
    static let appGroupId = "group.ac.isct.campus"
    /// UserDefaults key the widget reads from.
    static let storageKey = "timetable_v1"

    @objc func save(_ call: CAPPluginCall) {
        // `slots` is a JSON string: array of {year,quarter,day,ps,pe,name,room,col}.
        let slotsJson = call.getString("slots") ?? "[]"
        // Selection an unconfigured widget falls back to.
        let defaultYear = call.getInt("defaultYear") ?? 0
        let defaultQuarter = call.getInt("defaultQuarter") ?? 0

        guard let defaults = UserDefaults(suiteName: TimetablePlugin.appGroupId) else {
            call.reject("App Group \(TimetablePlugin.appGroupId) is not configured")
            return
        }

        let payload: [String: Any] = [
            "slots": slotsJson,
            "defaultYear": defaultYear,
            "defaultQuarter": defaultQuarter,
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload) else {
            call.reject("Failed to encode timetable payload")
            return
        }

        defaults.set(data, forKey: TimetablePlugin.storageKey)

        // Refresh all timelines so the widget repaints with the new data.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve(["ok": true])
    }
}
