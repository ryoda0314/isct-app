import FeaturesClient from "./FeaturesClient.jsx";

export const metadata = {
  title: "機能紹介 | ScienceTokyo App",
  description:
    "ScienceTokyo App の主な機能。時間割・課題の自動取得、キャンパスSNS、DM、友達の居場所共有、キャンパスナビ、すれ違い通信、イベント、音楽プレイヤーなど、東京科学大学の学生生活を便利にする機能を紹介します。",
  openGraph: {
    title: "ScienceTokyo App — 大学生活の、すべてを。",
    description:
      "東京科学大学のためのキャンパスSNS。時間割・課題・SNS・居場所共有・キャンパスナビをひとつに。",
    type: "website",
  },
};

export default function FeaturesPage() {
  return <FeaturesClient />;
}
