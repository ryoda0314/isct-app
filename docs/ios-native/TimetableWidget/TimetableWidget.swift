import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline

struct TimetableEntry: TimelineEntry {
    let date: Date
    let data: TimetableData
}

/// Resolves the widget's configuration (year + quarter) against the stored data.
/// Unset fields fall back to whatever the app last showed.
struct TimetableProvider: AppIntentTimelineProvider {
    typealias Entry = TimetableEntry
    typealias Intent = SelectTimetableIntent

    func placeholder(in context: Context) -> TimetableEntry {
        TimetableEntry(date: Date(), data: .empty)
    }

    func snapshot(for configuration: SelectTimetableIntent, in context: Context) async -> TimetableEntry {
        resolve(configuration)
    }

    func timeline(for configuration: SelectTimetableIntent, in context: Context) async -> Timeline<TimetableEntry> {
        let entry = resolve(configuration)
        // Data is push-refreshed from the app (reloadAllTimelines); a periodic
        // fallback refresh keeps things sane if the app never reopens.
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: entry.date) ?? entry.date
        return Timeline(entries: [entry], policy: .after(next))
    }

    private func resolve(_ configuration: SelectTimetableIntent) -> TimetableEntry {
        let store = SharedTimetableStore.load()
        let year = configuration.year ?? store.defaultYear
        let quarter = configuration.quarter?.rawValue ?? store.defaultQuarter
        return TimetableEntry(date: Date(), data: store.data(year: year, quarter: quarter))
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

    /// Index of today's weekday (0=Mon..4=Fri), or -1 on weekends.
    private var todayIndex: Int {
        let wd = Calendar.current.component(.weekday, from: entry.date)
        let i = (wd + 5) % 7 // Sun(1)->6 ... Sat(7)->5
        return i < DAYS ? i : -1
    }

    /// Last grid row that actually contains a class (so we can trim empty rows).
    private var lastUsedRow: Int {
        entry.data.slots
            .filter { $0.day >= 0 && $0.day < DAYS && $0.row < ROWS }
            .map { $0.row }
            .max() ?? -1
    }

    var body: some View {
        if family != .systemSmall && entry.data.slots.isEmpty {
            emptyState
        } else {
            switch family {
            case .systemSmall:
                todayColumn
            default:
                // Trim trailing empty rows; medium caps tighter than large.
                let cap = family == .systemLarge ? ROWS : 4
                weekGrid(rows: min(cap, max(1, lastUsedRow + 1)))
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(headerText)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.secondary)
            Spacer()
            Text("この期の時間割はありません")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
            Spacer()
        }
        .padding(10)
    }

    private var headerText: String {
        let q = entry.data.quarter > 0 ? "\(entry.data.quarter)Q" : "時間割"
        return entry.data.year > 0 ? "\(entry.data.year) \(q)" : q
    }

    // Large/medium: weekly grid (empty trailing rows trimmed).
    private func weekGrid(rows: Int) -> some View {
        let g = grid
        let today = todayIndex
        return VStack(alignment: .leading, spacing: 5) {
            Text(headerText)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.secondary)

            // Day header row — today's column is highlighted.
            HStack(spacing: 4) {
                Color.clear.frame(width: 16, height: 1)
                ForEach(0..<DAYS, id: \.self) { d in
                    Text(DAY_LABELS[d])
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(d == today ? .primary : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 1)
                        .background(
                            d == today
                                ? Color.primary.opacity(0.10)
                                : Color.clear
                        )
                        .clipShape(Capsule())
                }
            }

            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 4) {
                    // Period block label: the two period numbers stacked.
                    VStack(spacing: 0) {
                        Text("\(r * 2 + 1)")
                        Text("\(r * 2 + 2)")
                    }
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(width: 16)

                    ForEach(0..<DAYS, id: \.self) { d in
                        cell(g[r][d], dimmed: today >= 0 && d != today)
                    }
                }
                .frame(maxHeight: .infinity)
            }
        }
        .padding(10)
    }

    private func cell(_ slot: TimetableSlot?, dimmed: Bool) -> some View {
        Group {
            if let s = slot {
                VStack(spacing: 1) {
                    Text(s.name)
                        .font(.system(size: 10, weight: .semibold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.6)
                        .multilineTextAlignment(.center)
                    if !s.room.isEmpty {
                        Text(s.room)
                            .font(.system(size: 8, weight: .medium))
                            .opacity(0.9)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 3)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Color(hex: s.col))
                )
                .opacity(dimmed ? 0.45 : 1)
            } else {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Color.secondary.opacity(0.10))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        AppIntentConfiguration(
            kind: kind,
            intent: SelectTimetableIntent.self,
            provider: TimetableProvider()
        ) { entry in
            TimetableWidgetView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("時間割")
        .description("年度とクォーターを選んで時間割を表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
