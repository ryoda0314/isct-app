import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { EASE_IN, T, ease, sp } from '../theme.js';
import { PHONE_H, PHONE_W, Phone, StatusBar, TabBar } from '../Phone.jsx';
import { HomeScreen } from '../screens/HomeScreen.jsx';
import { Headline, SubCopy } from '../text.jsx';

// ブレイク（ベースが抜ける区間）に合わせて、落ち着いたテンポでデバイスを並べる
const LAP = { x: 300, y: 300, w: 1076, h: 686, bezel: 18 };

export const Devices = ({ f }) => {
  const d = f - T.devices;
  const lapP = sp(d, 0, { damping: 22, stiffness: 100 });
  const phoneP = sp(d, 9, { damping: 20, stiffness: 110 });
  const out = ease(d, [80, 93], [0, 1], EASE_IN);
  const push = 1 + 0.03 * ease(d, [0, 100], [0, 1], (x) => x);
  const screenOn = ease(d, [8, 20], [0, 1]);
  const pScale = 0.74;
  const pcx = 1525;
  const pcy = 652;
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 92, left: 0, right: 0 }}>
        <Headline lines={[[{ t: 'スマホでも、' }, { t: 'PCでも', grad: true }, { t: '。' }]]} f={d} d={2} exitAt={78} size={96} align="center" />
        <div style={{ marginTop: 16 }}>
          <SubCopy text="iPhone・Android・PC、どこからでも。" f={d} d={11} exitAt={76} size={30} align="center" />
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push}) translateY(${out * 40}px)`, transformOrigin: '960px 700px', opacity: 1 - out }}>
        {/* ノートPC */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - lapP) * 160}px)`, opacity: ease(d, [0, 6], [0, 1]) }}>
          <div style={{
            position: 'absolute', left: LAP.x, top: LAP.y, width: LAP.w, height: LAP.h, boxSizing: 'border-box', padding: LAP.bezel,
            borderRadius: '26px 26px 10px 10px', background: 'linear-gradient(160deg, #2a313d, #0f131a 45%)',
            boxShadow: '0 50px 100px -40px rgba(14,32,48,0.55), inset 0 0 0 1.5px #4a5262',
          }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', background: '#0b0f15' }}>
              <Img src={staticFile('promo/desktop-timetable.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: screenOn }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 38%)', opacity: screenOn }} />
            </div>
            <div style={{ position: 'absolute', top: 6, left: LAP.w / 2 - 5, width: 10, height: 6, borderRadius: 3, background: '#2a313d' }} />
          </div>
          <div style={{
            position: 'absolute', left: LAP.x + LAP.w / 2 - 650, top: LAP.y + LAP.h - 2, width: 1300, height: 28,
            borderRadius: '4px 4px 22px 22px', background: 'linear-gradient(180deg, #d9e1ea 0%, #b6c1cd 100%)',
            boxShadow: '0 24px 40px -18px rgba(14,32,48,0.5)',
          }}>
            <div style={{ position: 'absolute', left: 650 - 90, top: 0, width: 180, height: 10, borderRadius: '0 0 10px 10px', background: '#a7b2bf' }} />
          </div>
        </div>

        {/* スマホ */}
        <div style={{ position: 'absolute', inset: 0, perspective: 2000 }}>
          <Phone
            shadow={0.9}
            style={{
              left: pcx - PHONE_W / 2 + (1 - phoneP) * 340, top: pcy - PHONE_H / 2,
              transform: `rotateY(${-10 - (1 - phoneP) * 25}deg) scale(${pScale})`, opacity: ease(d, [9, 15], [0, 1]),
            }}
          >
            <HomeScreen f={60} />
            <StatusBar />
            <TabBar from="home" />
          </Phone>
        </div>
      </div>
    </AbsoluteFill>
  );
};
