# iOS ネイティブセットアップ手順

## Mac側での手順

```bash
cd isct
git pull
npm install
npx cap add ios
npx cap sync ios
```

## カスタムファイルの配置

```bash
cp docs/ios-native/PortalPlugin.swift ios/App/App/PortalPlugin.swift
cp docs/ios-native/capacitor.config.json ios/App/App/capacitor.config.json
```

## Xcode でビルド

```bash
npx cap open ios
```

Xcode が開いたら:
1. `PortalPlugin.swift` がプロジェクトに含まれていることを確認（なければ手動で追加: File > Add Files to "App"）
2. Signing & Capabilities で Team を設定
3. Build & Run
