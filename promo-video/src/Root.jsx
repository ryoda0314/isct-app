import { Composition, staticFile } from 'remotion';
import { PromoVideo } from './PromoVideo.jsx';
import { AppPromo } from './promo/AppPromo.jsx';
import { T, FPS, W, H } from './promo/theme.js';
import { Campus3DCheck } from './promo2/dev/Campus3DCheck.jsx';
import { AppPromoV2 } from './promo2/AppPromoV2.jsx';
import { T2 } from './promo2/theme2.js';
import { StoryPromo } from './story/StoryPromo.jsx';
import { SH, SW, TS } from './story/theme.js';
import { FestPromo } from './fest/FestPromo.jsx';
import { TF } from './fest/theme.js';
import { AppPromoFilm } from './film/AppPromoFilm.jsx';
import { TL } from './film/theme.js';
import { PhoneCheck } from './film/dev/PhoneCheck.jsx';
import { TX, XPromo, XS } from './x/XPromo.jsx';
import { ZUNDA_TOTAL, ZundaPromo } from './zundamon/ZundaPromo.jsx';

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="PromoVideo"
        component={PromoVideo}
        // 既定は public/timeline.json を読む。render:test では --props で上書き。
        defaultProps={{ timeline: null }}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={async ({ props }) => {
          let timeline = props.timeline;
          if (!timeline) {
            const res = await fetch(staticFile('timeline.json'));
            timeline = await res.json();
          }
          const fps = timeline.fps || 30;
          const totalSec =
            timeline.segments.reduce((s, x) => s + x.duration + (x.gapAfter || 0), 0) + 1.0;
          return {
            durationInFrames: Math.ceil(totalSec * fps),
            fps,
            width: timeline.width || 1920,
            height: timeline.height || 1080,
            props: { ...props, timeline },
          };
        }}
      />
      {/* アプリ紹介アニメーション（モーショングラフィックス版・約54秒） */}
      <Composition
        id="AppPromo"
        component={AppPromo}
        durationInFrames={T.total}
        fps={FPS}
        width={W}
        height={H}
      />
      {/* アプリ紹介アニメーション ver2（実画面・ある学生の1日・約59秒） */}
      <Composition id="AppPromoV2" component={AppPromoV2} durationInFrames={T2.total} fps={FPS} width={W} height={H} />
      {/* インスタのストーリー用の縦動画（1080x1920・約20秒） */}
      <Composition id="StoryPromo" component={StoryPromo} durationInFrames={TS.total} fps={FPS} width={SW} height={SH} />
      {/* 工大祭の出店団体むけ「出店を宣伝しませんか？」の縦動画（1080x1920・約23.6秒） */}
      <Composition id="FestPromo" component={FestPromo} durationInFrames={TF.total} fps={FPS} width={SW} height={SH} />
      {/* 最高傑作版（季節のテーマで1年をたどる・曲を通しで使う・約3分） */}
      <Composition id="AppPromoFilm" component={AppPromoFilm} durationInFrames={TL.total} fps={FPS} width={W} height={H} />
      {/* ずんだもんが紹介する ScienceTokyo App（1920x1080・約2分15秒） */}
      <Composition id="ZundaPromo" component={ZundaPromo} durationInFrames={ZUNDA_TOTAL} fps={FPS} width={W} height={H} />
      {/* X（Twitter）のタイムライン用（1080x1080・約30秒・工大祭は扱わない） */}
      <Composition id="XPromo" component={XPromo} durationInFrames={TX.total} fps={FPS} width={XS} height={XS} />
      {/* 開発用：3Dモデルの端末の見え方の確認 */}
      <Composition id="PhoneCheck" component={PhoneCheck} durationInFrames={1} fps={FPS} width={W} height={H} />
      {/* 開発用：ver2 の3Dキャンパスのカメラ確認（--props で調整） */}
      <Composition id="Campus3DCheck" component={Campus3DCheck} durationInFrames={1} fps={FPS} width={W} height={H} />
    </>
  );
};
