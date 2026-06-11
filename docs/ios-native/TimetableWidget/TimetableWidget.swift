import WidgetKit
import SwiftUI

// MARK: - Timeline

struct TimetableEntry: TimelineEntry {
    let date: Date
    let data: TimetableData
}

struct TimetableProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimetableEntry {
        TimetableEntry(date: Date(), data: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (TimetableEntry) -> Void) {
        completion(TimetableEntry(date: Date(), data: SharedTimetableStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TimetableEntry>) -> Void) {
        let entry = TimetableEntry(date: Date(), data: SharedTimetableStore.load())
        // Data is push-refreshed from the app (reloadAllTimelines); a daily
        // fallback refresh keeps things sane if the app never reopens.
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Views

private let DAY_LABELS = ["月", "火", "水", "木", "金"]
private let DAYS = 5
private let ROWS = 5 // period blocks 1-2 .. 9-10

struct TimetableWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TimetableEntry

    /// rows[r][d] -> slot at that grid cell (last writer wins on conflict).
    private var grid: [[TimetableSlot?]] {
        var g = Array(repeating: Array<TimetableSlot?>(repeating: nil, count: DAYS), count: ROWS)
        for s in entry.data.slots where s.day >= 0 && s.day < DAYS && s.row < ROWS {
            g[s.row][s.day] = s
        }
        return g
    }

    var body: some View {
        switch family {
        case .systemSmall:
            todayColumn
        default:
            weekGrid(rows: family == .systemLarge ? ROWS : 4)
        }
    }

    private var headerText: String {
        entry.data.quarter > 0 ? "\(entry.data.quarter)Q 時間割" : "時間割"
    }

    // Large/medium: full weekly grid.
    private func weekGrid(rows: Int) -> some View {
        let g = grid
        return VStack(alignment: .leading, spacing: 4) {
            Text(headerText)
                .font(.caption2).bold()
                .foregroundColor(.secondary)

            // Day header row
            HStack(spacing: 2) {
                Text("").frame(width: 14)
                ForEach(0..<DAYS, id: \.self) { d in
                    Text(DAY_LABELS[d])
                        .font(.system(size: 9, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .foregroundColor(.secondary)
                }
            }

            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 2) {
                    Text("\(r * 2 + 1)")
                        .font(.system(size: 8))
                        .foregroundColor(.secondary)
                        .frame(width: 14)
                    ForEach(0..<DAYS, id: \.self) { d in
                        cell(g[r][d])
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(8)
    }

    private func cell(_ slot: TimetableSlot?) -> some View {
        Group {
            if let s = slot {
                VStack(spacing: 0) {
                    Text(s.name)
                        .font(.system(size: 8, weight: .medium))
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                        .multilineTextAlignment(.center)
                    if !s.room.isEmpty {
                        Text(s.room)
                            .font(.system(size: 6))
                            .opacity(0.85)
                            .lineLimit(1)
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 22)
                .padding(1)
                .background(Color(hex: s.col))
                .cornerRadius(4)
            } else {
                Color.secondary.opacity(0.08)
                    .frame(maxWidth: .infinity, minHeight: 22)
                    .cornerRadius(4)
            }
        }
    }

    // Small: just today's classes as a list.
    private var todayColumn: some View {
        // Calendar weekday: 1=Sun..7=Sat -> our 0=Mon..4=Fri
        let wd = Calendar.current.component(.weekday, from: entry.date)
        let today = (wd + 5) % 7 // Sun(1)->6, Mon(2)->0, ... Sat(7)->5
        let todaySlots = entry.data.slots
            .filter { $0.day == today }
            .sorted { $0.ps < $1.ps }

        return VStack(alignment: .leading, spacing: 3) {
            Text(today < DAYS ? "今日 (\(DAY_LABELS[today]))" : "今日")
                .font(.caption2).bold()
                .foregroundColor(.secondary)
            if todaySlots.isEmpty {
                Spacer()
                Text("授業なし")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer()
            } else {
                ForEach(todaySlots.prefix(5)) { s in
                    HStack(spacing: 4) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(hex: s.col))
                            .frame(width: 3, height: 18)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(s.name)
                                .font(.system(size: 10, weight: .medium))
                                .lineLimit(1)
                            Text("\(s.ps)-\(s.pe)限  \(s.room)")
                                .font(.system(size: 8))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(10)
    }
}

// MARK: - Widget

// NOTE: @main lives in TimetableWidgetBundle.swift (auto-generated by Xcode),
// which references TimetableWidget(). Do NOT add @main here or the build fails
// with "'main' attribute cannot be used in a module that contains top-level code".
struct TimetableWidget: Widget {
    let kind = "TimetableWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TimetableProvider()) { entry in
            if #available(iOS 17.0, *) {
                TimetableWidgetView(entry: entry)
                    .containerBackground(.background, for: .widget)
            } else {
                TimetableWidgetView(entry: entry)
                    .background(Color(.systemBackground))
            }
        }
        .configurationDisplayName("時間割")
        .description("今週の時間割をホーム画面に表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
