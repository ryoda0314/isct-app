import React, { useState } from "react";
import { T } from "../theme.js";
import { t } from "../i18n.js";
import { I } from "../icons.jsx";
import { Loader } from "../shared.jsx";
import { useMusic } from "../hooks/useMusic.js";
import { useMusicPlayer } from "../hooks/useMusicPlayer.js";

// ScienceTokyo Music — 管理者が配信した曲を全員が聴くプレイヤー。
// トップは「アプリのライブラリ」: アプリ識別ヘッダー + アルバム一覧 + 曲一覧。
// アルバムをタップすると大きなアートワークの「アルバム詳細」へ。
// （トップを大アートワークにすると "1枚のアルバム" に見えてしまうため、
//  大アートワークはアルバム詳細のみに使う。）
// 表示は全ユーザー共通（配信＝アップロードは管理者画面）。

const fmtTime = (s) => {
  if (!Number.isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// 再生中の曲に出す3本バーのイコライザ（純CSSアニメ）
function Equalizer() {
  return (<span className="mv-eq" aria-hidden="true"><span /><span /><span /></span>);
}

// カバー付きの角丸サムネ（無ければグラデ + 音符）
function Cover({ url, size, radius = 8, scale = 1 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: "hidden", position: "relative", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
      {url
        ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ transform: `scale(${scale})`, opacity: 0.9 }}>{I.music}</span>}
    </div>
  );
}

// 再生 / シャッフル ボタン（渡された tracks をキューとして再生）
function PlayActions({ tracks }) {
  const player = useMusicPlayer();
  if (!tracks.length) return null;
  const playAll = () => player.playTracks(tracks, tracks[0].id);
  const shufflePlay = () => {
    if (!player.shuffle) player.toggleShuffle();
    const start = tracks[Math.floor(Math.random() * tracks.length)];
    player.playTracks(tracks, start.id);
  };
  return (
    <div style={{ display: "flex", gap: 10, width: "100%" }}>
      <button onClick={playAll} className="mv-act" style={{ background: T.accent, color: "#fff" }}>
        <span style={{ display: "flex" }}>{I.play}</span>{t("music.play")}
      </button>
      <button onClick={shufflePlay} className="mv-act" style={{ background: T.bg3, color: T.txH }}>
        <span style={{ display: "flex", color: T.accent }}>{I.shuffle}</span>{t("music.shuffle")}
      </button>
    </div>
  );
}

// 曲リスト。tracks をそのままキューにして再生する。coverFallback はカバー未設定曲の代替（アルバムカバー）。
function TrackList({ tracks, coverFallback = null }) {
  const player = useMusicPlayer();
  const playFrom = (id) => player.playTracks(tracks, id);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {tracks.map((tk, i) => {
        const isCurrent = player.track?.id === tk.id;
        const playingNow = isCurrent && player.playing;
        const rowCover = tk.cover?.url || coverFallback || null;
        return (
          <button
            key={tk.id}
            onClick={() => (isCurrent ? player.toggle() : playFrom(tk.id))}
            className="mv-row"
            style={{ background: isCurrent ? T.bg3 : "transparent" }}
          >
            <div style={{ width: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: isCurrent ? T.accent : T.txD, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {playingNow ? <Equalizer /> : (isCurrent ? I.pause : <span className="mv-idx">{i + 1}</span>)}
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Cover url={rowCover} size={46} />
              <span className="mv-row-play" style={{ position: "absolute", inset: 0, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", color: "#fff" }}>{I.play}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: isCurrent ? T.accent : T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tk.title}</div>
              <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{tk.artist || "ScienceTokyo Music"}</div>
            </div>
            {tk.duration ? (
              <span style={{ fontSize: 12.5, color: T.txD, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtTime(tk.duration)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeading({ children }) {
  return <div style={{ fontSize: 16, fontWeight: 800, color: T.txH, letterSpacing: "-0.01em", margin: "22px 2px 10px" }}>{children}</div>;
}

export function MusicView({ mob = false }) {
  const { tracks, albums, loading } = useMusic();
  const [openId, setOpenId] = useState(null); // 開いているアルバムID。null=ライブラリ

  // 全員に配信された曲/アルバムのみ（誰が見ても同一）
  const publicTracks = tracks.filter((tk) => tk.is_public);
  const publicAlbums = albums.filter((a) => a.is_public);

  const albumIds = new Set(publicAlbums.map((a) => a.id));
  const albumOf = (a) => ({
    id: a.id,
    title: a.title,
    artist: a.artist,
    cover: a.cover?.url || null,
    tracks: publicTracks.filter((tk) => tk.album_id === a.id),
  });
  // アルバムに属さない曲（シングル）。アルバムが無ければ全曲がここに入る。
  const singleTracks = publicTracks.filter((tk) => !tk.album_id || !albumIds.has(tk.album_id));

  if (loading) return <Loader msg={t("common.loading")} />;

  // ── アルバム詳細 ──
  if (openId) {
    const a = publicAlbums.find((x) => x.id === openId);
    if (a) {
      const g = albumOf(a);
      return (
        <AlbumDetail
          mob={mob}
          onBack={() => setOpenId(null)}
          title={g.title}
          subtitle={`${g.artist || "ScienceTokyo Music"} · ${t("music.songCount", { n: g.tracks.length })}`}
          cover={g.cover}
          tracks={g.tracks}
        />
      );
    }
  }

  // ── ライブラリ（アプリのトップ）──
  const hasAlbums = publicAlbums.length > 0;
  const isEmpty = publicTracks.length === 0 && !hasAlbums;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: mob ? "16px 16px 120px" : "20px 24px 120px" }}>
      <style>{mvCss}</style>

      {/* アプリ識別ヘッダー（左寄せ・小アイコン＝“アプリ”であることを示す） */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 60, height: 60, borderRadius: 15, flexShrink: 0, background: `linear-gradient(145deg, ${T.accent}, ${T.accent}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: `0 8px 20px ${T.accent}44` }}>
          <span style={{ transform: "scale(1.5)", display: "flex" }}>{I.music}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: mob ? 22 : 25, fontWeight: 800, color: T.txH, letterSpacing: "-0.02em" }}>ScienceTokyo Music</div>
          <div style={{ fontSize: 13, color: T.txD, fontWeight: 600, marginTop: 2 }}>
            {t("music.songCount", { n: publicTracks.length })}
            {hasAlbums ? ` · ${t("music.albumCount", { n: publicAlbums.length })}` : ""}
          </div>
        </div>
      </div>

      {/* 全曲を対象にした再生 / シャッフル */}
      {publicTracks.length > 0 && (
        <div style={{ maxWidth: 420, marginTop: 16 }}>
          <PlayActions tracks={publicTracks} />
        </div>
      )}

      {isEmpty && (
        <div style={{ textAlign: "center", padding: "56px 20px", color: T.txD }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, opacity: 0.5 }}>{I.music}</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{t("music.emptyTitle")}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{t("music.emptyDesc")}</div>
        </div>
      )}

      {/* アルバム（横スクロールの棚） */}
      {hasAlbums && (
        <>
          <SectionHeading>{t("music.albumsTitle")}</SectionHeading>
          <div className="mv-shelf">
            {publicAlbums.map((a) => {
              const g = albumOf(a);
              return (
                <button key={a.id} onClick={() => setOpenId(a.id)} className="mv-card">
                  <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: `linear-gradient(145deg, ${T.accent}, ${T.accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,0.22)" }}>
                    {g.cover
                      ? <img src={g.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ transform: "scale(2.4)", opacity: 0.9 }}>{I.music}</span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: T.txH, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: T.txD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                    {g.artist || t("music.songCount", { n: g.tracks.length })}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 曲（シングル）。アルバムがあるときは見出しで区切る。 */}
      {singleTracks.length > 0 && (
        <div style={{ maxWidth: 720 }}>
          {hasAlbums && <SectionHeading>{t("music.singles")}</SectionHeading>}
          <div style={{ marginTop: hasAlbums ? 0 : 10, marginLeft: -6, marginRight: -6 }}>
            <TrackList tracks={singleTracks} />
          </div>
        </div>
      )}
    </div>
  );
}

// アルバム詳細（大アートワークのヒーロー + 曲リスト）
function AlbumDetail({ mob, onBack, title, subtitle, cover, tracks }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 120 }}>
      <style>{mvCss}</style>

      {onBack && (
        <div style={{ padding: mob ? "10px 8px 0" : "12px 12px 0" }}>
          <button onClick={onBack} className="mv-back" aria-label={t("music.back")}>
            <span style={{ display: "flex" }}>{I.back}</span>{t("music.back")}
          </button>
        </div>
      )}

      {/* ヒーロー */}
      <div style={{ position: "relative", overflow: "hidden", padding: mob ? "16px 16px 18px" : "20px 24px 22px" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          {cover
            ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(44px) saturate(1.3)", transform: "scale(1.4)", opacity: 0.5 }} />
            : <div style={{ width: "100%", height: "100%", background: `radial-gradient(120% 90% at 50% 0%, ${T.accent}55, transparent 70%)` }} />}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, ${T.bg}44, ${T.bg})` }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
          <div style={{ boxShadow: "0 18px 44px rgba(0,0,0,0.32)", borderRadius: 18 }}>
            <Cover url={cover} size={mob ? 168 : 190} radius={18} scale={3} />
          </div>
          <div style={{ fontSize: mob ? 21 : 24, fontWeight: 800, color: T.txH, marginTop: 16, letterSpacing: "-0.01em" }}>{title}</div>
          <div style={{ fontSize: 13, color: T.txD, marginTop: 4, fontWeight: 600 }}>{subtitle}</div>

          <div style={{ maxWidth: 340, width: "100%", marginTop: 18 }}>
            <PlayActions tracks={tracks} />
          </div>
        </div>
      </div>

      {/* 曲リスト */}
      <div style={{ padding: mob ? "4px 8px 0" : "6px 16px 0", maxWidth: 720, margin: "0 auto" }}>
        {tracks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: T.txD }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("music.emptyTitle")}</div>
          </div>
        ) : (
          <TrackList tracks={tracks} coverFallback={cover} />
        )}
      </div>
    </div>
  );
}

const mvCss = `
.mv-act {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: none; cursor: pointer; font-family: inherit; font-weight: 800;
  border-radius: 12px; padding: 12px 10px; font-size: 15px;
  transition: transform .12s ease, filter .12s ease;
}
.mv-act:hover { filter: brightness(1.05); }
.mv-act:active { transform: scale(0.97); }

.mv-back {
  display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent;
  color: ${T.accent}; font-family: inherit; font-weight: 700; font-size: 15px;
  cursor: pointer; padding: 6px 4px;
}

/* アルバム棚: 横スクロール。カードは固定幅。 */
.mv-shelf {
  display: flex; gap: 16px; overflow-x: auto; padding-bottom: 6px;
  scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch;
}
.mv-shelf::-webkit-scrollbar { height: 0; }
.mv-card {
  display: block; width: 150px; flex: 0 0 150px; scroll-snap-align: start;
  text-align: left; border: none; background: transparent;
  cursor: pointer; font-family: inherit; padding: 0;
  transition: transform .12s ease;
}
.mv-card:active { transform: scale(0.97); }
.mv-card:hover > div:first-child { filter: brightness(1.04); }

.mv-row {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 12px;
  cursor: pointer; text-align: left; font-family: inherit;
  transition: background .12s ease;
}
.mv-row:hover { background: ${T.bg3} !important; }
.mv-row-play { opacity: 0; transition: opacity .12s ease; }
.mv-row:hover .mv-row-play { opacity: 1; }
@media (hover: none) { .mv-row:hover .mv-row-play { opacity: 0; } }

.mv-eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
.mv-eq > span {
  width: 3px; border-radius: 2px; background: ${T.accent};
  animation: mv-eq 0.9s ease-in-out infinite;
}
.mv-eq > span:nth-child(1) { animation-delay: -0.2s; }
.mv-eq > span:nth-child(2) { animation-delay: -0.5s; }
.mv-eq > span:nth-child(3) { animation-delay: -0.35s; }
@keyframes mv-eq {
  0%, 100% { height: 4px; }
  50% { height: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .mv-eq > span { animation: none; height: 10px; }
}
`;
