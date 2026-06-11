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

/// A course block positioned in the grid, possibly spanning multiple rows
/// (e.g. a periods 1-4 class spans the "1-2" and "3-4" blocks).
private struct PlacedSlot: Identifiable {
    let id: String
    let slot: TimetableSlot
    let day: Int
    let startRow: Int
    let span: Int
}

struct TimetableWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TimetableEntry

    /// Lay out every slot as a row-spanning block + the set of covered cells.
    private func placement(rows: Int) -> (placed: [PlacedSlot], covered: Set<Int>) {
        var placed: [PlacedSlot] = []
        var covered = Set<Int>()
        for s in entry.data.slots where s.day >= 0 && s.day < DAYS {
            let startRow = s.row
            if startRow >= rows { continue }
            let endRow = min(rows - 1, max(startRow, (s.pe - 1) / 2))
            placed.append(PlacedSlot(
                id: "\(s.day)-\(startRow)-\(s.name)",
                slot: s, day: s.day, startRow: startRow, span: endRow - startRow + 1
            ))
            for r in startRow...endRow { covered.insert(r * DAYS + s.day) }
        }
        return (placed, covered)
    }

    /// Index of today's weekday (0=Mon..4=Fri), or -1 on weekends.
    private var todayIndex: Int {
        let wd = Calendar.current.component(.weekday, from: entry.date)
        let i = (wd + 5) % 7 // Sun(1)->6 ... Sat(7)->5
        return i < DAYS ? i : -1
    }

    /// Last grid row a class reaches (uses period END so spanning classes aren't clipped).
    private var lastUsedRow: Int {
        entry.data.slots
            .filter { $0.day >= 0 && $0.day < DAYS }
            .map { min(ROWS - 1, ($0.pe - 1) / 2) }
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

    private let labelW: CGFloat = 16
    private let colGap: CGFloat = 4
    private let rowGap: CGFloat = 4

    // Large/medium: weekly grid. Absolute layout so classes can span rows
    // (e.g. a periods 1-4 class fills both the 1-2 and 3-4 blocks).
    private func weekGrid(rows: Int) -> some View {
        let today = todayIndex
        let (placed, covered) = placement(rows: rows)
        return VStack(alignment: .leading, spacing: 5) {
            Text(headerText)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.secondary)

            // Day header row — today's column is highlighted. Spacing/width match the grid below.
            HStack(spacing: colGap) {
                Color.clear.frame(width: labelW, height: 1)
                ForEach(0..<DAYS, id: \.self) { d in
                    Text(DAY_LABELS[d])
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(d == today ? .primary : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 1)
                        .background(d == today ? Color.primary.opacity(0.10) : Color.clear)
                        .clipShape(Capsule())
                }
            }

            GeometryReader { geo in
                let colW = (geo.size.width - labelW - colGap * CGFloat(DAYS)) / CGFloat(DAYS)
                let rowH = (geo.size.height - rowGap * CGFloat(max(0, rows - 1))) / CGFloat(rows)
                let xLeft = { (d: Int) in labelW + colGap * CGFloat(d + 1) + colW * CGFloat(d) }
                let yTop = { (r: Int) in (rowH + rowGap) * CGFloat(r) }

                ZStack(alignment: .topLeading) {
                    // Period block labels (left gutter).
                    ForEach(0..<rows, id: \.self) { r in
                        VStack(spacing: 0) {
                            Text("\(r * 2 + 1)")
                            Text("\(r * 2 + 2)")
                        }
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: labelW, height: rowH)
                        .offset(y: yTop(r))
                    }

                    // Empty cell backgrounds (only where no class covers the cell).
                    ForEach(0..<rows, id: \.self) { r in
                        ForEach(0..<DAYS, id: \.self) { d in
                            if !covered.contains(r * DAYS + d) {
                                RoundedRectangle(cornerRadius: 9, style: .continuous)
                                    .fill(Color.white.opacity(0.06))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                                            .strokeBorder(Color.white.opacity(0.08), lineWidth: 0.5)
                                    )
                                    .frame(width: colW, height: rowH)
                                    .offset(x: xLeft(d), y: yTop(r))
                            }
                        }
                    }

                    // Course blocks, spanning their period range.
                    ForEach(placed) { p in
                        courseBlock(p.slot, dimmed: today >= 0 && p.day != today)
                            .frame(
                                width: colW,
                                height: rowH * CGFloat(p.span) + rowGap * CGFloat(p.span - 1)
                            )
                            .offset(x: xLeft(p.day), y: yTop(p.startRow))
                    }
                }
            }
        }
        .padding(10)
    }

    private func courseBlock(_ s: TimetableSlot, dimmed: Bool) -> some View {
        let base = Color(hex: s.col)
        return VStack(spacing: 1) {
            Text(s.name)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .multilineTextAlignment(.center)
            if !s.room.isEmpty {
                Text(s.room)
                    .font(.system(size: 8, weight: .medium))
                    .opacity(0.92)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .foregroundColor(.white)
        .shadow(color: .black.opacity(0.25), radius: 0.5, y: 0.5) // keep white text legible on light wallpaper
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 3)
        .padding(.vertical, 2)
        .background(
            // Frosted glass: translucent color gradient over the widget's material background.
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [base.opacity(0.82), base.opacity(0.55)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.28), lineWidth: 0.7)
                )
        )
        .opacity(dimmed ? 0.45 : 1)
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
                .containerBackground(for: .widget) {
                    // Frosted backdrop: material lets the wallpaper tint through.
                    Rectangle().fill(.ultraThinMaterial)
                }
                // Tap anywhere -> open the app on the timetable view.
                .widgetURL(URL(string: "scitokyo://timetable"))
        }
        .configurationDisplayName("時間割")
        .description("年度とクォーターを選んで時間割を表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
