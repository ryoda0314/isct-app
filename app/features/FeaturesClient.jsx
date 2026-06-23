"use client";
import { useEffect, useRef, useState } from "react";

/* ============================================================
   ScienceTokyo App — 機能紹介ランディング (Apple 製品ページ風)
   B: 軽量モックUI(デザイントークン流用) + A: 実演 iframe を1つ
   ============================================================ */

/* ─── Inline SVG icons (stroke = currentColor) ─── */
const Svg = (p) => (props) =>
  (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {p}
    </svg>
  );
const I = {
  cal: Svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  chart: Svg(<><line x1="4" y1="20" x2="4" y2="10" /><line x1="10" y1="20" x2="10" y2="4" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="20" y1="20" x2="20" y2="8" /></>),
  chat: Svg(<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />),
  mail: Svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>),
  pin: Svg(<><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>),
  nav: Svg(<polygon points="3 11 22 2 13 21 11 13 3 11" />),
  cards: Svg(<><rect x="2" y="6" width="14" height="11" rx="2" /><path d="M8 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /></>),
  event: Svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M9 16l2 2 4-4" /></>),
  music: Svg(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
  train: Svg(<><rect x="4" y="3" width="16" height="14" rx="3" /><line x1="4" y1="11" x2="20" y2="11" /><path d="M7 20l-2 2" /><path d="M17 20l2 2" /></>),
  star: Svg(<polygon points="12 2 15.1 8.6 22 9.5 17 14.4 18.2 21.5 12 18.1 5.8 21.5 7 14.4 2 9.5 8.9 8.6 12 2" />),
  lock: Svg(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  users: Svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  dumbbell: Svg(<><path d="M6.5 6.5l11 11" /><path d="M3 9l3-3 2 2-3 3z" /><path d="M21 15l-3 3-2-2 3-3z" /><path d="M2 12l2 2" /><path d="M20 10l2 2" /></>),
};

/* ─── Scroll reveal hook ─── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ─── Sticky nav scrolled state ─── */
function useScrolled() {
  const [s, setS] = useState(false);
  useEffect(() => {
    const onScroll = () => setS(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return s;
}

/* ─── Phone frame ─── */
function Phone({ children, w = 300, className = "" }) {
  return (
    <div className={`ft-phone ${className}`} style={{ width: w }}>
      <div className="ft-screen"><div className="ft-island" />{children}</div>
    </div>
  );
}

/* ─── Reusable mock pieces ─── */
const Tabs = ({ active = "home" }) => {
  const items = [["home", "ホーム", I.cal], ["tt", "時間割", I.cal], ["task", "課題", I.chart], ["map", "マップ", I.pin], ["dm", "DM", I.mail]];
  return (
    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-around", padding: "8px 4px 12px", borderTop: "1px solid #e3ecf4", background: "rgba(255,255,255,0.7)" }}>
      {items.map(([k, label, Ic]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: k === active ? "#28c868" : "#9fb3c4" }}>
          <Ic width={16} height={16} />
          <span style={{ fontSize: 8, fontWeight: k === active ? 700 : 500 }}>{label}</span>
        </div>
      ))}
    </div>
  );
};
const Avatar = ({ c, t }) => (
  <div style={{ width: 30, height: 30, borderRadius: "50%", background: c, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t}</div>
);

/* ─── HomeMock ─── */
function HomeMock() {
  return (
    <div className="ft-mock">
      <div style={{ padding: "0 14px 6px", fontSize: 14, fontWeight: 700, color: "#0e2030" }}>ScienceTokyo App</div>
      <div style={{ padding: "0 14px", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "linear-gradient(135deg,#eaf3ff,#fff)", border: "1px solid #e3ecf4", borderRadius: 14, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 13, fontWeight: 700, color: "#0e2030" }}>6/1</div><div style={{ fontSize: 9, color: "#7c93a6" }}>月曜日</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700, color: "#0e2030" }}>24°</div><div style={{ fontSize: 9, color: "#7c93a6" }}>晴れ</div></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["カレンダー", "イベント"].map((b, i) => (
            <div key={b} style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10, fontSize: 10, fontWeight: 600, background: i ? "#fff" : "rgba(40,200,104,0.1)", color: i ? "#5b7185" : "#16a34a", border: "1px solid " + (i ? "#e3ecf4" : "rgba(40,200,104,0.25)") }}>{b}</div>
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#0e2030", marginTop: 2 }}>学院学系チャット</div>
        {[["#7c5cff", "情報理工学院"], ["#28c868", "CSC 情報工学系"]].map(([c, n]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #e3ecf4", borderRadius: 12, padding: "9px 10px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: c }} />
            <div style={{ fontSize: 10, fontWeight: 600, color: "#0e2030" }}>{n}</div>
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#0e2030", marginTop: 2 }}>直近の締切</div>
        {[["実験レポート第2回", "1d 5h", "#f59e0b"], ["ソートアルゴリズムの比較", "2d 5h", "#28c868"]].map(([t, d, c]) => (
          <div key={t} style={{ background: "#fff", border: "1px solid #e3ecf4", borderLeft: `3px solid ${c}`, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "#0e2030" }}>{t}</div>
            <div style={{ fontSize: 9, color: "#9fb3c4", marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>
      <Tabs active="home" />
    </div>
  );
}

/* ─── TimetableMock ─── */
function TTMock() {
  const cells = {
    "1-月": ["線形代数", "#7c5cff"], "1-水": ["英語Ⅱ", "#28c868"], "1-金": ["ｺﾝﾋﾟｭｰﾀ", "#ec4899"],
    "2-火": ["確率と統計", "#0ea5e9"], "2-木": ["論理と形式", "#f59e0b"],
    "3-月": ["ﾃﾞｰﾀ構造", "#7c5cff"], "3-水": ["計算機実験", "#f59e0b"], "3-金": ["東工大立志", "#ef4444"],
  };
  const days = ["月", "火", "水", "木", "金"];
  return (
    <div className="ft-mock">
      <div style={{ padding: "0 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0e2030" }}>時間割</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", background: "rgba(40,200,104,0.12)", padding: "3px 8px", borderRadius: 8 }}>2Q</span>
      </div>
      <div style={{ padding: "0 10px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "16px repeat(5,1fr)", gap: 3 }}>
          <div />
          {days.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#5b7185" }}>{d}</div>)}
          {[1, 2, 3].map((p) => (
            <RowTT key={p} p={p} days={days} cells={cells} />
          ))}
        </div>
      </div>
      <Tabs active="tt" />
    </div>
  );
}
function RowTT({ p, days, cells }) {
  return (
    <>
      <div style={{ fontSize: 9, color: "#9fb3c4", display: "flex", alignItems: "center", justifyContent: "center" }}>{p}</div>
      {days.map((d) => {
        const cell = cells[`${p}-${d}`];
        return (
          <div key={d} style={{ height: 50, borderRadius: 8, background: cell ? cell[1] : "#f1f6fb", padding: cell ? "5px 5px" : 0, display: "flex" }}>
            {cell && <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{cell[0]}</span>}
          </div>
        );
      })}
    </>
  );
}

/* ─── DMMock ─── */
function DMMock() {
  const rows = [
    ["#7c5cff", "C", "CSC 勉強会", "山田: 今週の土曜、空いてる？", "1d"],
    ["#ec4899", "立", "立志プロジェクトA班", "佐藤: スライドの分担決めよう", "3d"],
    ["#ef4444", "H", "山田花子", "いいね！16時に南2号館の前で！", "1d"],
    ["#6366f1", "I", "鈴木一郎", "ありがとう！やってみる", "7h"],
    ["#22a06b", "M", "田中美咲", "パタヘネの教科書持ってるよ", "1d"],
  ];
  return (
    <div className="ft-mock">
      <div style={{ padding: "0 14px 8px", fontSize: 14, fontWeight: 700, color: "#0e2030" }}>DM</div>
      <div style={{ padding: "0 10px", display: "flex", gap: 6, marginBottom: 8 }}>
        {["新しいDM", "友達", "グループ"].map((b) => (
          <div key={b} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 9, fontWeight: 600, color: "#5b7185", border: "1px solid #e3ecf4", borderRadius: 9 }}>{b}</div>
        ))}
      </div>
      <div style={{ padding: "0 10px", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map(([c, t, n, m, d]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", border: "1px solid #eef3f8", borderRadius: 12, padding: "8px 10px" }}>
            <Avatar c={c} t={t} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#0e2030" }}>{n}</div>
              <div style={{ fontSize: 9, color: "#9fb3c4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m}</div>
            </div>
            <span style={{ fontSize: 8, color: "#b8c8d6" }}>{d}</span>
          </div>
        ))}
      </div>
      <Tabs active="dm" />
    </div>
  );
}

/* ─── MapMock (CSS のみ・軽量) ─── */
function MapMock() {
  const pins = [[24, 30, "#28c868"], [58, 22, "#ef4444"], [40, 48, "#0ea5e9"], [70, 60, "#f59e0b"], [30, 68, "#7c5cff"], [62, 78, "#28c868"]];
  return (
    <div className="ft-mock" style={{ background: "#dfe9e2" }}>
      <div style={{ padding: "0 14px 8px", fontSize: 13, fontWeight: 700, color: "#0e2030" }}>キャンパスナビ</div>
      <div style={{ margin: "0 12px 8px", background: "#fff", borderRadius: 20, padding: "8px 12px", fontSize: 9, color: "#9fb3c4", display: "flex", alignItems: "center", gap: 6, border: "1px solid #e3ecf4" }}>
        <I.nav width={11} height={11} /> スポットを検索…
      </div>
      <div style={{ position: "relative", flex: 1, margin: "0 10px 10px", borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg,#cfe3d4,#bcd4cf)" }}>
        {/* abstract blocks */}
        {[[10, 12, 26, 18], [44, 8, 22, 26], [12, 40, 30, 22], [50, 44, 30, 18], [20, 70, 24, 16], [56, 70, 26, 20]].map(([l, t, w, h], i) => (
          <div key={i} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, background: "rgba(255,255,255,0.45)", borderRadius: 5 }} />
        ))}
        {/* roads */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "36%", height: 5, background: "rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "42%", width: 5, background: "rgba(255,255,255,0.7)" }} />
        {/* pins */}
        {pins.map(([l, t, c], i) => (
          <div key={i} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: 12, height: 12, transform: "translate(-50%,-100%)" }}>
            <div style={{ width: 12, height: 12, borderRadius: "50% 50% 50% 0", background: c, transform: "rotate(-45deg)", boxShadow: "0 2px 4px rgba(0,0,0,0.25)" }} />
          </div>
        ))}
      </div>
      <Tabs active="map" />
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ eye, title, body, visual, reverse, children }) {
  return (
    <section className="ft-sec">
      <div className={`ft-row ${reverse ? "rev" : ""}`}>
        <div className="ft-col" data-reveal>
          <p className="ft-eye">{eye}</p>
          <h2 className="ft-h2">{title}</h2>
          <p className="ft-p">{body}</p>
          {children}
        </div>
        <div className="ft-col ft-visual" data-reveal>{visual}</div>
      </div>
    </section>
  );
}

/* ─── Live demo (lazy iframe) ─── */
function LiveDemo() {
  const ref = useRef(null);
  const [load, setLoad] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setLoad(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section className="ft-stage" ref={ref}>
      <div className="ft-stage-glow" />
      <div className="ft-stage-grid" />
      <div data-reveal style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
        <p className="ft-eye ft-eye-on-dark" style={{ justifyContent: "center" }}>LIVE DEMO</p>
        <h2 className="ft-h2" style={{ color: "#fff" }}>触って、確かめる。</h2>
        <p className="ft-p" style={{ maxWidth: 580, margin: "0 auto", color: "#9fb2c4" }}>
          下のデモは<strong style={{ color: "#fff" }}>本物のアプリそのもの</strong>です。
          デモ用データで、実際に画面を切り替えて動かせます。
        </p>
      </div>
      <div data-reveal className="ft-stage-phone">
        <div className="ft-halo" />
        <div className="ft-phone ft-phone-lg">
          <div className="ft-screen">
            <div className="ft-island" />
            {load ? (
              <iframe title="ScienceTokyo App デモ" src="/embed/demo#demo" className="ft-iframe" loading="lazy" />
            ) : (
              <div className="ft-shimmer" />
            )}
          </div>
        </div>
        <div className="ft-touch-hint"><span className="ft-touch-dot" />実際に操作できます</div>
      </div>
    </section>
  );
}

/* ─── 残りの機能グリッド ─── */
const GRID = [
  [I.users, "友達の居場所共有", "キャンパス内で友達がどこにいるかをリアルタイムで共有。空きコマの合流に。（完全オプトイン）"],
  [I.cards, "すれ違い通信", "同じ場所にいる人とプロフィールカードを自動で交換。新しい出会いのきっかけに。"],
  [I.event, "イベント・サークル", "学内イベントの作成・参加・出欠管理や、サークル活動の情報共有ができます。"],
  [I.music, "Science Tokyo Music", "学内の楽曲を集めた音楽プレイヤー。歌詞表示やバックグラウンド再生に対応。"],
  [I.train, "電車の発車時刻", "最寄り駅の発車時刻をホームからすぐ確認。授業終わりの移動がスムーズに。"],
  [I.dumbbell, "ジムの混雑状況", "学内ジムの混雑をひと目でチェック。空いている時間を狙って通えます。"],
  [I.star, "ツバメポイント", "毎日のログインや活動でポイントが貯まり、ランキングやレベルで成長を実感。"],
  [I.lock, "安心のセキュリティ", "パスコードロック・Face ID / 指紋認証に対応。大切な学業データを守ります。"],
];

export default function FeaturesClient() {
  useReveal();
  const scrolled = useScrolled();

  return (
    <div className="ft-root">
      <style>{CSS}</style>

      {/* ─── Nav ─── */}
      <nav className={`ft-nav ${scrolled ? "scrolled" : ""}`}>
        <a href="/features" className="ft-nav-l">
          <img src="/icons/icon-192x192.png" alt="" />
          ScienceTokyo App
        </a>
        <a href="/install" className="ft-cta ft-cta-sm">はじめる</a>
      </nav>

      {/* ─── Hero ─── */}
      <header className="ft-hero">
        <div className="ft-hero-glow" />
        <div data-reveal className="is-in">
          <p className="ft-eye" style={{ justifyContent: "center" }}>東京科学大学 キャンパスSNS</p>
          <h1 className="ft-h1">
            大学生活の、<br /><span className="ft-grad">すべてを。</span>
          </h1>
          <p className="ft-sub">
            時間割も、課題も、友達も、キャンパスも。
            <br />毎日をもっと便利にする、学生のためのひとつのアプリ。
          </p>
          <div className="ft-hero-btns">
            <a href="/install" className="ft-cta">アプリをはじめる</a>
            <a href="#demo-sec" className="ft-link">デモを見る ↓</a>
          </div>
        </div>
        <div className="ft-hero-phone" data-reveal>
          <Phone w={290} className="ft-float"><HomeMock /></Phone>
        </div>
      </header>

      {/* ─── Sections ─── */}
      <Section
        eye="時間割・課題"
        title={<>大学のLMSと、<br />ぴったり同期。</>}
        body="大学公式の Moodle と連携して、時間割・課題・成績を自動で取得。締切が近い課題は、アプリを閉じていてもプッシュ通知でお知らせします。もう提出忘れに焦らない。"
        visual={<Phone w={272}><TTMock /></Phone>}
      />

      <Section
        reverse
        eye="つながる"
        title={<>同じ大学の仲間と、<br />気軽に。</>}
        body="学内限定のSNSで投稿・コメント・リアクション。友達とのDMやグループチャットはスタンプにも対応。学科・サークルの仲間と、いつでもつながれます。"
        visual={<Phone w={272}><DMMock /></Phone>}
      />

      {/* ─── Dark spotlight: map / location ─── */}
      <div className="ft-dark">
        <Section
          eye="キャンパスナビ"
          title={<>広いキャンパスでも、<br />もう迷わない。</>}
          body="学内のスポットを検索して、マップ上でそのままナビゲーション。友達の現在地もリアルタイムで共有できるから、待ち合わせや空きコマの合流もスムーズ。位置情報の共有は完全オプトインで安心です。"
          visual={<Phone w={272}><MapMock /></Phone>}
        />
      </div>

      {/* ─── Live demo ─── */}
      <div id="demo-sec"><LiveDemo /></div>

      {/* ─── Feature grid ─── */}
      <section className="ft-sec">
        <div data-reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="ft-eye" style={{ justifyContent: "center" }}>まだまだ、ある。</p>
          <h2 className="ft-h2">大学生活を支える、多彩な機能。</h2>
        </div>
        <div className="ft-grid">
          {GRID.map(([Ic, title, desc], i) => (
            <div className="ft-card" data-reveal style={{ transitionDelay: `${(i % 4) * 70}ms` }} key={title}>
              <div className="ft-ico"><Ic /></div>
              <h3 className="ft-card-t">{title}</h3>
              <p className="ft-card-d">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="ft-sec">
        <div className="ft-band" data-reveal>
          <h2 className="ft-band-t">さあ、はじめよう。</h2>
          <p className="ft-band-p">インストールは数十秒。ホーム画面に追加して、今日から使えます。</p>
          <a href="/install" className="ft-cta ft-cta-on-dark">アプリをはじめる</a>
          <p className="ft-band-note">※ ご利用には東京科学大学（旧 東京工業大学・東京医科歯科大学）の学生アカウントが必要です。</p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="ft-footer">
        <a href="/support">サポート</a>
        <a href="/privacy">プライバシーポリシー</a>
        <a href="/">アプリを開く</a>
        <p>ScienceTokyo App — 東京科学大学の学生が開発・運営</p>
      </footer>
    </div>
  );
}

/* ============================================================
   CSS
   ============================================================ */
const CSS = `
.ft-root{
  --accent:#28c868;--accent2:#0bbf8f;--ink:#0e2030;--mut:#5b7185;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif;
  color:var(--ink);background:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased;
}
.ft-root *{box-sizing:border-box;}

/* nav */
.ft-nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;
  padding:12px 22px;transition:background .3s,border-color .3s,box-shadow .3s;border-bottom:1px solid transparent;}
.ft-nav.scrolled{background:rgba(255,255,255,.78);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom-color:#e8eef4;}
.ft-nav-l{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;color:var(--ink);text-decoration:none;}
.ft-nav-l img{width:30px;height:30px;border-radius:8px;}

/* buttons */
.ft-cta{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:#fff;text-decoration:none;
  font-weight:700;border-radius:980px;padding:14px 30px;font-size:16px;box-shadow:0 8px 24px -6px rgba(40,200,104,.5);transition:transform .2s,box-shadow .2s;}
.ft-cta:hover{transform:translateY(-2px);box-shadow:0 12px 30px -6px rgba(40,200,104,.6);}
.ft-cta-sm{padding:8px 18px;font-size:13px;box-shadow:none;}
.ft-cta-on-dark{background:#fff;color:#0a8f44;box-shadow:0 10px 30px -8px rgba(0,0,0,.3);}
.ft-link{display:inline-flex;align-items:center;color:var(--mut);text-decoration:none;font-size:15px;font-weight:600;transition:color .2s;}
.ft-link:hover{color:var(--accent);}

/* hero */
.ft-hero{position:relative;text-align:center;padding:140px 20px 40px;overflow:hidden;}
.ft-hero-glow{position:absolute;top:-160px;left:50%;transform:translateX(-50%);width:900px;max-width:140vw;height:560px;
  background:radial-gradient(closest-side,rgba(40,200,104,.22),rgba(40,200,104,0));pointer-events:none;z-index:0;}
.ft-hero>div{position:relative;z-index:1;}
.ft-h1{font-size:clamp(42px,8.5vw,88px);font-weight:800;letter-spacing:-.035em;line-height:1.01;margin:14px 0 0;}
.ft-grad{background:linear-gradient(115deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent;}
.ft-sub{font-size:clamp(16px,2.3vw,21px);color:var(--mut);max-width:600px;margin:24px auto 0;line-height:1.65;}
.ft-hero-btns{display:flex;gap:22px;align-items:center;justify-content:center;margin-top:34px;flex-wrap:wrap;}
.ft-hero-phone{display:flex;justify-content:center;margin-top:54px;}

/* eyebrow */
.ft-eye{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;letter-spacing:.12em;color:var(--accent);text-transform:uppercase;margin:0 0 16px;}

/* section */
.ft-sec{max-width:1080px;margin:0 auto;padding:96px 24px;}
.ft-row{display:flex;align-items:center;gap:64px;}
.ft-row.rev{flex-direction:row-reverse;}
.ft-col{flex:1;min-width:0;}
.ft-visual{display:flex;justify-content:center;}
.ft-h2{font-size:clamp(28px,4.6vw,48px);font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:0 0 20px;}
.ft-p{font-size:clamp(15px,1.7vw,18px);line-height:1.78;color:var(--mut);margin:0;}

/* dark */
.ft-dark{position:relative;background:#0a1320;color:#fff;overflow:hidden;}
.ft-dark:before{content:'';position:absolute;top:-20%;left:-10%;width:60%;height:140%;
  background:radial-gradient(closest-side,rgba(40,200,104,.16),transparent);pointer-events:none;}
.ft-dark .ft-h2,.ft-dark .ft-nav-l{color:#fff;}
.ft-dark .ft-p{color:#9fb2c4;}

/* phone */
.ft-phone{flex:none;background:#0c0f14;border-radius:46px;padding:11px;position:relative;
  box-shadow:0 50px 90px -30px rgba(13,40,70,.5),0 0 0 1px rgba(255,255,255,.06) inset;}
.ft-screen{border-radius:36px;overflow:hidden;background:#0c0f14;aspect-ratio:9/19.5;position:relative;padding-top:26px;}
.ft-island{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:30%;height:9px;background:#000;border-radius:10px;z-index:12;}
.ft-mock{height:100%;display:flex;flex-direction:column;background:#eef5fb;padding-top:6px;}
.ft-iframe{width:100%;height:100%;border:0;display:block;background:#eef5fb;}
.ft-shimmer{width:100%;height:100%;background:linear-gradient(100deg,#11161f 30%,#1a2230 50%,#11161f 70%);background-size:200% 100%;animation:ft-sh 1.4s linear infinite;}
@keyframes ft-sh{to{background-position:-200% 0}}

/* float */
@keyframes ft-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.ft-float{animation:ft-float 6.5s ease-in-out infinite;}

/* grid */
.ft-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:18px;}
.ft-card{background:#fff;border:1px solid #e6edf3;border-radius:22px;padding:28px 26px;transition:transform .25s,box-shadow .25s,border-color .25s;}
.ft-card:hover{transform:translateY(-4px);box-shadow:0 20px 40px -20px rgba(13,40,70,.25);border-color:rgba(40,200,104,.4);}
.ft-ico{width:52px;height:52px;border-radius:15px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,rgba(40,200,104,.16),rgba(11,191,143,.13));color:#0a8f44;margin-bottom:18px;}
.ft-card-t{font-size:18px;font-weight:700;color:var(--ink);margin:0 0 8px;letter-spacing:-.01em;}
.ft-card-d{font-size:14px;line-height:1.7;color:var(--mut);margin:0;}

/* live demo stage */
.ft-stage{position:relative;overflow:hidden;padding:104px 24px 116px;
  background:radial-gradient(130% 90% at 50% -10%,#15273c 0%,#0a1320 58%,#070d16 100%);}
.ft-eye-on-dark{color:#5ee79b;}
.ft-stage-glow{position:absolute;top:4%;left:50%;transform:translateX(-50%);width:820px;max-width:140vw;height:680px;
  background:radial-gradient(closest-side,rgba(40,200,104,.20),transparent);pointer-events:none;z-index:0;}
.ft-stage-grid{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.5;
  background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:48px 48px;mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent 75%);-webkit-mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent 75%);}
.ft-stage-phone{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;margin-top:58px;}
.ft-halo{position:absolute;top:46%;left:50%;transform:translate(-50%,-50%);width:560px;height:560px;max-width:92vw;
  background:radial-gradient(closest-side,rgba(40,200,104,.30),transparent 70%);filter:blur(28px);pointer-events:none;z-index:-1;}
.ft-phone-lg{width:min(86vw,396px);
  box-shadow:0 70px 130px -34px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.09) inset,0 0 80px -14px rgba(40,200,104,.4);}
.ft-touch-hint{margin-top:26px;display:inline-flex;align-items:center;gap:9px;
  padding:9px 18px;border-radius:980px;font-size:13px;font-weight:600;color:#cfe8d8;
  background:rgba(40,200,104,.1);border:1px solid rgba(40,200,104,.32);backdrop-filter:blur(6px);}
.ft-touch-dot{width:8px;height:8px;border-radius:50%;background:#28c868;box-shadow:0 0 0 0 rgba(40,200,104,.6);animation:ft-pulse 2s ease-out infinite;}
@keyframes ft-pulse{0%{box-shadow:0 0 0 0 rgba(40,200,104,.55)}70%{box-shadow:0 0 0 10px rgba(40,200,104,0)}100%{box-shadow:0 0 0 0 rgba(40,200,104,0)}}

/* cta band */
.ft-band{position:relative;overflow:hidden;text-align:center;border-radius:32px;padding:72px 28px;color:#fff;
  background:linear-gradient(125deg,#28c868,#0bbf8f 55%,#0aa6b0);box-shadow:0 30px 70px -28px rgba(11,191,143,.7);}
.ft-band-t{font-size:clamp(28px,4.6vw,46px);font-weight:800;letter-spacing:-.025em;margin:0 0 14px;}
.ft-band-p{font-size:clamp(15px,2vw,18px);opacity:.95;margin:0 0 30px;}
.ft-band-note{font-size:12.5px;opacity:.85;margin:22px 0 0;}

/* footer */
.ft-footer{text-align:center;padding:48px 20px 60px;border-top:1px solid #e6edf3;}
.ft-footer a{color:var(--accent);text-decoration:none;font-size:14px;font-weight:600;margin:0 14px;}
.ft-footer a:hover{text-decoration:underline;}
.ft-footer p{color:#9bb0c2;font-size:13px;margin:18px 0 0;}

/* reveal */
[data-reveal]{opacity:0;transform:translateY(42px);transition:opacity .85s cubic-bezier(.2,.7,.2,1),transform .85s cubic-bezier(.2,.7,.2,1);}
[data-reveal].is-in{opacity:1;transform:none;}
@media(prefers-reduced-motion:reduce){[data-reveal]{opacity:1;transform:none;transition:none;}.ft-float{animation:none;}}

/* responsive */
@media(max-width:860px){
  .ft-row,.ft-row.rev{flex-direction:column;gap:44px;text-align:center;}
  .ft-eye{justify-content:center;}
  .ft-sec{padding:72px 22px;}
  .ft-hero{padding:120px 20px 30px;}
}
`;
