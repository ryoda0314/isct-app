import { toXY } from "./campus3dFeatures.js";
import { streetFrame } from "./campus3dStreetLayout.js";
import { PHOTO_VIEWS, MONUMENT_VIEWS } from "./campus3dPhotoViews.js";

// Portrait frames from the two walks. Positions are measured relative to a shop,
// with height above its threshold. Angles in degrees use the filmed optical axis.
const shots = [
  ["square", "駅前広場", "shibata", 1546, 12, -0.837, -19.518, 1.48, 17.483, 72.809, 4.415, 97.692],
  ["market", "神尾歯科前の通り", "kamio", 1546, 105, 5.058, -3.576, 1.57, -78.666, 93.008, 1.058, 97.571],
  ["coffee", "カルディ", "kaldi", 1549, 113, 3.576, -3.438, 1.57, -22.851, 98.234, 2.09, 97.799],
  ["kebab", "ケバブの注文窓口", "basanta", 1549, 105, 0.54, -3.146, 1.57, -20.689, 95.064, 3.429, 97.896],
  ["ohsho", "餃子の王将前", "ohsho", 1549, 73, -2.327, -2.997, 1.57, 71.843, 89.523, -1.509, 97.715],
  ["curry", "CoCo壱番屋", "cocoichi", 1546, 153, 1.791, -3.9, 1.57, -18.264, 92.247, -0.652, 98.01],
  ["pharmacy", "ココカラファイン", "coco", 1546, 193, 2.169, -4.369, 1.57, 23.606, 108.948, -5.876, 97.938],
  ["north", "北側のファミリーマート", "familynorth", 1546, 217, 4.552, -2.855, 1.57, -49.016, 95.34, 2.929, 97.896]
];
export const STREET_VIEWS = shots.map(
  ([id, label, shop, clip, seconds, x, y, eye, heading, pitch, roll, fov]) => ({
    id,
    label,
    shop,
    clip,
    seconds,
    x,
    y,
    eye,
    heading,
    pitch,
    roll,
    fov
  })
);
export function linkedStreetView(search) {
  const params = new URLSearchParams(search);
  return PHOTO_VIEWS.find(v => String(v.number) === params.get("photo")) ||
    MONUMENT_VIEWS.find(v => v.id === params.get("landmark")) ||
    STREET_VIEWS.find(v => v.id === params.get("streetView"));
}
export function streetViewSpawn(view, features) {
  if (!view || !features) return null;
  if (view.coord) {
    if (!features.some(f => f.id === (view.landmark ? "tsz-pedestal" : "ave-main-n-arch"))) return null;
    const [x, y] = toXY(view.coord);
    return {
      viewId: view.id, x, y, yaw: view.heading, pitch: view.pitch, roll: -view.roll,
      fov: view.fov, eye: view.eye, datum: view.coord, campus: true
    };
  }
  for (const f of features) {
    const front = f.shopfronts?.find((q) => q.shop === view.shop && !q.returnWall);
    if (!front) continue;
    const frame = streetFrame(front, toXY);
    if (!frame) return null;
    const [x, y] = frame.point(view.x, view.y);
    return {
      viewId: view.id,
      x,
      y,
      yaw: (360 + view.heading - (frame.angle * 180) / Math.PI) % 360,
      pitch: view.pitch,
      roll: -view.roll,
      fov: view.fov,
      eye: view.eye,
      datum: f.groundRef || f.coords[0]
    };
  }
  return null;
}

export function streetViewEye(shot, floor, groundAt, fallback) {
  if (!shot?.datum) return fallback;
  const datum = groundAt(shot.datum);
  return Number.isFinite(datum) ? Math.max(0.8, Math.min(2.5, datum + shot.eye - floor)) : fallback;
}
