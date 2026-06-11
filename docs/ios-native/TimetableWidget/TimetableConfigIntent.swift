import AppIntents
import WidgetKit

/// Quarter choices shown in the widget's edit screen.
enum QuarterChoice: Int, AppEnum {
    case q1 = 1, q2 = 2, q3 = 3, q4 = 4

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "クォーター")
    static var caseDisplayRepresentations: [QuarterChoice: DisplayRepresentation] = [
        .q1: "1Q",
        .q2: "2Q",
        .q3: "3Q",
        .q4: "4Q",
    ]
}

/// Supplies the year picker's options dynamically from whatever the app has saved.
struct YearOptionsProvider: DynamicOptionsProvider {
    func results() async throws -> [Int] {
        SharedTimetableStore.load().availableYears
    }

    func defaultResult() async -> Int? {
        let store = SharedTimetableStore.load()
        return store.defaultYear > 0 ? store.defaultYear : store.availableYears.first
    }
}

/// Widget configuration: long-press the widget → Edit Widget to pick year + quarter.
/// Leaving a field unset falls back to what the app last showed (defaultYear/Quarter).
struct SelectTimetableIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "時間割の表示設定"
    static var description = IntentDescription("ウィジェットに表示する年度とクォーターを選択します。")

    @Parameter(title: "年度", optionsProvider: YearOptionsProvider())
    var year: Int?

    @Parameter(title: "クォーター")
    var quarter: QuarterChoice?
}
