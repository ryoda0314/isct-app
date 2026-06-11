# 週の時間割ウィジェット セットアップ手順 (iOS)

ホーム画面に今週の時間割を表示する WidgetKit ウィジェットを追加する手順。

## 構成

```
[Webアプリ(JS)]  campus-sns/plugins/timetableWidget.js
      │ Capacitor Plugin "Timetable".save({quarter, year, slots})
      ▼
[App Group: group.ac.isct.campus]  共有 UserDefaults キー "timetable_v1"
      │ WidgetCenter.reloadAllTimelines()
      ▼
[Widget Extension(SwiftUI)]  共有 JSON を読んで 5×5 グリッド描画
```

## 関連ファイル

| ファイル | 役割 | 配置先 |
|---|---|---|
| `TimetablePlugin.swift` | JS→App Group 保存＋ウィジェット更新プラグイン | `ios/App/App/` |
| `TimetableWidget/SharedTimetable.swift` | 共有データモデル／読み込み | Widget Extension ターゲット |
| `TimetableWidget/TimetableWidget.swift` | ウィジェット UI（small/medium/large） | Widget Extension ターゲット |

## 手順

### 1. プラグインを配置・登録

```bash
cp docs/ios-native/TimetablePlugin.swift ios/App/App/TimetablePlugin.swift
```

Xcode で `App` グループ（`path = App`）にファイルを追加し、`ViewController.swift` に登録を追記：

```swift
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PortalPlugin())
        bridge?.registerPluginInstance(TimetablePlugin())  // ← 追加
    }
}
```

### 2. Widget Extension ターゲットを追加（Xcode GUI 必須）

1. Xcode メニュー **File ▸ New ▸ Target…**
2. **Widget Extension** を選択 → Next
3. Product Name: `TimetableWidget`、**"Include Configuration Intent" のチェックは外す**（StaticConfiguration を使うため）
4. Activate のダイアログは **Activate**

新規生成された `TimetableWidget.swift`（テンプレート）を削除し、本リポジトリの2ファイルを追加：

```bash
cp docs/ios-native/TimetableWidget/SharedTimetable.swift ios/App/TimetableWidget/SharedTimetable.swift
cp docs/ios-native/TimetableWidget/TimetableWidget.swift  ios/App/TimetableWidget/TimetableWidget.swift
```

Xcode の Project Navigator で `TimetableWidget` グループに2ファイルが含まれ、**Target Membership が `TimetableWidget` になっている**ことを確認。

### 3. App Group を有効化（両ターゲット）

**App** ターゲットと **TimetableWidget** ターゲットの両方で：

1. ターゲット選択 → **Signing & Capabilities**
2. **+ Capability** → **App Groups**
3. グループ `group.ac.isct.campus` を追加（無ければ + で新規作成）

> ⚠️ App ID `ac.isct.campus` に対し、App Group は `group.ac.isct.campus`。
> コード側の定数（`TimetablePlugin.appGroupId` と `SharedTimetableStore.appGroupId`）と完全一致させること。違うと保存はできてもウィジェットが空になる。

### 4. WidgetKit を App ターゲットにリンク

`TimetablePlugin.swift` は `import WidgetKit` を使う。App ターゲットの **Frameworks** に `WidgetKit.framework` が無い場合は追加（通常は自動リンクされる）。

### 5. ビルド & 配置確認

```bash
npm run build && npx cap sync ios
```

1. App をビルドして起動、ログイン → 時間割を一度開く（JS が `Timetable.save` を呼ぶ）
2. ホーム画面長押し → **+** → "ScienceTokyo" → 時間割ウィジェットを追加
3. small=今日の授業リスト / medium=月〜金の4限まで / large=5限までのフルグリッド

## データの流れ（デバッグ用）

- JS: `campus-sns/App.jsx` の `useEffect`（`qd, quarter, _selY` 依存）が `saveTimetableToWidget(qd, quarter, _selY)` を呼ぶ
- 送信ペイロード: `{ quarter, year, slots: JSON文字列 }`、slots 要素 = `{day(0-4), ps, pe, name, room, col}`
- ウィジェットが空のまま → ① App Group ID 不一致 ② アプリ側で一度も時間割データが読み込まれていない ③ プラグイン未登録、のいずれか
- 実機/シミュレータの再現: アプリ起動後、ウィジェットを一度削除→再追加でタイムライン強制リロード
