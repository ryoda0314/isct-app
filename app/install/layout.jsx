export const metadata = {
  title: "ScienceTokyo App をインストール",
  description: "東京科学大学キャンパスSNSアプリをホーム画面に追加しよう",
  openGraph: {
    title: "ScienceTokyo App をインストール",
    description: "東京科学大学キャンパスSNSアプリをホーム画面に追加しよう",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function InstallLayout({ children }) {
  return children;
}
