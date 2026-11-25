import assert from "node:assert/strict";
import test from "node:test";
import { stepWalkView, SPEED, WALK_FOV } from "../campus-sns/campus3dWalk.js";
import { moonFromEye } from "../campus-sns/campus3dMoonSurface.js";
import { rayDir, rayVec, skyEye } from "../campus-sns/campus3dSkyLayer.js";
import { PER_M } from "../campus-sns/campus3dLayer.js";
import { toXY } from "../campus-sns/campus3dFeatures.js";
import { SUN_SITE } from "../campus-sns/campus3dSky.js";

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const newGait = () => ({ bobPhase: 0, bobAmp: 0 });
const still = { height: 0, yaw: 0, pitch: 0 };

test("footsteps keep several cm of eye height motion, with subpixel sky rotation", () => {
  const w = newGait();
  const focal = 540 / Math.tan(WALK_FOV * Math.PI / 360);
  for (const speed of [SPEED.walk, SPEED.sprint]) {
    const steps = Array.from({ length: 120 }, () => stepWalkView(w,speed/60,1/60,WALK_FOV));
    for (const step of steps) {
      assert.ok(focal * Math.tan(Math.abs(step.yaw)*Math.PI/180) < 0.5);
      assert.ok(focal * Math.tan(Math.abs(step.pitch)*Math.PI/180) < 0.5);
    }
    assert.ok(Math.min(...steps.map(a => a.height)) < -0.045);
  }
  let stopped;
  for (let i = 0; i < 60; i++) stopped = stepWalkView(w,0,1/60,WALK_FOV);
  assert.equal(Math.abs(stopped.pitch) + Math.abs(stopped.yaw) + Math.abs(stopped.height), 0);
  assert.deepEqual(stepWalkView(w,4.3/60,1/60,WALK_FOV,true),still);
});

test("gait follows the same cadence at different frame rates; lunar tracking removes angular sway", () => {
  function advance(rate, fov, moonScope = false) {
    const w = { ...newGait(), moonScope };
    let offset;
    for (let i = 0; i < rate; i++) offset = stepWalkView(w,4.3/rate,1/rate,fov);
    return offset;
  }
  const wide = advance(60,WALK_FOV), slow = advance(20,WALK_FOV), lens = advance(60,1.65);
  near(slow.yaw,wide.yaw,1e-10);
  near(slow.pitch,wide.pitch,1e-10);
  assert.ok(Math.abs(lens.pitch) < Math.abs(wide.pitch)*0.04);
  near(lens.height,wide.height,1e-12);
  for (const fov of [WALK_FOV, 30, 1.65]) {
    const tracking = advance(60, fov, true);
    assert.equal(Math.abs(tracking.yaw) + Math.abs(tracking.pitch), 0);
    near(tracking.height,wide.height,1e-12);
  }
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

test("interpolated sky directions stay fixed as the far plane moves or goes to infinity", () => {
  const inv = inverseView([0,0,0]);
  const centre = rayDir(inv,0,0);
  for (const farW of [1e-5, 1e-7, 0]) {
    inv[15] = 1 + farW;
    inv[3] = 2e-8;
    inv[7] = -3e-8;
    const a = rayVec(inv,-1,-1), b = rayVec(inv,3,-1), c = rayVec(inv,-1,3);
    const middle = a.map((v,i) => 0.5*v + 0.25*(b[i] + c[i]));
    const length = Math.hypot(...middle);
    middle.forEach((v,i) => near(v/length,centre[i],1e-9));
  }
});
