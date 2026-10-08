import { Composition, staticFile } from 'remotion';
import { PromoVideo } from './PromoVideo.jsx';
import { AppPromo } from './promo/AppPromo.jsx';
import { T, FPS, W, H } from './promo/theme.js';
import { Campus3DCheck } from './promo2/dev/Campus3DCheck.jsx';
import { AppPromoV2 } from './promo2/AppPromoV2.jsx';
import { T2 } from './promo2/theme2.js';

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
      {/* 開発用：ver2 の3Dキャンパスのカメラ確認（--props で調整） */}
      <Composition id="Campus3DCheck" component={Campus3DCheck} durationInFrames={1} fps={FPS} width={W} height={H} />
    </>
  );
};
