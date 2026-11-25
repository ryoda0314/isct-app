import assert from "node:assert/strict";
import test from "node:test";
import { stepWalkView, WALK_FOV } from "../campus-sns/campus3dWalk.js";
import { moonFromEye } from "../campus-sns/campus3dMoonSurface.js";
import { rayDir, skyEye } from "../campus-sns/campus3dSkyLayer.js";
import { PER_M } from "../campus-sns/campus3dLayer.js";
import { toXY } from "../campus-sns/campus3dFeatures.js";
import { SUN_SITE } from "../campus-sns/campus3dSky.js";

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const newGait = () => ({ bobPhase: 0, bobAmp: 0 });
const still = { height: 0, yaw: 0, pitch: 0 };

test("actual steps move the view; stopping at a wall settles to the original aim", () => {
  const w = newGait(), angles = [];
  for (let i = 0; i < 120; i++) angles.push(stepWalkView(w,4.3/60,1/60,WALK_FOV));
  const pitch = Math.max(...angles.map(a => Math.abs(a.pitch)));
  const yaw = Math.max(...angles.map(a => Math.abs(a.yaw)));
  assert.ok(pitch > 0.15 && pitch <= 0.16);
  assert.ok(yaw > 0.09 && yaw <= 0.10);
  let stopped;
  for (let i = 0; i < 60; i++) stopped = stepWalkView(w,0,1/60,WALK_FOV);
  assert.equal(Math.abs(stopped.pitch) + Math.abs(stopped.yaw) + Math.abs(stopped.height), 0);
  assert.deepEqual(stepWalkView(w,4.3/60,1/60,WALK_FOV,true),still);
});

test("gait follows the same cadence at different frame rates and stabilizes the telephoto image", () => {
  function advance(rate, fov) {
    const w = newGait();
    let offset;
    for (let i = 0; i < rate; i++) offset = stepWalkView(w,4.3/rate,1/rate,fov);
    return offset;
  }
  const wide = advance(60,WALK_FOV), slow = advance(20,WALK_FOV), lens = advance(60,1.65);
  near(slow.yaw,wide.yaw,1e-10);
  near(slow.pitch,wide.pitch,1e-10);
  assert.ok(Math.abs(lens.pitch) < Math.abs(wide.pitch)*0.04);
  near(lens.height,wide.height,1e-12);
});

// Inverse pinhole projection looking north, local east goes to screen right.
// Moving the eye translates every unprojected point by eye * homogeneous w.
function inverseView([east,north,height]) {
  const e = PER_M.e, n = PER_M.n;
  const pos = [east*e[0]+north*n[0],east*e[1]+north*n[1],height];
  return [e[0],e[1],0,0, 0,0,1,0, ...pos.map(a => -a),-1, n[0]+2*pos[0],n[1]+2*pos[1],2*pos[2],2];
}
test("camera translation moves the atmospheric observer but leaves a celestial ray parallel", () => {
  const first = inverseView([15,50,43]), next = inverseView([115,-10,84]);
  const eye = skyEye(next);
  [115,-10,84].forEach((v,i) => near(eye[i],v,1e-8));
  const d = rayDir(first,0.24,0.4), after = rayDir(next,0.24,0.4);
  after.forEach((v,i) => near(v,d[i],1e-11));
});

test("a 100 m move gives the Moon its real sub-arcsecond parallax", () => {
  const site = [...toXY([SUN_SITE.lng,SUN_SITE.lat]),40];
  const m = { dir: [0,1,0], dist: 384400, radius: Math.asin(1737.4/384400) };
  const atSite = moonFromEye(m,site), east = moonFromEye(m,[site[0]+100,site[1],40]);
  assert.deepEqual(atSite.dir,m.dir);
  const arcsec = Math.atan2(-east.dir[0],east.dir[1])*180/Math.PI*3600;
  near(arcsec,0.05366,0.0001);
  assert.ok(moonFromEye(m,[site[0],site[1]+100,40]).radius > atSite.radius);
});
