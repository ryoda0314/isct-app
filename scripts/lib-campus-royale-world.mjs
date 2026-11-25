// キャンパスロワイヤルの生成・テスト用：アプリと同じ作り方で「歩ける世界」（campus3dWalk の walkWorld）を Node で組む。
// 標高は public/map-dem/15 のタイル、構造物は public/map-3d/features.json（読むだけ）、地図の建物は campusBasemapData.js。
// CampusMap3D.jsx の流れ（坂の焼き込み → 橋・階段の床 → 置きかえた建物 → 通り抜けの切り欠き → walkWorld）をなぞる。街灯の柱は入れない。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { cutPassages } from "../campus-sns/campus3dBuildings.js";
import { buildingRoof, burnsGround, detailView, parseFeatures, prepareBridge, replacedBuildings, stairsPath, toXY } from "../campus-sns/campus3dFeatures.js";
import { walkWorld } from "../campus-sns/campus3dWalk.js";
import { BASEMAP } from "../campus-sns/campusBasemapData.js";
import { dem } from "../campus-sns/campusDem.js";
import { buildingHeight, regionOf } from "../campus-sns/campusMap3d.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadDem() {
  const base = path.join(ROOT, "public", "map-dem", "15");
  for (const x of fs.readdirSync(base)) {
    for (const file of fs.readdirSync(path.join(base, x))) {
      if (!file.endsWith(".png")) continue;
      const { data, info } = await sharp(path.join(base, x, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const z = new Float32Array(info.width * info.height);
      for (let i = 0; i < z.length; i++) {
        const j = i * info.channels;
        z[i] = data[j] * 256 + data[j + 1] + data[j + 2] / 256 - 32768;
      }
      dem.tiles.set(`${x}/${file.replace(".png", "")}`, z);
    }
  }
}

let cached = null;
/**
 * @returns { world, view（歩く世界に入れた構造物）, features（全部）, groundAt, dem, sha（features.json の中身の短い印） }
 */
export async function buildCampusWorld({ log = () => {} } = {}) {
  if (cached) return cached;
  const t0 = Date.now();
  await loadDem();
  const text = fs.readFileSync(path.join(ROOT, "public", "map-3d", "features.json"), "utf8");
  const features = parseFeatures(JSON.parse(text));
  // バーチャルキャンパスのふだん（詳細モードは端末の設定。既定は切）と同じ：全部の階を入れ、詳細モードで隠すものは隠さない
  const view = detailView(features, { detail: false, level: "all" });
  dem.setBurns(view.filter(burnsGround));
  const groundAt = (ll) => dem.groundAt(ll);
  log(`features ${features.length} → view ${view.length}（${Date.now() - t0} ms）`);
  const bridges = view.filter((f) => f.type === "bridge").map((f) => prepareBridge(f, groundAt)).filter(Boolean);
  const decks = [...bridges.filter((b) => b.f.surface !== "rail"), ...dem.slopes.filter((sl) => sl.f.type === "stairs").map(stairsPath)];
  const data = BASEMAP;
  const heights0 = data.buildings.map(buildingHeight);
  const replaced = replacedBuildings(features, data.buildings);
  const cut = await cutPassages(data.buildings, heights0, view.filter((f) => f.type === "passage"), groundAt, replaced);
  const heights = heights0.map((h, i) => (replaced.has(i) ? buildingRoof(replaced.get(i)).hAt(toXY([data.buildings[i].c[1], data.buildings[i].c[0]])) : h));
  const R = regionOf(data);
  const [bx0, by0] = toXY([R.w, R.s]);
  const [bx1, by1] = toXY([R.e, R.n]);
  const world = walkWorld({
    data, features: view, surfaceAt: (ll) => dem.surfaceAt(ll), digs: dem.digs, cut, replaced, heights, decks, posts: [],
    bounds: [bx0 + 40, by0 + 40, bx1 - 40, by1 - 40], groundAt,
  });
  log(`walkWorld（${Date.now() - t0} ms）`);
  let h = 0;
  for (let i = 0; i < text.length; i += 97) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  cached = { world, view, features, groundAt, dem, sha: h.toString(16) };
  return cached;
}
