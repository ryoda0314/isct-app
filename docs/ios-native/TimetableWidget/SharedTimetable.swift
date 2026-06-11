import Foundation
import SwiftUI

/// One class slot in the weekly timetable.
/// Mirrors the JSON written by campus-sns/plugins/timetableWidget.js.
struct TimetableSlot: Codable, Identifiable {
    let year: Int     // academic year, e.g. 2025
    let quarter: Int  // 1..4
    let day: Int      // 0 = Mon ... 4 = Fri
    let ps: Int       // period start (1..10)
    let pe: Int       // period end (1..10)
    let name: String
    let room: String
    let col: String   // hex color "#rrggbb"

    var id: String { "\(year)-\(quarter)-\(day)-\(ps)-\(name)" }

    /// Grid row index: periods 1-2 -> 0, 3-4 -> 1, 5-6 -> 2, 7-8 -> 3, 9-10 -> 4
    var row: Int { max(0, (ps - 1) / 2) }
    var rowSpan: Int { max(1, (pe - 1) / 2 - (ps - 1) / 2 + 1) }
}

/// The resolved data a single widget renders (already filtered to one year+quarter).
struct TimetableData {
    let quarter: Int
    let year: Int
    let slots: [TimetableSlot]

    static let empty = TimetableData(quarter: 0, year: 0, slots: [])
}

/// The full payload stored in the App Group (every year + quarter).
struct TimetableStore {
    let slots: [TimetableSlot]
    let defaultYear: Int
    let defaultQuarter: Int

    static let empty = TimetableStore(slots: [], defaultYear: 0, defaultQuarter: 0)

    /// Distinct years present, newest first (for the config picker).
    var availableYears: [Int] {
        Array(Set(slots.map { $0.year })).filter { $0 > 0 }.sorted(by: >)
    }

    /// Distinct quarters present for a given year, ascending.
    func quarters(for year: Int) -> [Int] {
        Array(Set(slots.filter { $0.year == year }.map { $0.quarter }))
            .filter { $0 > 0 }.sorted()
    }

    /// Filter to a single year + quarter for rendering.
    func data(year: Int, quarter: Int) -> TimetableData {
        TimetableData(
            quarter: quarter,
            year: year,
            slots: slots.filter { $0.year == year && $0.quarter == quarter }
        )
    }
}

enum SharedTimetableStore {
    /// Must match TimetablePlugin.appGroupId.
    static let appGroupId = "group.ac.isct.campus"
    static let storageKey = "timetable_v1"

    static func load() -> TimetableStore {
        guard
            let defaults = UserDefaults(suiteName: appGroupId),
            let data = defaults.data(forKey: storageKey),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return .empty }

        let defaultYear = obj["defaultYear"] as? Int ?? 0
        let defaultQuarter = obj["defaultQuarter"] as? Int ?? 0

        var slots: [TimetableSlot] = []
        if let slotsStr = obj["slots"] as? String,
           let slotsData = slotsStr.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([TimetableSlot].self, from: slotsData) {
            slots = decoded
        }
        return TimetableStore(slots: slots, defaultYear: defaultYear, defaultQuarter: defaultQuarter)
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
