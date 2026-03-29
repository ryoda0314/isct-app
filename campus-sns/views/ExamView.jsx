import React, { useState, useMemo } from "react";
import { T } from "../theme.js";
import { I } from "../icons.jsx";
import { EXAMS, PERIOD_TIMES, EXAM_LABEL, findMyExams } from "../examData.js";

const DAY_COLORS = { "月": "#6375f0", "火": "#e5534b", "水": "#3dae72", "木": "#d4843e", "金": "#a855c7" };

const fmtDate = d => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};
const fmtDateFull = d => {
  const dt = new Date(d + "T00:00:00");
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${dt.getMonth() + 1}月${dt.getDate()}日(${days[dt.getDay()]})`;
};

const countdownText = dateStr => {
  const now = new Date();
  const target = new Date(dateStr + "T00:00:00");
  const diff = target.getTime() - now.getTime();
  if (diff < 0) return "終了";
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "今日";
  if (days === 1) return "明日";
  return `あと${days}日`;
};

export const ExamView = ({ courses = [], mob, goToBuilding, setCid, setView, setCh }) => {
  const [showAll, setShowAll] = useState(false);

  // 該当する試験 (codeRaw でセクション絞り込み)
  const myExams = useMemo(() => findMyExams(courses), [courses]);

  // ベースコードセット (色取得・履修判定用)
  const myCodes = useMemo(() => {
    return courses.map(c => c.code?.replace(/-\d+$/, "")).filter(Boolean);
  }, [courses]);

  // コースコード → コース情報マップ (色取得用)
  const codeMap = useMemo(() => {
    const m = {};
    courses.forEach(c => {
      const base = c.code?.replace(/-\d+$/, "");
      if (base) m[base] = c;
    });
    return m;
  }, [courses]);

  // 表示データ: showAll=true なら全試験, false ならマイ試験のみ
  const displayExams = showAll ? EXAMS : myExams;

  // 日付でグルーピング
  const grouped = useMemo(() => {
    const map = new Map();
    displayExams.forEach(e => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    // 日付順
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [displayExams]);

  // 次の試験
  const nextExam = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return myExams.find(e => e.date >= todayStr) || null;
  }, [myExams]);

  const ExamCard = ({ exam }) => {
    const c = codeMap[exam.code];
    const col = c?.col || DAY_COLORS[exam.day] || T.accent;
    const pt = PERIOD_TIMES[exam.period];
    const timeStr = pt ? `${pt.start}〜${pt.end}` : exam.period;
    const isMyExam = myCodes.includes(exam.code);

    return (
      <div style={{
        display: "flex", gap: 10, padding: mob ? "10px 12px" : "10px 14px",
        borderRadius: 10, background: isMyExam ? `${col}10` : T.bg2,
        border: `1px solid ${isMyExam ? `${col}30` : T.bd}`,
        transition: "all .15s"
      }}>
        {/* 時間帯 */}
        <div style={{ flexShrink: 0, width: mob ? 56 : 64, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
          <div style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: col }}>{exam.period}限</div>
          <div style={{ fontSize: 10, color: T.txD }}>{timeStr}</div>
        </div>
        {/* 区切り線 */}
        <div style={{ width: 3, borderRadius: 2, background: col, flexShrink: 0 }} />
        {/* 内容 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: col }}>{exam.code}</span>
            {isMyExam && <span style={{
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
              background: `${col}20`, color: col
            }}>履修中</span>}
          </div>
          <div style={{
            fontSize: mob ? 13 : 14, fontWeight: 600, color: T.txH, marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{exam.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: T.txD }}>
              {I.pin}<span>{exam.room}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: T.txD }}>
              {I.user1}<span style={{ fontSize: 11 }}>{exam.instructor}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? 12 : 20 }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: mob ? 18 : 20, fontWeight: 800, color: T.txH }}>{EXAM_LABEL}</h2>
          <div style={{ fontSize: 12, color: T.txD, marginTop: 2 }}>
            {myExams.length > 0
              ? `${myExams.length}件の試験が見つかりました`
              : "履修科目の試験はありません"}
          </div>
        </div>
      </div>

      {/* 次の試験カウントダウン */}
      {nextExam && (
        <div style={{
          padding: mob ? 14 : 16, borderRadius: 14,
          background: `linear-gradient(135deg, ${T.accent}15, ${T.accent}05)`,
          border: `1px solid ${T.accent}25`, marginBottom: 16
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `${T.accent}20`, display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.txD }}>次の試験</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{nextExam.name}</div>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 800, color: T.accent,
              padding: "4px 12px", borderRadius: 8, background: `${T.accent}15`
            }}>
              {countdownText(nextExam.date)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 12, color: T.txD }}>
            <span>{fmtDateFull(nextExam.date)}</span>
            <span>{PERIOD_TIMES[nextExam.period]?.start}〜{PERIOD_TIMES[nextExam.period]?.end}</span>
            <span>{nextExam.room}</span>
          </div>
        </div>
      )}

      {/* フィルタートグル */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => setShowAll(false)} style={{
          padding: "6px 14px", borderRadius: 8, border: `1px solid ${!showAll ? T.accent : T.bd}`,
          background: !showAll ? `${T.accent}15` : T.bg2, color: !showAll ? T.accent : T.txD,
          fontSize: 12, fontWeight: 600, cursor: "pointer"
        }}>
          マイ試験 ({myExams.length})
        </button>
        <button onClick={() => setShowAll(true)} style={{
          padding: "6px 14px", borderRadius: 8, border: `1px solid ${showAll ? T.accent : T.bd}`,
          background: showAll ? `${T.accent}15` : T.bg2, color: showAll ? T.accent : T.txD,
          fontSize: 12, fontWeight: 600, cursor: "pointer"
        }}>
          全試験一覧 ({EXAMS.length})
        </button>
      </div>

      {/* 試験一覧 (日付グループ) */}
      {grouped.length === 0 && (
        <div style={{
          textAlign: "center", padding: 40, color: T.txD, fontSize: 14
        }}>
          {showAll ? "試験データがありません" : "履修科目に該当する試験がありません"}
        </div>
      )}

      {grouped.map(([date, exams]) => {
        const dayCol = DAY_COLORS[exams[0]?.day] || T.accent;
        const cd = countdownText(date);
        const isPast = cd === "終了";
        return (
          <div key={date} style={{ marginBottom: 20, opacity: isPast ? 0.5 : 1 }}>
            {/* 日付ヘッダー */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
              padding: "6px 0", borderBottom: `2px solid ${dayCol}30`
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: `${dayCol}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800, color: dayCol
              }}>
                {fmtDate(date).split("/")[1]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.txH }}>{fmtDateFull(date)}</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 6,
                background: isPast ? `${T.txD}15` : `${dayCol}15`,
                color: isPast ? T.txD : dayCol
              }}>
                {cd}
              </span>
            </div>
            {/* その日の試験カード */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {exams.map((exam, i) => <ExamCard key={`${exam.codeRaw}-${i}`} exam={exam} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
