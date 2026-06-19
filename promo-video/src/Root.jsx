import { Composition, staticFile } from 'remotion';
import { PromoVideo } from './PromoVideo.jsx';

export const RemotionRoot = () => {
  return (
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
  );
};
