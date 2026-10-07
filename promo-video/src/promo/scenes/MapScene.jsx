import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, EASE_IN, EASE_IN_OUT, T, alpha, ease, mix, sp } from '../theme.js';
import { Icon } from '../icons.jsx';
import { SCREEN_W, StatusBar, TAB_H, TabBar } from '../Phone.jsx';
import { MapWorld } from '../MapWorld.jsx';
import { ChapterLabel, Headline, SubCopy } from '../text.jsx';
import { MAP_SCREEN, MapPhoneUI, PHONE_SCALE } from './Showcase.jsx';

const S = PHONE_SCALE;
const QUERY = '南3号館';

// 1062f〜：端末の画面がそのまま全画面へ広がり、キャンパスナビになる
export const MapScene = ({ f }) => {
  const m = f - T.map;
  const e = ease(m, [6, 26], [0, 1], EASE_IN_OUT);
  const top = mix(MAP_SCREEN.y, 0, e);
  const left = mix(MAP_SCREEN.x, 0, e);
  const right = mix(1920 - (MAP_SCREEN.x + MAP_SCREEN.w), 0, e);
  const bottom = mix(1080 - (MAP_SCREEN.y + MAP_SCREEN.h), 0, e);
  const radius = mix(52 * S, 0, e);
  const clipW = 1920 - left - right;
  const phoneUiO = 1 - ease(m, [6, 13], [0, 1]);
  const bezelO = 1 - ease(m, [7, 17], [0, 1]);

  const zoom = 1 + 0.05 * ease(m, [26, 192], [0, 1], (x) => x);
  const pin = sp(m, 46, { damping: 11, stiffness: 150 });
  const route = ease(m, [50, 84], [0, 1], EASE_IN_OUT);
  const walker = m >= 84 ? ease(m, [84, 176], [0, 1], (x) => x) : null;
  const typed = QUERY.slice(0, Math.max(0, Math.min(QUERY.length, Math.floor((m - 30) / 3) + 1)));
  const out = ease(m, [184, 194], [0, 1], EASE_IN);

  const panelP = sp(m, 24, { damping: 20, stiffness: 120 });
  const searchP = sp(m, 22, { damping: 20, stiffness: 140 });
  const etaP = sp(m, 82, { damping: 14, stiffness: 160 });

  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${1 - 0.03 * out})` }}>
      {/* 端末のフチ（全画面化とともに広がって消える） */}
      <div style={{
        position: 'absolute', left: left - 12 * S, top: top - 12 * S, width: clipW + 24 * S, height: 1080 - top - bottom + 24 * S,
        borderRadius: mix(64 * S, 0, e), background: '#10141b', opacity: bezelO,
        boxShadow: `0 ${70 * S}px ${130 * S}px -40px rgba(14,32,48,0.5), 0 30px 60px -30px rgba(14,32,48,0.35)`,
      }} />
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)` }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '1300px 560px' }}>
          <MapWorld f={f} route={route} pin={pin} highlight={ease(m, [46, 54], [0, 1])} walker={walker} westLabels={1 - ease(m, [8, 20], [0, 1])} />
        </div>
        {/* 端末UIの名残（上端・下端に貼りついたままフェードアウト） */}
        {phoneUiO > 0 && (
          <>
            <div style={{ position: 'absolute', left: left, top: top, width: SCREEN_W, height: 160, transformOrigin: '0 0', transform: `scale(${S})`, opacity: phoneUiO }}>
              <StatusBar />
              <MapPhoneUI />
            </div>
            <div style={{ position: 'absolute', left: left + (clipW - SCREEN_W * S) / 2, top: 1080 - bottom - TAB_H * S, width: SCREEN_W, height: TAB_H, transformOrigin: '0 0', transform: `scale(${S})`, opacity: phoneUiO }}>
              <TabBar from="map" />
            </div>
          </>
        )}
        <div style={{
          position: 'absolute', left: left + clipW / 2 - 61 * S, top: top + 11 * S, width: 122 * S, height: 36 * S, borderRadius: 18 * S,
          background: '#000', opacity: bezelO,
        }} />
      </div>

      {/* 検索バー */}
      <div style={{
        position: 'absolute', left: 110, top: 92, width: 700, height: 80, borderRadius: 40, background: '#fff',
        boxShadow: '0 20px 44px -22px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.05)',
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 30px', boxSizing: 'border-box',
        opacity: ease(m, [22, 28], [0, 1]), transform: `translateY(${(1 - searchP) * -30}px)`,
      }}>
        <Icon name="search" size={30} color={C.tx} sw={2.2} />
        <div style={{ flex: 1, fontSize: 32, fontWeight: 700, color: typed ? C.txH : C.txD, display: 'flex', alignItems: 'center' }}>
          {typed || 'スポットを検索...'}
          {m < 52 && <span style={{ width: 3, height: 36, marginLeft: 3, background: C.accent, opacity: Math.floor(m / 6) % 2 ? 1 : 0.15 }} />}
        </div>
        <div style={{
          padding: '10px 20px', borderRadius: 24, background: C.accent, color: '#fff', fontSize: 22, fontWeight: 800,
          display: 'flex', alignItems: 'center', gap: 8, opacity: ease(m, [44, 50], [0, 1]), transform: `scale(${0.8 + 0.2 * ease(m, [44, 52], [0, 1])})`,
        }}>
          <Icon name="navigation" size={18} color="#fff" sw={2.4} /> ナビ
        </div>
      </div>

      {/* 見出しパネル */}
      <div style={{
        position: 'absolute', left: 110, top: 214, width: 700, padding: '44px 48px 48px', boxSizing: 'border-box', borderRadius: 40,
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)',
        boxShadow: '0 40px 80px -40px rgba(14,32,48,0.45), 0 0 0 1px rgba(14,32,48,0.05)',
        opacity: ease(m, [24, 32], [0, 1]), transform: `translateX(${(1 - panelP) * -80}px)`,
      }}>
        <ChapterLabel num="05" label="CAMPUS NAVI" f={m} d={26} />
        <div style={{ marginTop: 24 }}>
          <Headline lines={[[{ t: 'キャンパスで、' }], [{ t: 'もう' }, { t: '迷わない', grad: true }, { t: '。' }]]} f={m} d={28} size={86} />
        </div>
        <div style={{ marginTop: 26 }}>
          <SubCopy text={'建物や教室を検索して、\nマップ上でそのままナビ。'} f={m} d={38} size={29} />
        </div>
      </div>

      {/* 到着予測カード */}
      <div style={{
        position: 'absolute', left: 1468, top: 590, width: 400, padding: '24px 28px', boxSizing: 'border-box', borderRadius: 28,
        background: '#fff', boxShadow: '0 34px 70px -30px rgba(14,32,48,0.5), 0 0 0 1px rgba(14,32,48,0.05)',
        opacity: ease(m, [82, 88], [0, 1]), transform: `translateY(${(1 - etaP) * 30}px) scale(${0.85 + 0.15 * etaP})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: alpha(C.accent, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pin" size={26} color={C.accentDeep} sw={2.2} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: C.txH }}>南3号館</div>
          <div style={{ padding: '2px 10px', borderRadius: 8, background: C.bg3, color: C.tx, fontSize: 17, fontWeight: 800 }}>S3</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.tx }}>徒歩</span>
          <span style={{ fontSize: 44, fontWeight: 900, color: '#1a8ef0', letterSpacing: '-0.02em' }}>6</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.tx }}>分 ・ 約450m</span>
        </div>
        <div style={{ fontSize: 17, color: C.txD, marginTop: 6 }}>次の授業：計算機科学実験第一 13:30〜</div>
      </div>
    </AbsoluteFill>
  );
};

