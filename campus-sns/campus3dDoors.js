// 自動ドア（2026-11-09、ユーザー「自動ドアにしてほしい」）：buildMesh が集めた扉の口（doors）に、ガラスの引き戸の板（枠とガラス）を
// 開き具合（open：0 閉じ 〜 1 開き）ごとに作る。歩く人が DOOR_TRIGGER m まで近づくと開き、離れると閉じる（CampusMap3D の walkTick が
// stepDoors で開き具合を進め、campus3dLayer の createDoorsLayer が戸板を描く）。室内の開き戸は戸板と同じ位置に歩行の当たりを持つ。
// 扉の口 door：{ a, b（口の両端。平面 m）, z0, z1（板の下・上の標高）, n（壁の外向き [x, y]）, off（板を置く面の、壁の線からの出 m）,
//   kind（"bi" 両引き / "single" 片引き / "swing" ガラスの両開き / "room" 室内の開き戸）, side（あれば、口の両わきの side m ははめ殺しのガラス。
//   板はまん中だけで、開くとはめ殺しの裏（off の側）へ引く） }
import { Mesh, addLogo } from "./campus3dMesh.js";
import { textCells } from "./campus3dSignText.js";

export const DOOR_TRIGGER = 2.5; // この距離（水平 m）まで近づくと開く
const OPEN_S = 0.6; // 開くのにかかる秒
const CLOSE_S = 1.2; // 閉じるのにかかる秒
const STILE = 0.055; // 板の枠の幅
const LEAF_T = 0.04; // 板の厚さ
const ROOM_PAIR_WIDTH = 1.5;
const ROOM_PAINT = [0.82, 0.83, 0.79, 1], GLAZING_BEAD = [0.40, 0.43, 0.42, 1], LEVER = [0.59, 0.61, 0.60, 1];
export const DOOR_FRAME = [0.74, 0.76, 0.78, 1]; // 枠（アルミ）
const SWING_FRAME = [0.72, 0.69, 0.64, 0.5], PULL = [0.87, 0.86, 0.82, 0.5];
const PATINATED_BRONZE = [.20,.18,.15,.5], BRASS = [.73,.63,.42,.5];
export const DOOR_GLASS = [0.8, 0.88, 0.92, 1]; // ガラス（レイヤーで半透明に重ねる）
const STORE_STRIPES = [[1.005, [.78,.18,.13,1]], [1.035, [.12,.46,.29,1]], [1.065, [.93,.54,.12,1]]];

// 開き具合を dt 秒すすめる。who（歩く人の足もと { x, y, z }。歩いていなければ null）の近くの扉は開く。動いている扉があれば true
export function stepDoors(doors, open, who, dt) {
  let moving = false;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  doors.forEach((d, i) => {
    const cx = (d.a[0] + d.b[0]) / 2;
    const cy = (d.a[1] + d.b[1]) / 2;
    // 改札の羽（gate。campus3dInteract）：近づいても開かない。カードをかざした（until まで）あいだと、かざしたあとで通り道の中に人がいるあいだだけ開く
    let near = d.gate
      ? (d.until || 0) > now || (!!who && (d.until || 0) > now - 8000 && Math.hypot(who.x - cx, who.y - cy) < 0.9 && Math.abs(who.z - d.gate.zf) < 0.8)
      : !!who && Math.hypot(who.x - cx, who.y - cy) < DOOR_TRIGGER && who.z > d.z0 - 1.5 && who.z < d.z1;
    if (near && d.kind === "room") {
      const along = (who.x - cx) * d.n[1] - (who.y - cy) * d.n[0];
      near = Math.abs(along) < d.width / 2 + .30;
    }
    const target = near ? 1 : 0;
    const v = open[i] || 0;
    if (Math.abs(target - v) < 1e-4) {
      open[i] = target;
      return;
    }
    moving = true;
    open[i] = target > v ? Math.min(1, v + dt / OPEN_S) : Math.max(0, v - dt / CLOSE_S);
  });
  return moving;
}

// 開き具合のなめらかな動き（はじめと終わりがゆっくり）
const ease = (t) => t * t * (3 - 2 * t);

// 蝶番を中心とする同じ回転を描画と歩行に使う。開いた戸板の横を両側から通れる。
function roomPanels(width, open, visit) {
  const angle = ease(open) * Math.PI / 2;
  if (width < ROOM_PAIR_WIDTH) return visit(.016, width - .016, 0, angle);
  return visit(.016, width / 2 - .004, 0, angle) ||
    visit(width / 2 + .004, width - .016, width, -angle);
}

export function roomDoorBlocked(doors, open, x, y, z) {
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (d.kind !== "room" || z + 1.55 <= d.z0 || z >= d.z1) continue;
    const dx = x - d.a[0], dy = y - d.a[1], radius = .30 + LEAF_T / 2;
    if (Math.abs(dx) > d.width + radius || Math.abs(dy) > d.width + radius) continue;
    const along = dx * d.n[1] - dy * d.n[0], across = dx * d.n[0] + dy * d.n[1];
    if (roomPanels(d.width, open[i] || 0, (s0, s1, hinge, angle) => {
      const cos = Math.cos(angle), sin = Math.sin(angle), h = along - hinge;
      const s = hinge + h * cos + across * sin;
      const end = Math.max(s0 - s, 0, s - s1), normal = across * cos - h * sin;
      return end * end + normal * normal < radius * radius;
    })) return true;
  }
  return false;
}

// 中庭に面する白い巻き上げ戸。つばめの絵も戸板と一緒に巻き取られる。
function addShutter(m, door, at, width, open) {
  if (open >= 1) return;
  const n = [...door.n, 0], h = door.z1 - door.z0, visible = 1 - open;
  const z = y => door.z0 + (y + open) * h;
  const band = (left, right, lo, hi, depth, color) => m.quad([
    [at(left * width, depth), z(lo)], [at(right * width, depth), z(lo)],
    [at(right * width, depth), z(hi)], [at(left * width, depth), z(hi)],
  ], n, color);
  band(0, 1, 0, visible, 0, [0.91, 0.90, 0.85, 1]);
  for (let y = 0.075; y < visible; y += 0.075) band(0, 1, y, Math.min(y + 0.002, visible), 0.002, [0.77, 0.76, 0.72, 1]);
  band(0, 1, 0, Math.min(0.018, visible), 0.003, DOOR_FRAME);
  if (door.motif !== "swallow") return;
  // 各高さで輪郭の左右を結ぶ。戸箱にかかる一番上の帯は、その高さで切る。
  const plumage = [
    [[0.32,0.18,0.18], [0.43,0.20,0.27], [0.59,0.20,0.32], [0.64,0.20,0.50], [0.73,0.45,0.50]],
    [[0.19,0.35,0.35], [0.33,0.41,0.46], [0.43,0.45,0.50], [0.60,0.46,0.50], [0.77,0.46,0.50], [0.86,0.50,0.50]],
  ];
  for (const contour of plumage) for (let i = 1; i < contour.length; i++) {
    const [lo, l0, r0] = contour[i - 1], [hi, l1, r1] = contour[i];
    if (lo >= visible) break;
    const end = Math.min(hi, visible), t = (end - lo) / (hi - lo);
    for (const flip of [false, true]) {
      const p = (x, y) => [at((flip ? 1 - x : x) * width, 0.006), z(y)];
      m.quad([p(l0,lo), p(r0,lo), p(r0 + (r1 - r0) * t,end), p(l0 + (l1 - l0) * t,end)], n, [0.25,0.25,0.24,1]);
    }
  }
}

// 扉の板：{ solid（枠）, glass（ガラス） }（Mesh の result）
export function doorLeaves(doors, open) {
  const solid = new Mesh();
  const glass = new Mesh();
  doors.forEach((d, i) => {
    const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    if (L < 0.2) return;
    const u = [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L];
    const n = d.n;
    let off = d.off ?? 0.05; // はめ殺しを描くあいだだけ壁の線の側へずらす
    const f = ease(Math.min(1, Math.max(0, open[i] || 0)));
    // 板（s0〜s1。辺の上の a からの長さ）を、面から off 出したところに
    const at = (s, dd) => [d.a[0] + u[0] * s + n[0] * (off + dd), d.a[1] + u[1] * s + n[1] * (off + dd)];
    if (d.gate?.card === "ic") {
      // Padded wings fold alongside their own cabinet when the reader releases the lane.
      const cos = Math.cos(f*Math.PI/2), sin = Math.sin(f*Math.PI/2);
      const face = [.29,.22,.28,.5], rim = [.16,.14,.17,.5];
      for (const side of [-1,1]) {
        const hinge = side === 1 ? 0 : L;
        const p = (s,t,z) => [at(hinge+side*(s*cos-t*sin),s*sin+t*cos),d.z0+z];
        const tip = L*.5-.013, h=d.z1-d.z0;
        const outline = [[.004,.065],[tip-.034,.095],[tip,.13],[tip,h-.16],[tip-.058,h-.095],[.004,h-.048]];
        const skin = depth => outline.map(([s,z]) => p(s,depth,z));
        const a=skin(-.024), b=skin(.024);
        const normal=[n[0]*cos-side*u[0]*sin,n[1]*cos-side*u[1]*sin,0];
        for (const [ring,dir] of [[a,-1],[b,1]]) {
          for (const ids of [[0,1,2,3],[0,3,4,5]]) solid.quad(ids.map(j=>ring[j]),normal.map(v=>v*dir),face);
        }
        for (let j=0;j<a.length;j++) {
          const k=(j+1)%a.length;
          solid.quad([a[j],a[k],b[k],b[j]],null,rim);
        }
      }
      return;
    }
    if (d.kind === "shutter") {
      addShutter(solid, d, at, L, f);
      return;
    }
    const leaf = (s0, s1, hinge = s0, angle = 0) => {
      const z0 = d.z0, z1 = d.z1;
      const pivot = at(hinge, 0), cos = Math.cos(angle), sin = Math.sin(angle);
      const along = [u[0] * cos + n[0] * sin, u[1] * cos + n[1] * sin];
      const normal = [n[0] * cos - u[0] * sin, n[1] * cos - u[1] * sin];
      const point = (s, depth) => [pivot[0] + along[0] * (s - hinge) + normal[0] * depth, pivot[1] + along[1] * (s - hinge) + normal[1] * depth];
      // 枠：両わきの縦の枠・上と下の横の枠（厚さ LEAF_T の角材）
      const diagonal = d.hardware === "bronzeDiagonal";
      const frame = diagonal ? PATINATED_BRONZE : d.kind === "swing" || d.pull === "vertical" ? SWING_FRAME : DOOR_FRAME;
      const beam = (sa, sb, za, zb, depth = 0, thick = LEAF_T, color = frame) => {
        const p = [point(sa, depth - thick / 2), point(sb, depth - thick / 2), point(sb, depth + thick / 2), point(sa, depth + thick / 2)];
        solid.quad([[p[3], za], [p[2], za], [p[2], zb], [p[3], zb]], [...normal, 0], color);
        solid.quad([[p[1], za], [p[0], za], [p[0], zb], [p[1], zb]], [-normal[0], -normal[1], 0], color);
        solid.quad([[p[0], zb], [p[1], zb], [p[2], zb], [p[3], zb]], [0, 0, 1], color);
        solid.quad([[p[0], za], [p[3], za], [p[2], za], [p[1], za]], [0, 0, -1], color);
        solid.quad([[p[0], za], [p[3], za], [p[3], zb], [p[0], zb]], [-along[0], -along[1], 0], color);
        solid.quad([[p[2], za], [p[1], za], [p[1], zb], [p[2], zb]], [...along, 0], color);
      };
      if (diagonal) {
        const left = hinge <= s0, foot = left ? s0+.22 : s1-.22, head = left ? s1-.14 : s0+.14;
        const middle = (s0+s1)/2, ivory=[.87,.85,.78,.5];
        for(const side of [-1,1]) {
          const pt=(s,z,extra=0)=>[point(s,side*(.075+extra)),z0+z];
          for(const depth of [0,.022]) solid.quad([pt(foot-.012,.12,depth),pt(foot+.012,.12,depth),pt(head+.012,1.15,depth),pt(head-.012,1.15,depth)],
            [side*normal[0],side*normal[1],0],BRASS);
          solid.quad([pt(foot-.012,.12),pt(head-.012,1.15),pt(head-.012,1.15,.022),pt(foot-.012,.12,.022)],null,BRASS);
        }
        for(const [s,h] of [[foot,.12],[head,1.15]]) beam(s-.019,s+.019,z0+h-.018,z0+h+.018,0,.18,BRASS);
        // 白い校章標示と文字帯をそれぞれのガラス戸に固定する。
        for(const s of [middle-.083,middle+.070]) beam(s,s+.013,z0+1.13,z0+1.32,0,.007,ivory);
        for(const h of [1.13,1.307]) beam(middle-.083,middle+.083,z0+h,z0+h+.013,0,.007,ivory);
        beam(middle-.043,middle+.043,z0+1.255,z0+1.271,0,.009,ivory);
        beam(middle-.011,middle+.011,z0+1.165,z0+1.257,0,.009,ivory);
        beam(middle-.14,middle+.14,z0+1.075,z0+1.086,0,.009,ivory);
        beam(s0,s1,z0,z0+.12,0,LEAF_T,frame);
      } else if (d.classroom) {
        const grip = hinge <= s0 ? s1-.082 : s0+.082, bronze = [.32,.31,.28,.5];
        for (const z of [.86,1.17]) beam(grip-.013,grip+.013,z0+z-.013,z0+z+.013,0,.145,bronze);
        for (const side of [-1,1]) beam(grip-.014,grip+.014,z0+.85,z0+1.18,side*.073,.028,bronze);
        if (hinge === 0) {
          const middle = (s0+s1)/2, outside = d.outside, signWidth = .39;
          const ink = [.96,.96,.90,.5];
          const plaque = (x,y,w,h,depth,color) => {
            const pt = (x,h) => [point(middle-outside*x,outside*depth),z0+h];
            solid.quad([pt(x,y),pt(x+w,y),pt(x+w,y+h),pt(x,y+h)],[normal[0]*outside,normal[1]*outside,0],color);
          };
          plaque(-signWidth/2,1.40,signWidth,.17,.008,ink);
          plaque(-signWidth/2+.007,1.432,signWidth-.014,.13,.010,[.13,.24,.39,.5]);
          const label = textCells(d.classroom,.083);
          if (label) for (const [x,y,w,h] of label.rects) plaque(x-label.w/2,1.458+y,w,h,.012,ink);
        }
      } else if (d.pull === "vertical") {
        const grip = s1-.10;
        for (const h of [.82,1.26]) beam(grip-.011,grip+.011,z0+h-.011,z0+h+.011,0,.153,PULL);
        for (const side of [-1,1]) beam(grip-.014,grip+.014,z0+.76,z0+1.32,side*.078,.028,PULL);
        beam(s0,s1,z0,z0+.14,0,LEAF_T,frame);
        beam(s0+.22,s0+.53,z0+1.38,z0+1.52,0,.006,[.94,.93,.88,.5]);
      } else if (d.kind === "room") {
        const latchAtEnd = hinge <= s0;
        const handle = latchAtEnd ? s1 - .087 : s0 + .087;
        const window = latchAtEnd ? s1 - .21 : s0 + .21;
        const half = d.timber ? .092 : .057;
        const l = window - half, r = window + half, bottom = z0 + (d.timber ? 1.46 : 1.13), top = d.timber ? bottom + 2*half : z1 - .20;
        const paint = d.timber ? [.46,.31,.21,.50] : ROOM_PAINT;
        const panel = (a, b, lo, hi) => beam(a, b, lo, hi, 0, LEAF_T, paint);
        if (!d.glazed) {
          panel(s0, l, z0, z1);
          panel(r, s1, z0, z1);
          panel(l, r, z0, bottom);
          panel(l, r, top, z1);
        }
        for (const side of [-1, 1]) {
          const face = (a, b, lo, hi, depth, color) => solid.quad([
            [point(a, side * depth), lo], [point(b, side * depth), lo],
            [point(b, side * depth), hi], [point(a, side * depth), hi],
          ], [side * normal[0], side * normal[1], 0], color);
          if (!d.glazed) {
            face(l - .009, l + .005, bottom - .009, top + .009, .021, GLAZING_BEAD);
            face(r - .005, r + .009, bottom - .009, top + .009, .021, GLAZING_BEAD);
            face(l, r, bottom - .009, bottom + .005, .021, GLAZING_BEAD);
            face(l, r, top - .005, top + .009, .021, GLAZING_BEAD);
          }
          face(handle - .023, handle + .023, z0 + .92, z0 + 1.06, .022, LEVER);
          beam(handle - .012, handle + .012, z0 + .991, z0 + 1.014, side * .038, .036, LEVER);
          const tip = handle + (latchAtEnd ? -.105 : .105);
          beam(Math.min(handle, tip) - .01, Math.max(handle, tip) + .01, z0 + .99, z0 + 1.014, side * .067, .027, LEVER);
        }
        if (!d.glazed) {
          glass.quad([[point(l, 0), bottom], [point(r, 0), bottom], [point(r, 0), top], [point(l, 0), top]], [...normal, 0], DOOR_GLASS);
          return;
        }
        beam(s0 + STILE, s1 - STILE, z0 + .975, z0 + 1.025);
      }
      const A = point(s0 + STILE, 0), B = point(s1 - STILE, 0);
      if (diagonal) {
        // 青銅の枠に収まるガラス。両面の反射は下の暗い色から上の空の色へ。
        const low = [.12,.14,.13,1], high = [.37,.40,.39,1];
        for (const side of [-1,1]) {
          const a=point(s0+STILE,side*.005), b=point(s1-STILE,side*.005);
          glass.quadColors([[a,z0+.12],[b,z0+.12],[b,z1-STILE],[a,z1-STILE]],
            [normal[0]*side,normal[1]*side,0],[low,low,high,high]);
        }
      } else glass.quad([[A, z0 + STILE], [B, z0 + STILE], [B, z1 - STILE], [A, z1 - STILE]], [...normal, 0], DOOR_GLASS);
      beam(s0, s0 + STILE, z0, z1);
      beam(s1 - STILE, s1, z0, z1);
      beam(s0 + STILE, s1 - STILE, z0, z0 + STILE * 1.6);
      beam(s0 + STILE, s1 - STILE, z1 - STILE, z1);
      if (d.motif === "storeStripe" && s1 - s0 > 2*STILE + .16) {
        const left = s0 + STILE, right = s1 - STILE, middle = (left + right) / 2;
        const count = Math.max(1, Math.round((right - left) / .34));
        // 戸に貼った帯と注意マークは、引き戸に沿って一緒に動く。
        for (const side of [-1, 1]) {
          const print = (corners, depth, color) => solid.quad(
            corners.map(([x,h]) => [point(x, side*depth), z0+h]), [side*normal[0], side*normal[1], 0], color);
          print([[left,.99],[right,.99],[right,1.11],[left,1.11]], .004, [.92,.92,.86,1]);
          for (let i = 0; i < count; i++) {
            const x = left + (i+.5)*(right-left)/count - .049;
            for (const [h,color] of STORE_STRIPES) {
              print([[x,h],[x+.075,h+.017],[x+.087,h+.034],[x+.012,h+.018]], .008, color);
            }
          }
          print([[middle-.063,1.22],[middle+.063,1.22],[middle+.009,1.33],[middle-.009,1.33]], .007, [.94,.68,.21,1]);
          print([[middle-.007,1.246],[middle+.007,1.246],[middle+.006,1.298],[middle-.006,1.298]], .009, [.22,.22,.21,1]);
          if (d.kind === "single") {
            const size = Math.min(.63, s1-s0-.14);
            const plane = {
              P: (x,h,depth) => [point(x,side*depth),z0+h],
              U: [...along,0], V: [0,0,1], N: [side*normal[0],side*normal[1],0],
            };
            addLogo(solid, plane, [middle-size/2,1.46,size,"sevenGlass"]);
          }
        }
      }
      if (d.kind === "swing") {
        const pull = hinge === s0 ? s1 - STILE - 0.035 : s0 + STILE + 0.035;
        beam(pull - 0.012, pull + 0.012, z0 + 0.15, z0 + 0.18, 0, 0.15);
        beam(pull - 0.012, pull + 0.012, z1 - 0.18, z1 - 0.15, 0, 0.15);
        for (const depth of [-0.075, 0.075]) beam(pull - 0.014, pull + 0.014, z0 + 0.09, z1 - 0.09, depth, 0.028, PULL);
      }
    };
    if (d.kind === "room") {
      roomPanels(L, Math.min(1, Math.max(0, open[i] || 0)), leaf);
      return;
    }
    if (d.kind === "swing") {
      const angle = f * Math.PI / 2;
      leaf(0, L / 2, 0, angle);
      leaf(L / 2, L, L, -angle);
      return;
    }
    // はめ殺し（side）：板より外（壁の線の側）に、板と同じ枠とガラス。板はその裏を通る
    const sd = Math.min(Math.max(0, d.side || 0), L / 3);
    if (sd > 0) {
      const fixed = (s0, s1) => {
        const keep = off;
        off = keep + LEAF_T + 0.012;
        leaf(s0, s1);
        off = keep;
      };
      fixed(0, sd);
      fixed(L - sd, L);
    }
    const o0 = sd, Lo = L - 2 * sd;
    if (d.kind === "single") {
      const sh = f * Lo;
      leaf(o0 - sh, o0 + Lo - sh);
    } else {
      const sh = (f * Lo) / 2;
      leaf(o0 - sh, o0 + Lo / 2 - sh);
      leaf(o0 + Lo / 2 + sh, o0 + Lo + sh);
    }
  });
  return { solid: solid.result(), glass: glass.result() };
}

// 開閉中はその戸を含む組の頂点だけを作り直し、ほかの組の GPU バッファを使い続ける。
export function doorBatches(doors, open, previous = []) {
  const batches = [];
  for (let i = 0; i < doors.length; i += 24) {
    const state = open.slice(i, i + 24), old = previous?.[batches.length];
    batches.push(old && state.length === old.state.length && state.every((v, j) => v === old.state[j])
      ? old : { ...doorLeaves(doors.slice(i, i + 24), state), state });
  }
  return batches;
}
