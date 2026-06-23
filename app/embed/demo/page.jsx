"use client";
// /features の実演用：本物の App を #demo ハッシュでデモモード起動して埋め込む専用ルート。
// frame 許可は middleware の /embed 判定で同一オリジン限定に絞っている。
import dynamic from "next/dynamic";
const App = dynamic(() => import("../../../campus-sns/App.jsx"), { ssr: false });
export default function EmbedDemoPage() {
  return <App />;
}
