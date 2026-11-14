import { useState, useEffect, useMemo } from "react";
import { locCal } from "../i18n.js";
import { getAuth } from "../authState.js";
import { getAcademicInfo } from "../academicCalendar.js";
import { GuestGuide } from "../components/GuestGuide.jsx";
import { AnnouncementBanner } from "../AnnouncementBanner.jsx";
import { HomeTrainWidget } from "./TrainView.jsx";
import { CareerHomeWidget } from "./CareerView.jsx";
import { useCareerVisible } from "../careerAccess.js";
import { HomeHeader } from "../home/HomeHeader.jsx";
import { useWeather } from "../home/weather.jsx";
import { Shortcuts, PortalError, usePortalLauncher, QA_ALL, QA_DEFAULT } from "../home/Shortcuts.jsx";
import { TodayCard } from "../home/TodayCard.jsx";
import { DeadlinesCard } from "../home/DeadlinesCard.jsx";
import { buildToday, findNextClassDay, upcomingExams, useMyExams, ymd } from "../home/todayPlan.js";

// プロフィール ＞ ホーム画面 のショートカット設定が読む
export { QA_ALL, QA_DEFAULT };

/**
 * ホーム。上から 日付・学年暦・天気 → （ゲストには「はじめに」）→ ショートカット → お知らせ →
 * 今日の予定 → 締切・試験 → 電車 → キャリアの新着。PC では今日の予定を左、締切から下を右に並べる。
 * 部品は campus-sns/home/ にある。中身がない欄（お知らせ・締切・電車・キャリア）は出さない。
 */
export const HomeView = ({ asgn, setView, setCid, setCh, mob, courses = [], user = {}, myEvents = [], hiddenSet = new Set(), qDataAll = {}, goToBuilding, medSessions = [], records = {}, setStatus }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  const status = getAuth().status;
  const careerOn = useCareerVisible(user?.isAdmin);
  const isMed = medSessions.length > 0;
  const weather = useWeather();
  const portal = usePortalLauncher();
  const myExams = useMyExams(courses);
  const dayKey = ymd(now);
  const today = useMemo(() => buildToday({ qDataAll, medSessions, myEvents, myExams, courses, now }), [qDataAll, medSessions, myEvents, myExams, courses, now]);
  // 日付が変わったとき・データが変わったときだけ計算し直す
  const nextDay = useMemo(() => findNextClassDay({ qDataAll, medSessions, now }), [qDataAll, medSessions, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const examsSoon = useMemo(() => upcomingExams(myExams, now), [myExams, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const period = getAcademicInfo(now).period;

  const todayCard = (
    <TodayCard items={today} nextDay={nextDay} now={now} hasTimetable={courses.length > 0 || isMed} periodLabel={period ? locCal(period.l) : null}
      account={status === "account"} ttView={isMed ? "med-tt" : "timetable"} setView={setView} setCid={setCid} setCh={setCh}
      goToBuilding={goToBuilding} records={records} setStatus={setStatus} />
  );
  const side = (
    <>
      <DeadlinesCard asgn={asgn} hiddenSet={hiddenSet} courses={courses} exams={examsSoon} now={now} mob={mob} setView={setView} />
      <HomeTrainWidget setView={setView} />
      <CareerHomeWidget setView={setView} isAdmin={user?.isAdmin} />
    </>
  );

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ maxWidth: mob ? undefined : 1080, margin: "0 auto", padding: mob ? "0 16px 28px" : "0 28px 36px", display: "flex", flexDirection: "column", gap: mob ? 16 : 18 }}>
          <HomeHeader now={now} mob={mob} setView={setView} weather={weather} />
          {status === "guest" && <GuestGuide setView={setView} mob={mob} hasTimetable={courses.length > 0} />}
          <Shortcuts setView={setView} careerOn={careerOn} isMed={isMed} portal={portal} mob={mob} />
          <AnnouncementBanner setView={setView} />
          {mob ? <>{todayCard}{side}</> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div style={{ flex: "1.4 1 440px", minWidth: 0 }}>{todayCard}</div>
              <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>{side}</div>
            </div>
          )}
        </div>
      </div>
      <PortalError portal={portal} mob={mob} />
    </>
  );
};
