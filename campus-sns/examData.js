// 2025年度 第4Q 学士課程期末試験時間割データ
// Source: life-undergraduate-exam-timetable_2025_4Q.pdf
// 「期末試験」のみ抽出（「授業」は除外）

export const EXAM_YEAR = "2025";
export const EXAM_QUARTER = 4;
export const EXAM_LABEL = "2025年度 4Q 期末試験";

// 時限 → 時間帯マッピング
export const PERIOD_TIMES = {
  "1-2": { start: "08:50", end: "10:30" },
  "3-4": { start: "10:45", end: "12:25" },
  "5-6": { start: "13:30", end: "15:10" },
  "7-8": { start: "15:25", end: "17:05" },
  "9-10": { start: "17:15", end: "18:55" },
  // 複数コマ
  "1-4": { start: "08:50", end: "12:25" },
  "3-6": { start: "10:45", end: "15:10" },
  "3-8": { start: "10:45", end: "17:05" },
  "5-8": { start: "13:30", end: "17:05" },
};

// 全期末試験データ
// code: セクション部を除いたベースコード (マッチング用)
// codeRaw: PDF記載のフルコード
export const EXAMS = [
  // ─── 1月28日(水) ───
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.C204", codeRaw: "LAL.C204-09", name: "中国語初級４ C09", instructor: "XIE JING", room: "W8E-308(W834)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.F204", codeRaw: "LAL.F204-05", name: "フランス語初級４ F05", instructor: "梶田 裕", room: "M-B101(H102)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.G204", codeRaw: "LAL.G204-09", name: "ドイツ語初級４ D33", instructor: "岡本 雅克", room: "W8E-307(W833)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.I354", codeRaw: "LAL.I354", name: "イタリア語４", instructor: "太田 岳人", room: "M-112(H117)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.R204", codeRaw: "LAL.R204-02", name: "ロシア語初級４ R02", instructor: "小西 昌隆", room: "M-156(H1103)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.R204", codeRaw: "LAL.R204-04", name: "ロシア語初級４ R04", instructor: "松本 隆志", room: "M-358" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-07", name: "スペイン語初級４ S31", instructor: "杉守 慶太", room: "M-356(H132)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-08", name: "スペイン語初級４ S32", instructor: "佐藤 オルガ 恵子", room: "S3-215(S321)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-09", name: "スペイン語初級４ S33", instructor: "佐々木 充文", room: "W9-323(W932)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-10", name: "スペイン語初級４ S34", instructor: "若林 大我", room: "W9-322(W931)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-11", name: "スペイン語初級４ S35", instructor: "永田 夕紀子", room: "M-B104(H103)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-12", name: "スペイン語初級４ S36", instructor: "田坂 建太", room: "S3-207(S322)" },
  { date: "2026-01-28", day: "水", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-14", name: "スペイン語初級４ S38", instructor: "波塚 奈穂", room: "S2-201(S224)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "CAP.Y203", codeRaw: "CAP.Y203", name: "高分子合成２（連鎖重合）", instructor: "佐藤 浩太郎", room: "M-B07(H101)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "EEE.P361", codeRaw: "EEE.P361", name: "電気法規および施設管理", instructor: "竹内 希", room: "W9-325(W934)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAE.E134", codeRaw: "LAE.E134-02", name: "英語スピーキング演習第四 2", instructor: "赤羽 早苗", room: "S4-201(S421)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAE.E154", codeRaw: "LAE.E154-02", name: "TOEFL対策セミナー（リスニング＆スピーキング）第四 2", instructor: "安納 真理子", room: "W9-202(W922)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.F204", codeRaw: "LAL.F204-06", name: "フランス語初級４ F06", instructor: "三ツ堀 広一郎", room: "W8E-307(W833)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.F204", codeRaw: "LAL.F204-07", name: "フランス語初級４ F07", instructor: "梶田 裕", room: "M-B101(H102)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.G204", codeRaw: "LAL.G204-13", name: "ドイツ語初級４ D43", instructor: "岡本 雅克", room: "S3-215(S321)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.R204", codeRaw: "LAL.R204-06", name: "ロシア語初級４ R06", instructor: "小西 昌隆", room: "M-156(H1103)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-15", name: "スペイン語初級４ S41", instructor: "TRONU MONTANE CARLA", room: "M-356(H132)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-16", name: "スペイン語初級４ S42", instructor: "佐藤 オルガ 恵子", room: "S3-215(S321)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-17", name: "スペイン語初級４ S43", instructor: "佐々木 充文", room: "W9-323(W932)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-18", name: "スペイン語初級４ S44", instructor: "若林 大我", room: "W9-322(W931)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-19", name: "スペイン語初級４ S45", instructor: "永田 夕紀子", room: "S2-201(S224)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-20", name: "スペイン語初級４ S46", instructor: "田坂 建太", room: "S3-207(S322)" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "MAT.P323", codeRaw: "MAT.P323", name: "有機材料物性B", instructor: "淺井 茂雄", room: "S8-102" },
  { date: "2026-01-28", day: "水", period: "3-4", code: "MEC.M231", codeRaw: "MEC.M231", name: "宇宙工学基礎", instructor: "中条 俊大, 中西 洋喜, 坂本 啓 他", room: "I1-256(I121)" },
  { date: "2026-01-28", day: "水", period: "5-6", code: "LAL.G234", codeRaw: "LAL.G234", name: "ドイツ語会話（入門・基礎）４", instructor: "SATO ASTRID", room: "W8E-306(W832)" },
  { date: "2026-01-28", day: "水", period: "5-6", code: "LAL.L304", codeRaw: "LAL.L304", name: "古典ラテン語４", instructor: "金澤 修", room: "M-143B(H119B)" },
  { date: "2026-01-28", day: "水", period: "7-8", code: "LAL.A304", codeRaw: "LAL.A304", name: "古典ギリシア語４", instructor: "金澤 修", room: "M-143B(H119B)" },
  { date: "2026-01-28", day: "水", period: "7-8", code: "LAL.C364", codeRaw: "LAL.C364", name: "中国語会話（中級・応用）４", instructor: "XIE JING", room: "M-143A(H119A)" },
  { date: "2026-01-28", day: "水", period: "7-8", code: "LAL.G364", codeRaw: "LAL.G364", name: "ドイツ語会話（中級・応用）４", instructor: "SATO ASTRID", room: "W8E-306(W832)" },

  // ─── 2月2日(月) ───
  { date: "2026-02-02", day: "月", period: "1-2", code: "CAP.G306", codeRaw: "CAP.G306", name: "分離工学２（固相系）", instructor: "吉川 史郎", room: "S4-203(S423)" },
  { date: "2026-02-02", day: "月", period: "1-2", code: "LAE.E234", codeRaw: "LAE.E234", name: "英語スピーキング演習第八", instructor: "安納 真理子", room: "I1-255(I123)" },
  { date: "2026-02-02", day: "月", period: "1-2", code: "PHY.C343", codeRaw: "PHY.C343", name: "化学物理学", instructor: "向山 敬", room: "WL2-101" },
  { date: "2026-02-02", day: "月", period: "1-2", code: "TSE.A311", codeRaw: "TSE.A311", name: "原子核工学概論", instructor: "小原 徹, 赤塚 洋, 木倉 宏成 他", room: "WL1-201(W521),WL1-401(W541)" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "CVE.M203", codeRaw: "CVE.M203", name: "測量学", instructor: "内海 信幸, 新名 恭仁", room: "W5-106" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "EEE.M241", codeRaw: "EEE.M241", name: "離散時間システム", instructor: "阪口 啓", room: "WL1-301" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "ICT.C214", codeRaw: "ICT.C214", name: "通信方式", instructor: "府川 和彦", room: "S2-202(S223)" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "LAE.E214", codeRaw: "LAE.E214-04", name: "英語第八 4-LS", instructor: "安納 真理子", room: "I1-255(I123)" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "LAS.M105", codeRaw: "LAS.M105-05", name: "微分積分学第二 M(1～10)", instructor: "小野寺 有紹", room: "M-278(H121)" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "LAS.M105", codeRaw: "LAS.M105-06", name: "微分積分学第二 N(11～20)", instructor: "鈴木 正俊", room: "WL1-401(W541)" },
  { date: "2026-02-02", day: "月", period: "3-4", code: "MAT.P204", codeRaw: "MAT.P204", name: "物理化学(化学熱力学）", instructor: "難波江 裕太", room: "M-B07(H101)" },
  { date: "2026-02-02", day: "月", period: "3-8", code: "MTH.C204", codeRaw: "MTH.C204", name: "解析学概論第四", instructor: "三浦 英之, 田辺 正晴", room: "M-B104(H103)" },
  { date: "2026-02-02", day: "月", period: "5-6", code: "LAE.E214", codeRaw: "LAE.E214-21", name: "英語第八 21-RW", instructor: "中村 彰", room: "M-155(H1104)" },
  { date: "2026-02-02", day: "月", period: "5-6", code: "LAH.T103", codeRaw: "LAH.T103", name: "技術史Ａ", instructor: "河村 豊", room: "WL2-101(W611)" },
  { date: "2026-02-02", day: "月", period: "5-6", code: "LAH.T106", codeRaw: "LAH.T106", name: "科学哲学Ａ", instructor: "田子山 和歌子", room: "W9-326(W935)" },
  { date: "2026-02-02", day: "月", period: "5-6", code: "SCE.M203", codeRaw: "SCE.M203", name: "デジタル信号処理", instructor: "原 精一郎", room: "M-124" },
  { date: "2026-02-02", day: "月", period: "5-8", code: "ICT.M215", codeRaw: "ICT.M215", name: "離散構造とアルゴリズム", instructor: "髙橋 篤司", room: "SL-101(S011)" },
  { date: "2026-02-02", day: "月", period: "7-8", code: "ARC.S203", codeRaw: "ARC.S203", name: "建築構造力学第一", instructor: "堀田 久人, 田村 修次, 寺澤 友貴", room: "W8E-101" },
  { date: "2026-02-02", day: "月", period: "7-8", code: "LAS.D112", codeRaw: "LAS.D112-01", name: "図学・図形デザイン第二 A", instructor: "平賀 あまな, 木津 直人, 奥山 信一 他", room: "WL2-101(W611)" },
  { date: "2026-02-02", day: "月", period: "7-8", code: "SCE.S211", codeRaw: "SCE.S211", name: "ロボットの機構と力学", instructor: "山北 昌毅, 塚越 秀行", room: "S2-203(S222)" },
  { date: "2026-02-02", day: "月", period: "7-8", code: "TSE.A203", codeRaw: "TSE.A203-02", name: "電気・磁気工学基礎 E", instructor: "HEMTHAVY PASOMPHONE", room: "S3-207(S322)" },

  // ─── 2月3日(火) ───
  { date: "2026-02-03", day: "火", period: "1-2", code: "CAP.G205", codeRaw: "CAP.G205", name: "化学工学４（移動現象基礎）", instructor: "関口 秀俊, 吉川 史郎", room: "W9-324(W933)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "EEE.S341", codeRaw: "EEE.S341", name: "通信理論（電気電子）", instructor: "戸村 崇, TRAN GIA KHANH", room: "S2-204(S221)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "EEE.S361", codeRaw: "EEE.S361", name: "光エレクトロニクス", instructor: "植之原 裕行, 西山 伸彦", room: "S2-202(S223)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.F204", codeRaw: "LAL.F204-01", name: "フランス語初級４ F01", instructor: "三宅 京子", room: "M-112(H117)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.F204", codeRaw: "LAL.F204-02", name: "フランス語初級４ F02", instructor: "今関 奏子", room: "M-B101(H102)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.R204", codeRaw: "LAL.R204-01", name: "ロシア語初級４ R01", instructor: "桑田 匡之", room: "M-119(H118)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-02", name: "スペイン語初級４ S12", instructor: "佐々木 充文", room: "W9-322(W931)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-03", name: "スペイン語初級４ S13", instructor: "杉下 由紀子", room: "W9-327(W936)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAL.S204", codeRaw: "LAL.S204-04", name: "スペイン語初級４ S14", instructor: "佐藤 オルガ 恵子", room: "W8E-306(W832)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.C107", codeRaw: "LAS.C107-11", name: "化学熱力学基礎 A", instructor: "石内 俊一", room: "WL2-101(W611)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.C107", codeRaw: "LAS.C107-12", name: "化学熱力学基礎 B", instructor: "西野 智昭", room: "M-374(H131)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.C107", codeRaw: "LAS.C107-13", name: "化学熱力学基礎 C", instructor: "前田 和彦", room: "WL2-401(W641)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.C107", codeRaw: "LAS.C107-19", name: "化学熱力学基礎 English Class", instructor: "JUHASZ GERGELY MIKLOS", room: "M-110(H112)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-01", name: "電磁気学基礎２ A", instructor: "蒲 江", room: "M-B07(H101)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-02", name: "電磁気学基礎２ B", instructor: "堀内 俊作", room: "WL2-301(W631)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-03", name: "電磁気学基礎２ C", instructor: "佐藤 琢哉", room: "M-124" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-04", name: "電磁気学基礎２ D", instructor: "平山 博之", room: "WL2-201(W621)" },
  { date: "2026-02-03", day: "火", period: "1-2", code: "MAT.C201", codeRaw: "MAT.C201", name: "無機化学", instructor: "松下 伸広, 鎌田 慶吾", room: "S7-201" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "ARC.S204", codeRaw: "ARC.S204", name: "建築構造材料構法", instructor: "横山 裕, 福田 眞太郎", room: "WL2-101(W611)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "CAP.N306", codeRaw: "CAP.N306", name: "計算材料化学", instructor: "MANZHOS SERGEI, 安藤 康伸", room: "W9-327(W936)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "CHM.C202", codeRaw: "CHM.C202", name: "化学統計熱力学", instructor: "西野 智昭", room: "M-107(H113)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "CHM.D331", codeRaw: "CHM.D331", name: "合成有機化学", instructor: "大森 建, 安藤 吉勇", room: "M-B107(H104)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "IEE.A206", codeRaw: "IEE.A206", name: "オペレーションズ・リサーチ 基礎", instructor: "塩浦 昭義", room: "W9-324(W933)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAL.F204", codeRaw: "LAL.F204-03", name: "フランス語初級４ F03", instructor: "三ツ堀 広一郎", room: "M-112(H117)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-06", name: "スペイン語初級４ S22", instructor: "永田 夕紀子", room: "W8E-306(W832)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.C105", codeRaw: "LAS.C105-11", name: "量子化学基礎 I", instructor: "大島 康裕", room: "S2-204(S221)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.C105", codeRaw: "LAS.C105-12", name: "量子化学基礎 J", instructor: "川本 正", room: "WL2-401(W641)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.C105", codeRaw: "LAS.C105-13", name: "量子化学基礎 K", instructor: "谷口 耕治", room: "WL2-301(W631)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.C105", codeRaw: "LAS.C105-14", name: "量子化学基礎 L", instructor: "大塚 拓洋", room: "M-B07(H101)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.M105", codeRaw: "LAS.M105-07", name: "微分積分学第二 O(21～30)", instructor: "梶原 健", room: "M-374(H131)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.M105", codeRaw: "LAS.M105-09", name: "微分積分学第二 W", instructor: "PURKAIT SOMA", room: "M-119(H118)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-05", name: "電磁気学基礎２ E", instructor: "足立 聡", room: "WL2-201(W621)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-06", name: "電磁気学基礎２ F", instructor: "久世 正弘", room: "W8E-101" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-07", name: "電磁気学基礎２ G", instructor: "花井 亮", room: "M-124" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-08", name: "電磁気学基礎２ H", instructor: "宗片 比呂夫", room: "M-278(H121)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "MAT.C314", codeRaw: "MAT.C314", name: "環境の科学", instructor: "宮内 雅浩, 奥中 さゆり", room: "S7-202" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "MAT.M301", codeRaw: "MAT.M301", name: "金属材料解析", instructor: "曽根 正人, 稲邑 朋也, 三宮 工 他", room: "S8-101" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "MCS.T335", codeRaw: "MCS.T335", name: "数値解析", instructor: "田中 健一郎", room: "W5-107" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "MEC.M333", codeRaw: "MEC.M333", name: "宇宙開発工学", instructor: "中西 洋喜, 中条 俊大, 岩田 隆敬 他", room: "I3-107(I311)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "PHY.Q208", codeRaw: "PHY.Q208", name: "量子力学II（講義）", instructor: "慈道 大介", room: "S2-203(S222)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "SCE.I205", codeRaw: "SCE.I205", name: "データ科学基礎", instructor: "田中 正行", room: "SL-101(S011)" },
  { date: "2026-02-03", day: "火", period: "3-4", code: "XMC.A204", codeRaw: "XMC.A204", name: "基礎工業数学第二b", instructor: "浅井 智朗", room: "W9-326(W935)" },
  { date: "2026-02-03", day: "火", period: "3-8", code: "MTH.B204", codeRaw: "MTH.B204", name: "位相空間論第四", instructor: "五味 清紀, 中村 聡", room: "M-110(H112)" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "CAP.O204", codeRaw: "CAP.O204-01", name: "有機化学第４（C=O・C≡N） A", instructor: "石曽根 隆", room: "S4-201(S421)" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "EEE.C261", codeRaw: "EEE.C261", name: "制御工学", instructor: "清田 恭平, 岡田 健一", room: "S2-204(S221)" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "ICT.C315", codeRaw: "ICT.C315", name: "暗号技術とネットワークセキュリティ", instructor: "尾形 わかは, 宮田 純子, 北口 善明", room: "W5-107" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "LST.A217", codeRaw: "LST.A217", name: "有機化学第四(カルボニル化合物，アミン)", instructor: "松田 知子, 清尾 康志, 神谷 真子 他", room: "WL1-201(W521)" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "MTH.B341", codeRaw: "MTH.B341", name: "位相幾何学", instructor: "遠藤 久顕", room: "M-B45(H105)" },
  { date: "2026-02-03", day: "火", period: "5-6", code: "TSE.A305", codeRaw: "TSE.A305", name: "電磁気学（融合理工）", instructor: "片渕 竜也", room: "S3-207(S322)" },
  { date: "2026-02-03", day: "火", period: "5-8", code: "MEC.F211", codeRaw: "MEC.F211", name: "実在流体力学", instructor: "伊井 仁志, 鈴木 佐夜香", room: "WL1-401(W541)" },
  { date: "2026-02-03", day: "火", period: "7-8", code: "ICT.I216", codeRaw: "ICT.I216", name: "計算機論理設計（情報通信）", instructor: "一色 剛, 渡辺 義浩", room: "S4-201(S421)" },
  { date: "2026-02-03", day: "火", period: "7-8", code: "MAT.C206", codeRaw: "MAT.C206", name: "セラミックスプロセシング", instructor: "中島 章, 磯部 敏宏", room: "S7-201" },
  { date: "2026-02-03", day: "火", period: "7-8", code: "MAT.P202", codeRaw: "MAT.P202", name: "量子化学B", instructor: "金子 哲", room: "S8-102" },

  // ─── 2月4日(水) ───
  { date: "2026-02-04", day: "水", period: "1-2", code: "LAL.F204", codeRaw: "LAL.F204-04", name: "フランス語初級４ F04", instructor: "三宅 京子", room: "M-119(H118)" },
  { date: "2026-02-04", day: "水", period: "1-2", code: "MEC.D231", codeRaw: "MEC.D231", name: "解析力学基礎（機械）", instructor: "中野 寛", room: "S2-203(S222)" },
  { date: "2026-02-04", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-01", name: "スペイン語初級４ S11", instructor: "TRONU MONTANE CARLA", room: "M-103(H114)" },
  { date: "2026-02-04", day: "水", period: "3-4", code: "LAL.S204", codeRaw: "LAL.S204-05", name: "スペイン語初級４ S21", instructor: "TRONU MONTANE CARLA", room: "M-103(H114)" },
  { date: "2026-02-04", day: "水", period: "3-4", code: "LAS.C107", codeRaw: "LAS.C107-18", name: "化学熱力学基礎 H", instructor: "飯田 肇", room: "WL2-301(W631)" },
  { date: "2026-02-04", day: "水", period: "3-4", code: "MEC.G211", codeRaw: "MEC.G211", name: "機械材料工学", instructor: "青野 祐子, 山﨑 敬久", room: "M-178(H1101)" },
  { date: "2026-02-04", day: "水", period: "3-4", code: "MTH.C212", codeRaw: "MTH.C212", name: "応用解析序論第二", instructor: "小池 開", room: "M-110(H112)" },
  { date: "2026-02-04", day: "水", period: "5-6", code: "ARC.E304", codeRaw: "ARC.E304", name: "建築設備の制御", instructor: "田村 一, 佐藤 英樹", room: "W5-104" },
  { date: "2026-02-04", day: "水", period: "5-6", code: "LAS.C107", codeRaw: "LAS.C107-14", name: "化学熱力学基礎 D", instructor: "渡邊 玄", room: "M-374(H131)" },

  // ─── 2月5日(木) ───
  { date: "2026-02-05", day: "木", period: "1-2", code: "CHM.C334", codeRaw: "CHM.C334", name: "反応物理化学", instructor: "北島 昌史, 石内 俊一", room: "M-B107(H104)" },
  { date: "2026-02-05", day: "木", period: "1-2", code: "LAE.E114", codeRaw: "LAE.E114-27", name: "英語第四 27-LS", instructor: "宮本 朋子", room: "S2-204(S221)" },
  { date: "2026-02-05", day: "木", period: "1-2", code: "LAH.T306", codeRaw: "LAH.T306", name: "科学哲学Ｃ", instructor: "東 克明", room: "M-143A" },
  { date: "2026-02-05", day: "木", period: "3-4", code: "CHM.C204", codeRaw: "CHM.C204", name: "化学統計熱力学演習", instructor: "西野 智昭, 中村 雅明, 平田 圭祐", room: "M-107(H113)" },
  { date: "2026-02-05", day: "木", period: "3-4", code: "CSC.T263", codeRaw: "CSC.T263", name: "関数型プログラミング基礎", instructor: "渡部 卓雄, 森口 草介", room: "M-278(H121)" },
  { date: "2026-02-05", day: "木", period: "3-4", code: "LAE.E214", codeRaw: "LAE.E214-38", name: "英語第八 38-RW", instructor: "宮本 朋子", room: "S2-204(S221)" },
  { date: "2026-02-05", day: "木", period: "3-4", code: "LAS.M106", codeRaw: "LAS.M106-08", name: "線形代数学第二 S(61～70)", instructor: "内藤 聡", room: "M-178(H1101)" },
  { date: "2026-02-05", day: "木", period: "3-4", code: "LAS.M106", codeRaw: "LAS.M106-09", name: "線形代数学第二 T(71～80)", instructor: "服部 俊昭", room: "M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "CAP.O306", codeRaw: "CAP.O306", name: "実践プロセス有機化学", instructor: "田中 健", room: "S3-215(S321)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "CHM.B332", codeRaw: "CHM.B332", name: "光化学", instructor: "近藤 美欧, 前田 和彦", room: "M-B43(H106)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "EEE.C211", codeRaw: "EEE.C211", name: "アナログ電子回路", instructor: "菅原 聡, ファム ナムハイ", room: "S2-204(S221)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "MEC.M334", codeRaw: "MEC.M334", name: "航空工学概論", instructor: "齊藤 卓志, 原田 正志, 田頭 剛 他", room: "M-278(H121)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "TSE.A233", codeRaw: "TSE.A233-01", name: "工学計測基礎第二 E", instructor: "SADEGHZADEH NAZARI MEHRDAD 他", room: "S2-201(S224)" },
  { date: "2026-02-05", day: "木", period: "5-6", code: "TSE.A233", codeRaw: "TSE.A233-02", name: "工学計測基礎第二 J", instructor: "秋田 大輔, 笠井 康子, 髙橋 邦夫 他", room: "S2-202(S223)" },
  { date: "2026-02-05", day: "木", period: "5-8", code: "MEC.B222", codeRaw: "MEC.B222", name: "計算力学基礎", instructor: "大西 領, 兒玉 学", room: "M-178(H1101)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "CAP.Y307", codeRaw: "CAP.Y307", name: "高分子材料化学", instructor: "芹澤 武, 冨田 育義, 稲木 信介", room: "S4-202(S422)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "EEE.C341", codeRaw: "EEE.C341", name: "集積回路工学", instructor: "若林 整", room: "S2-204(S221)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "ICT.H318", codeRaw: "ICT.H318", name: "人工知能基礎（情報通信）", instructor: "奥村 学", room: "W9-323(W932)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-01", name: "生命科学基礎第二２ A", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-02", name: "生命科学基礎第二２ B", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-03", name: "生命科学基礎第二２ C", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-04", name: "生命科学基礎第二２ D", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-05", name: "生命科学基礎第二２ E", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-06", name: "生命科学基礎第二２ F", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-07", name: "生命科学基礎第二２ G", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "LAS.B104", codeRaw: "LAS.B104-08", name: "生命科学基礎第二２ H", instructor: "本郷 裕一, 二階堂 雅人, 藤島 皓介 他", room: "M-B07(H101),M-124,M-278(H121),M-374(H131)" },
  { date: "2026-02-05", day: "木", period: "7-8", code: "TSE.A203", codeRaw: "TSE.A203-03", name: "電気・磁気工学基礎 J", instructor: "林﨑 規託, 池田 翔太", room: "S2-201(S224)" },

  // ─── 2月6日(金) ───
  { date: "2026-02-06", day: "金", period: "1-2", code: "CAP.G204", codeRaw: "CAP.G204", name: "化学工学３（反応工学基礎） A・B", instructor: "山口 猛央, 原田 琢也", room: "S4-201(S421)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "CHM.D303", codeRaw: "CHM.D303", name: "有機化学演習第三", instructor: "後藤 敬, 大森 建, 山下 誠 他", room: "M-101(H116)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.C105", codeRaw: "LAS.C105-15", name: "量子化学基礎 M", instructor: "北島 昌史", room: "W9-324(W933)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.C105", codeRaw: "LAS.C105-16", name: "量子化学基礎 N", instructor: "火原 彰秀", room: "WL2-401(W641)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.C105", codeRaw: "LAS.C105-17", name: "量子化学基礎 O", instructor: "山﨑 優一", room: "WL2-301(W631)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.C105", codeRaw: "LAS.C105-18", name: "量子化学基礎 P", instructor: "長村 吉洋", room: "WL2-201(W621)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-09", name: "電磁気学基礎２ I", instructor: "栗田 伸之", room: "WL2-101(W611)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-10", name: "電磁気学基礎２ J", instructor: "椎野 克", room: "M-B07(H101)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-11", name: "電磁気学基礎２ K", instructor: "田中 秀数", room: "M-178(H1101)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-12", name: "電磁気学基礎２ L", instructor: "松尾 貞茂", room: "W8E-101" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LAS.P104", codeRaw: "LAS.P104-17", name: "電磁気学基礎２ 英語クラス", instructor: "Webb Adrean", room: "M-110(H112)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "LST.A248", codeRaw: "LST.A248", name: "遺伝学", instructor: "岩﨑 博史, 木村 宏, 二階堂 雅人 他", room: "M-278(H121)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "TSE.A201", codeRaw: "TSE.A201-01", name: "材料・物性工学基礎 E", instructor: "石川 敦之, CROSS JEFFREY SCOTT, CHENG SHUO", room: "S3-207(S322)" },
  { date: "2026-02-06", day: "金", period: "1-2", code: "TSE.A201", codeRaw: "TSE.A201-02", name: "材料・物性工学基礎 J", instructor: "髙橋 邦夫, 大友 順一郎", room: "S2-201(S224)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "ARC.E202", codeRaw: "ARC.E202", name: "建築環境設備学（建築設備）", instructor: "鍵 直樹, 湯淺 和博, 淺輪 貴史 他", room: "WL2-101(W611)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "CVE.N301", codeRaw: "CVE.N301", name: "土木史・土木技術者倫理", instructor: "真田 純子, 盛川 仁", room: "M-103(H114)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.B104", codeRaw: "LAS.B104-09", name: "生命科学基礎第二２ K", instructor: "DAVIS STEVEN RAY", room: "W8E-306(W832)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.C107", codeRaw: "LAS.C107-15", name: "化学熱力学基礎 E", instructor: "沖本 洋一", room: "WL2-301(W631)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.C107", codeRaw: "LAS.C107-16", name: "化学熱力学基礎 F", instructor: "河村 憲一", room: "WL2-201(W621)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.C107", codeRaw: "LAS.C107-17", name: "化学熱力学基礎 G", instructor: "伊原 学, 横井 俊之", room: "WL2-401(W641)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.M106", codeRaw: "LAS.M106-06", name: "線形代数学第二 Q(41～50)", instructor: "谷田川 友里", room: "M-278(H121)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-13", name: "電磁気学基礎２ M", instructor: "大熊 哲", room: "W8E-101" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-14", name: "電磁気学基礎２ N", instructor: "椎野 克", room: "M-B07(H101)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-15", name: "電磁気学基礎２ O", instructor: "足立 聡", room: "W9-324(W933)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "LAS.P104", codeRaw: "LAS.P104-16", name: "電磁気学基礎２ P", instructor: "横山 毅人", room: "M-124" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "MAT.P221", codeRaw: "MAT.P221", name: "有機材料構造A", instructor: "扇澤 敏明", room: "S8-102" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "MEC.L332", codeRaw: "MEC.L332", name: "機器の設計と脳科学", instructor: "葭田 貴子", room: "M-178(H1101)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "MTH.A204", codeRaw: "MTH.A204", name: "代数学概論第四", instructor: "下元 数馬, 皆川 龍博", room: "M-110(H112)" },
  { date: "2026-02-06", day: "金", period: "3-4", code: "PHY.C341", codeRaw: "PHY.C341", name: "物性物理学I", instructor: "佐藤 琢哉, 蒲 江", room: "M-374(H131)" },
  { date: "2026-02-06", day: "金", period: "5-6", code: "CSC.T271", codeRaw: "CSC.T271", name: "データ構造とアルゴリズム", instructor: "小池 英樹", room: "W9-324(W933)" },
  { date: "2026-02-06", day: "金", period: "5-6", code: "CSC.T374", codeRaw: "CSC.T374", name: "システム制御", instructor: "濵田 省吾", room: "M-124" },
  { date: "2026-02-06", day: "金", period: "5-6", code: "EEE.P341", codeRaw: "EEE.P341", name: "電力エネルギー変換工学", instructor: "赤塚 洋", room: "S2-203(S222)" },
  { date: "2026-02-06", day: "金", period: "5-6", code: "SCE.S205", codeRaw: "SCE.S205", name: "解析力学基礎（システム制御）", instructor: "中尾 裕也", room: "WL2-101(W611)" },
  { date: "2026-02-06", day: "金", period: "5-8", code: "MCS.T233", codeRaw: "MCS.T233", name: "計算機システム", instructor: "遠藤 敏夫, 小林 諒平", room: "M-278(H121)" },
  { date: "2026-02-06", day: "金", period: "7-8", code: "CSC.T254", codeRaw: "CSC.T254", name: "機械学習", instructor: "岡﨑 直観", room: "M-178(H1101)" },
  { date: "2026-02-06", day: "金", period: "7-8", code: "MAT.P214", codeRaw: "MAT.P214", name: "有機化学(反応)B", instructor: "早川 晃鏡", room: "S8-102" },
];

// ユーザーの履修科目から該当試験を検索
// courses は [{code: "LAL.S204", codeRaw: "LAL.S204-07"}, ...] のような配列
export function findMyExams(courses) {
  if (!courses || courses.length === 0) return [];
  // セクション付きコード → codeRaw で完全マッチ
  const rawSet = new Set();
  // セクションなしコード → ベースcode でマッチ（フォールバック）
  const baseOnlySet = new Set();
  for (const c of courses) {
    if (c.codeRaw && c.codeRaw !== c.code) {
      rawSet.add(c.codeRaw);
    } else if (c.code) {
      baseOnlySet.add(c.code);
    }
  }
  return EXAMS.filter(e => rawSet.has(e.codeRaw) || baseOnlySet.has(e.code));
}
