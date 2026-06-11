import Foundation
import SwiftUI

/// One class slot in the weekly timetable.
/// Mirrors the JSON written by campus-sns/plugins/timetableWidget.js.
struct TimetableSlot: Codable, Identifiable {
    let day: Int      // 0 = Mon ... 4 = Fri
    let ps: Int       // period start (1..10)
    let pe: Int       // period end (1..10)
    let name: String
    let room: String
    let col: String   // hex color "#rrggbb"

    var id: String { "\(day)-\(ps)-\(name)" }

    /// Grid row index: periods 1-2 -> 0, 3-4 -> 1, 5-6 -> 2, 7-8 -> 3, 9-10 -> 4
    var row: Int { max(0, (ps - 1) / 2) }
    var rowSpan: Int { max(1, (pe - 1) / 2 - (ps - 1) / 2 + 1) }
}

struct TimetableData {
    let quarter: Int
    let year: Int
    let slots: [TimetableSlot]

    static let empty = TimetableData(quarter: 0, year: 0, slots: [])
}

enum SharedTimetableStore {
    /// Must match TimetablePlugin.appGroupId.
    static let appGroupId = "group.ac.isct.campus"
    static let storageKey = "timetable_v1"

    static func load() -> TimetableData {
        guard
            let defaults = UserDefaults(suiteName: appGroupId),
            let data = defaults.data(forKey: storageKey),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return .empty }

        let quarter = obj["quarter"] as? Int ?? 0
        let year = obj["year"] as? Int ?? 0

        var slots: [TimetableSlot] = []
        if let slotsStr = obj["slots"] as? String,
           let slotsData = slotsStr.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([TimetableSlot].self, from: slotsData) {
            slots = decoded
        }
        return TimetableData(quarter: quarter, year: year, slots: slots)
    }
}

extension Color {
    /// "#6375f0" / "6375f0" -> Color. Falls back to gray on bad input.
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self = .gray
            return
        }
        self = Color(
            red: Double((v >> 16) & 0xff) / 255.0,
            green: Double((v >> 8) & 0xff) / 255.0,
            blue: Double(v & 0xff) / 255.0
        )
    }
}
