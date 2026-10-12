import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import '../promo/fonts.js';
import { EASE_IN, EASE_IN_OUT, EASE_OUT, FONT, ease, mix, sp } from '../promo/theme.js';
import { Laptop, RecScreen, recCard, recMeta, recSrc } from '../film/Device.jsx';
import { PhoneAt, poseAt } from '../film/stage.jsx';
import { Zundamon } from './Zundamon.jsx';
import { Burst } from '../promo/scenes/Reveal.jsx';
import { Background, ChapterBadge, ChapterWipe, Flash, Highlight, PushBanner, Question, SignPost, Subtitle, Telop, ZC } from './parts.jsx';
import { CHAPTERS, LINE, LINES, SCENE, TOTAL, chapterNo, exprLineAt, sceneAt, talkAt, word } from './timeline.js';

// ずんだもんが紹介する ScienceTokyo App（1920x1080・30fps・約2分15秒）。
// 台本は script.json、声は VOICEVOX:ずんだもん（capture/zunda_voice.mjs）、立ち絵は坂本アヒルさんの「ずんだもん立ち絵素材2.3」をパーツから組み立てる。
// 端末の画面はアプリを実際に操作した動画（capture/record_film.mjs の rec_z_*）。操作は声の言葉に合わせて撮ってあり、1 倍速で流す。
// BGM と効果音は capture/zunda_audio.py で合成したもの。
export { TOTAL as ZUNDA_TOTAL };

const S = SCENE;
// ── 端末の置き場所（左）と、ずんだもんの置き場所（右）──────────────
const PHONE = { x: 610, y: 515, s: 0.86, rx: 0, ry: 12, rz: 0 };
const ZUN = { x: 1500, y: 1246, s: 0.8 };
const phoneAppear = word('h3', 'コレ');

// ── 場面ごとの、端末の画面（録画）──────────────────────────
// 各章の録画（capture/record_film.mjs の rec_z_*）は、章の頭を 0 コマ目として撮ってあり、操作は声の言葉に合わせてある。
// なので映像では 1 倍速でそのまま流す（コマを止めたり飛ばしたりしない＝アプリの動きがなめらか）
const REC = { home: 'rec_z_home', tt: 'rec_z_tt', navi: 'rec_z_navi', asgn: 'rec_z_asgn', free: 'rec_z_free', dm: 'rec_z_dm', theme: 'rec_z_theme' };
const recFrame = (scene, f) => f - S[scene].start;
// 録画の中のタップ・設定の切り替え（mark）の、映像のフレーム
const recTaps = (scene) => recMeta(REC[scene]).taps.map(([tf]) => S[scene].start + tf);
const recMarks = (scene, key) => (recMeta(REC[scene]).marks || []).filter(([, m]) => m.startsWith(key)).map(([mf]) => S[scene].start + mf);
const midori = word('th2', 'ミドリ');

// ホームで囲むカード（撮影中に記録した位置。天気は 0 コマ目、今日の授業と締切はスクロールが止まったコマ）
const HL_SCHED = word('hm2', 'ジュギョオ', 6) - S.home.start;
const HL_DEAD = word('hm2', 'シメキリ', 6) - S.home.start;
const HL = {
  weather: recCard('rec_z_home', 0, '晴れ'),
  sched: recCard('rec_z_home', HL_SCHED, '西9号館'),
  deadline: recCard('rec_z_home', HL_DEAD, '実験レポート第2回'),
};

const PhoneContent = ({ f }) => {
  const sc = sceneAt(f).id;
  if (sc === 'hook' || sc === 'title' || sc === 'home') {
    return (
      <RecScreen name={REC.home} frame={recFrame('home', f)}>
        {sc === 'home' && (
          <>
            {HL.weather && <Highlight f={f} at={word('hm2', 'テンキ', -4)} until={word('hm2', 'ジュギョオ', -16)} r={HL.weather} label="天気" />}
            {HL.sched && <Highlight f={f} at={word('hm2', 'ジュギョオ', 4)} until={word('hm2', 'シメキリ', -16)} r={HL.sched} label="1限・西9号館" />}
            {HL.deadline && <Highlight f={f} at={word('hm2', 'シメキリ', 4)} until={S.home.end - 4} r={HL.deadline} label="締切" />}
          </>
        )}
      </RecScreen>
    );
  }
  if (REC[sc]) {
    return (
      <RecScreen name={REC[sc]} frame={recFrame(sc, f)} taps>
        {sc === 'asgn' && <PushBanner f={f} at={word('as1', 'ツウチ', -4)} until={LINE.as1.end + 2} title="課題の締切" body="「実験レポート第2回」の締切が明日です" />}
      </RecScreen>
    );
  }
  return <RecScreen name={REC.theme} frame={recFrame('theme', S.theme.end)} />;
};

// 端末の位置：冒頭の「これがあったのだ！」で下から飛び込む → 章のあいだは左に置いたまま（言葉に合わせて少し揺れる）→「まだまだ」で外へ
const phonePose = (f) => {
  const base = poseAt([
    { f: phoneAppear - 2, x: 420, y: 1500, s: 0.7, rx: 30, rz: -16 },
    { f: phoneAppear + 14, ...PHONE },
    { f: S.more.start - 2, ...PHONE },
    { f: S.more.start + 14, x: -400, y: 560, s: 0.7, ry: 30, rz: -10 },
  ], f);
  // ゆっくり漂う
  return { ...base, y: base.y + 6 * Math.sin(f / 40), ry: base.ry + 2 * Math.sin(f / 70) };
};

// ずんだもんの位置：冒頭は真ん中で迷子 → 「これがあったのだ」で右へ
const zundaPos = (f) => {
  const k = ease(f, [phoneAppear - 4, phoneAppear + 12], [0, 1], EASE_IN_OUT);
  return { x: mix(960, ZUN.x, k), y: mix(1300, ZUN.y, k), s: mix(0.86, ZUN.s, k) };
};

// ── 冒頭：迷子（道しるべ）──────────────────────────────
const Hook = ({ f }) => {
  const sc = S.hook;
  const gone = ease(f, [phoneAppear - 6, phoneAppear + 8], [0, 1], EASE_IN);
  const shake = f >= LINE.h1.at && f < LINE.h1.at + 14 ? 10 * Math.sin(f * 3.1) * (1 - (f - LINE.h1.at) / 14) : 0;
  const signs = [
    ['西9号館', 'right', 300, 250, -8, 2], ['本館', 'left', 1600, 230, 6, 6], ['南2号館', 'right', 260, 560, 5, 10],
    ['緑が丘', 'left', 1660, 540, -6, 14], ['大岡山駅', 'right', 330, 860, -4, 18], ['石川台', 'left', 1600, 850, 7, 22],
  ];
  return (
    <AbsoluteFill style={{ transform: `translateX(${shake}px)`, opacity: 1 - gone }}>
      {signs.map(([t, d, x, y, r, dl]) => <SignPost key={t} f={f} x={x} y={y} text={t} dir={d} rot={r} delay={sc.start + 6 + dl} />)}
      {[[700, 220, 30], [1230, 180, 38], [600, 700, 46], [1300, 640, 54], [960, 120, 62], [820, 420, 70], [1140, 430, 76]].map(([x, y, a], i) => (
        <Question key={i} f={f} x={x} y={y} at={LINE.h1.at + a - 30} size={70 + (i % 3) * 18} />
      ))}
    </AbsoluteFill>
  );
};

// ── タイトル ────────────────────────────────────────
const Title = ({ f }) => {
  const sc = S.title;
  const k = sp(f, sc.start + 2, { damping: 12, stiffness: 150 });
  const out = ease(f, [sc.end - 8, sc.end], [0, 1], EASE_IN);
  if (f < sc.start - 1 || f > sc.end + 1) return null;
  const rib = sp(f, sc.start + 14, { damping: 13, stiffness: 170 });
  return (
    <div style={{ position: 'absolute', left: 760, top: 150, width: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 60, opacity: 1 - out, transform: `scale(${Math.min(1.1, k)})` }}>
      <Img src={staticFile('promo/icon.png')} style={{ width: 170, height: 170, borderRadius: 40, boxShadow: '0 16px 0 rgba(47,91,31,0.18), 0 24px 50px -16px rgba(0,0,0,0.35)', transform: `rotate(${-6 + 3 * Math.sin(f / 10)}deg)` }} />
      <div style={{ textAlign: 'center', lineHeight: 1.0 }}>
        <div style={{ fontSize: 82, fontWeight: 900, color: ZC.ink, WebkitTextStroke: '15px #fff', paintOrder: 'stroke fill', letterSpacing: '-0.01em' }}>ScienceTokyo</div>
        <div style={{ fontSize: 112, fontWeight: 900, color: ZC.app, WebkitTextStroke: '17px #fff', paintOrder: 'stroke fill' }}>App</div>
      </div>
      <div style={{ padding: '12px 30px', borderRadius: 40, background: ZC.green, color: '#fff', fontSize: 38, fontWeight: 900, boxShadow: `0 7px 0 ${ZC.deep}`, transform: `rotate(-3deg) scale(${Math.min(1.1, rib)})`, whiteSpace: 'nowrap' }}>
        ずんだもんが紹介するのだ！
      </div>
    </div>
  );
};

// ── まだまだ（ほかの機能の端末を並べる → PC）────────────────────
const MORE_PHONES = [
  { rec: 'rec_grades', frame: 100, label: '成績・GPA', kana: 'セエセキ', x: 290, rz: -8 },
  { rec: 'rec_acad', frame: 60, label: '学年暦', kana: 'ガクネンレキ', x: 640, rz: 0 },
  { rec: 'rec_events', frame: 40, label: '大学の行事', kana: 'キノオ', x: 990, rz: 8 },
];
const More = ({ f }) => {
  const sc = S.more;
  if (f < sc.start - 2 || f > sc.end + 2) return null;
  const pcAt = LINE.mr2.at - 6;
  const away = ease(f, [pcAt - 4, pcAt + 10], [0, 1], EASE_IN);
  return (
    <AbsoluteFill>
      {MORE_PHONES.map((p, i) => {
        const at = word('mr1', p.kana, -4);
        const k = sp(f, at, { damping: 13, stiffness: 140 });
        if (k <= 0.001) return null;
        const pose = { x: p.x, y: mix(1400, 440, Math.min(1, k)) + away * 900, s: 0.62, rx: 0, ry: 0, rz: p.rz, o: 1 };
        const lk = ease(f, [at + 6, at + 14], [0, 1]);
        return (
          <React.Fragment key={p.rec}>
            <PhoneAt pose={pose}>
              <RecScreen name={p.rec} frame={p.frame + (f - at)} />
            </PhoneAt>
            <div style={{ position: 'absolute', left: p.x - 140, width: 280, top: pose.y + 300, textAlign: 'center', fontSize: 36, fontWeight: 900, color: ZC.ink, WebkitTextStroke: '9px #fff', paintOrder: 'stroke fill', opacity: lk * (1 - away), zIndex: 30 }}>{p.label}</div>
          </React.Fragment>
        );
      })}
      {f >= pcAt - 2 && <MorePC f={f} at={pcAt} />}
    </AbsoluteFill>
  );
};
const MorePC = ({ f, at }) => {
  const k = sp(f, at, { damping: 14, stiffness: 140 });
  const R = recMeta('rec_desk');
  const i = Math.max(0, Math.min(R.frames - 1, Math.round(6 + (f - at))));
  return (
    <Laptop x={150} y={mix(700, 250, Math.min(1, k))} w={980} opacity={Math.min(1, k * 1.5)}>
      <Img src={recSrc('rec_desk', i)} style={{ width: 980, height: (980 * 900) / 1440 }} />
    </Laptop>
  );
};

// ── エンドカード ─────────────────────────────────────
const End = ({ f }) => {
  const sc = S.end;
  if (f < sc.start - 2) return null;
  const e = f - sc.start;
  const icon = sp(e, 2, { damping: 11, stiffness: 150 });
  const name = sp(e, 8, { damping: 13, stiffness: 150 });
  const pill = sp(e, word('ed1', 'アップストア') - sc.start, { damping: 11, stiffness: 180 });
  const qr = sp(e, LINE.ed2.at - sc.start, { damping: 13, stiffness: 160 });
  const hit = f >= HIT ? Math.exp(-(f - HIT) / 7) : 0; // 締めのジングルの一打
  return (
    <AbsoluteFill style={{ zIndex: 40 }}>
      <Burst k={f - HIT} cx={660} cy={240} />
      <div style={{ position: 'absolute', left: 660 - 120, top: 120, transform: `scale(${Math.min(1.12, icon) * (1 + 0.08 * hit)}) rotate(${-4 + 3 * Math.sin(f / 12)}deg)` }}>
        <Img src={staticFile('promo/icon.png')} style={{ width: 240, height: 240, borderRadius: 56, boxShadow: '0 18px 0 rgba(47,91,31,0.18), 0 30px 60px -18px rgba(0,0,0,0.35)' }} />
      </div>
      <div style={{ position: 'absolute', left: 160, width: 1000, top: 400, textAlign: 'center', fontSize: 104, fontWeight: 900, color: ZC.ink, WebkitTextStroke: '18px #fff', paintOrder: 'stroke fill', transform: `scale(${Math.min(1.08, name)})` }}>
        ScienceTokyo <span style={{ color: ZC.app }}>App</span>
      </div>
      <div style={{ position: 'absolute', left: 660, top: 590, transform: `translateX(-50%) rotate(-2deg) scale(${Math.min(1.12, pill)})`, padding: '14px 40px', borderRadius: 50, background: ZC.pink, color: '#fff', fontSize: 50, fontWeight: 900, boxShadow: '0 8px 0 #c24d6c', whiteSpace: 'nowrap' }}>
        App Store で配信中！
      </div>
      <div style={{ position: 'absolute', left: 660 - 380, top: 700, width: 760, display: 'flex', alignItems: 'center', gap: 28, opacity: Math.min(1, qr * 1.4), transform: `scale(${0.8 + 0.2 * Math.min(1, qr)})` }}>
        <div style={{ padding: 10, borderRadius: 20, background: '#fff', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)' }}>
          <Img src={staticFile('zundamon/qr_appstore.png')} style={{ width: 190, height: 190, display: 'block' }} />
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: ZC.ink, lineHeight: 1.45, whiteSpace: 'nowrap' }}>
          App Store で<br />「ScienceTokyo」を検索<br /><span style={{ fontSize: 24, color: '#5d7a4a', fontWeight: 800 }}>東京科学大の学生アカウントで使えます</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 40, bottom: 22, fontSize: 20, fontWeight: 700, color: '#5d7a4a', opacity: ease(f, [LINE.ed2.end, LINE.ed2.end + 12], [0, 1]) }}>
        VOICEVOX:ずんだもん　／　立ち絵：坂本アヒル「ずんだもん立ち絵素材」　／　BGM・効果音：オリジナル
      </div>
    </AbsoluteFill>
  );
};

// ── 効果音 ──────────────────────────────────────────
const fx = (name, at, volume = 0.6, dur = 3) => ({ src: `zundamon/sfx/${name}.wav`, at, volume, dur });
const SFX = [
  fx('gaan', LINE.h1.at, 0.55),
  fx('shobon', LINE.h2.at, 0.35),
  fx('kira', word('h3', 'コレ', -2), 0.3),
  fx('boing', phoneAppear + 4, 0.4),
  fx('jan', S.title.start + 2, 0.55),
  ...CHAPTERS.map((c) => fx('swish', c.start - 10, 0.45)),
  ...['tt', 'navi', 'asgn', 'free', 'dm'].flatMap((sc) => recTaps(sc)).map((at) => fx('tap', at, 0.5, 0.3)), // 録画の中のタップ
  fx('pop', word('hm2', 'テンキ', -4), 0.35), fx('pop', word('hm2', 'ジュギョオ', 4), 0.35), fx('pop', word('hm2', 'シメキリ', 4), 0.35),
  fx('pop', word('tt1', 'ジドオ'), 0.4),
  fx('pop', word('nv2', 'スリイディイ'), 0.4),
  fx('kira', word('nv4', 'マイゴ'), 0.22),
  fx('pikon', word('as1', 'ツウチ', -4), 0.55),
  fx('kira', word('as3', 'チョクセツ'), 0.45),
  fx('success', word('as4', 'テエシュツ'), 0.35),
  fx('hiso', LINE.as5.at - 16, 0.35), // ささやく前に
  fx('pop', word('fr2', 'スグ'), 0.4),
  ...recMarks('theme', 'themePref').filter((at) => at < midori - 2).map((at) => fx('tick', at, 0.3, 0.3)), // テーマが替わるコマ
  fx('kira', midori, 0.28),
  ...recMarks('theme', 'langPref').filter((at) => at < LINE.lg2.at).map((at) => fx('tick', at, 0.35, 0.3)), // 言語が替わるコマ
  fx('hatena', LINE.lg2.at - 8, 0.3), // 「？」が出るところ（声の前）
  ...MORE_PHONES.map((p) => fx('pop', word('mr1', p.kana, -4), 0.35)),
  fx('swish', LINE.mr2.at - 8, 0.4),
  fx('boing', LINE.ed1.at, 0.35),
];

// BGM：タイトルから。声の間は少し下げる。エンドカードの前で消して、締めのジングル
const BGM_FROM = S.title.start;
const BAR = 60; // BGM は 120BPM・4/4（1小節 2 秒）
const JINGLE_AT = BGM_FROM + Math.round((LINE.ed2.end - BAR - BGM_FROM) / BAR) * BAR; // 締めのジングル（2 小節目の頭＝JINGLE_AT + 60 で一打）
export const HIT = JINGLE_AT + BAR;
const DUCK = { as5: 0.75 }; // 声の間に BGM を下げる割合（ささやきは深めに）
const speakingLine = (fr) => LINES.find((l) => fr >= l.at - 3 && fr < l.end + 3);
const bgmVolume = (fr) => {
  const f = fr + BGM_FROM;
  const sl = speakingLine(f);
  const duck = sl ? DUCK[sl.id] ?? 0.5 : 0;
  const fadeIn = ease(fr, [0, 6], [0, 1]);
  const fadeOut = 1 - ease(f, [JINGLE_AT - 2, JINGLE_AT + 8], [0, 1]);
  return 0.2 * (1 - duck) * fadeIn * fadeOut;
};

export const ZundaPromo = () => {
  const f = useCurrentFrame();
  const sc = sceneAt(f);
  const el = exprLineAt(f);
  const talk = talkAt(f);
  const zp = zundaPos(f);
  const showPhone = f >= phoneAppear - 2 && f < S.more.start + 16;
  const gloom = 1 - ease(f, [phoneAppear - 4, phoneAppear + 10], [0, 1]);
  const line = LINES.find((l) => f >= l.at - 1 && f <= l.end + 6);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: ZC.cream, overflow: 'hidden' }}>
      <Background f={f} gloom={f < S.title.start ? gloom : 0} />
      {f < S.title.start + 2 && <Hook f={f} />}
      <Title f={f} />
      <More f={f} />
      <End f={f} />
      {showPhone && <PhoneAt pose={phonePose(f)}><PhoneContent f={f} /></PhoneAt>}
      <Zundamon f={f} expr={el.expr} exprAt={el.at} talk={talk ? { moras: talk.line.voice.moras, t: talk.t } : null} x={zp.x} y={zp.y} scale={zp.s} />

      {/* 章ごとのテロップ */}
      <Telop f={f} at={word('tt1', 'ジドオ')} until={LINE.tt1.end + 4} text="履修から自動で！" x={1035} y={250} />
      <Telop f={f} at={word('nv2', 'スリイディイ')} until={LINE.nv3.end} text="3Dで道案内" sub="到着時刻もわかる" x={1035} y={250} rot={4} />
      <Telop f={f} at={word('as3', 'チョクセツ')} until={LINE.as4.end} text="アプリから提出！" x={1035} y={250} color={ZC.pink} />
      <Telop f={f} at={word('fr2', 'スグ')} until={LINE.fr3.end} text="空き教室が一目で" x={1035} y={250} rot={4} />
      <Telop f={f} at={word('th1', 'ジュウナナ')} until={LINE.th2.end} text="17のテーマ" x={1035} y={250} />
      <Telop f={f} at={word('lg1', 'エエゴ')} until={LINE.lg2.end} text="5つの言語" sub="日本語・English・中文・한국어・toki pona" x={1035} y={250} rot={4} size={58} />

      {CHAPTERS.map((c) => <ChapterBadge key={c.id} f={f} no={chapterNo(c.id)} title={c.chapter} start={c.start} end={c.end} />)}
      <Subtitle f={f} line={line} x={sc.id === 'hook' ? 960 : 700} y={sc.id === 'end' ? 930 : 968} />
      {CHAPTERS.map((c) => <ChapterWipe key={c.id} f={f} at={c.start} no={chapterNo(c.id)} title={c.chapter} />)}
      <Flash f={f} at={S.title.start} len={10} />
      <Flash f={f} at={S.end.start} len={12} />

      {/* 声 */}
      {LINES.map((l) => (
        <Sequence key={l.id} from={l.at} durationInFrames={l.dur + 2}>
          <Audio src={staticFile(`zundamon/voice/${l.id}.wav`)} />
        </Sequence>
      ))}
      {/* BGM と締めのジングル */}
      <Sequence from={BGM_FROM} durationInFrames={JINGLE_AT + 10 - BGM_FROM}>
        <Audio src={staticFile('zundamon/bgm.wav')} volume={bgmVolume} />
      </Sequence>
      <Sequence from={JINGLE_AT} durationInFrames={180}>
        <Audio src={staticFile('zundamon/bgm_end.wav')} volume={(fr) => 0.3 * (speakingLine(fr + JINGLE_AT) ? 0.55 : 1)} />
      </Sequence>
      {SFX.map((s, i) => (
        <Sequence key={`${i}-${s.src}-${s.at}`} from={s.at} durationInFrames={Math.ceil(s.dur * 30)}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
