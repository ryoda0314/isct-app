import { DEG, clamp, norm360, fwdOf, spanBlocked, floorZ } from "./campus3dVehicleMath.js";

export const CAR = {
  length: 4.48, width: 1.92, height: 1.15, wheelbase: 2.68, track: 1.59, wheelR: 0.381,
  speed: 19.4, sprint: 31, back: 6.2, accel: 8.6, brake: 15.5,
  step: 0.5, maxTilt: 32, driver: [0.10, 0, 0.97],
};
export const CAR_WHEELS = [1, -1].flatMap(end => [1, -1].map(side =>
  [end * CAR.wheelbase / 2, side * CAR.track / 2]));
// The walk world's walls already have a pedestrian-radius margin. Include the
// bumper centres first so a square impact does not impart a fictitious spin.
const hull = [[2.08, 0], [-1.80, 0], [0, 0]];
for (const x of [2.04, -1.77, 1.48, -1.48, .94, -.94, .43, -.43, 0]) {
  const y = x>2 || x< -1.7 ? .63 : .82;
  hull.push([x, y], [x, -y]);
}
const decay = (rate, h) => 1 - Math.exp(-rate * h);
const approach = (v, target, d) => v + clamp(target - v, -d, d);

function probeCar(world, x, y, z, yaw, roadPitch, roadRoll, travel, placing, spawning=false) {
  const [fx, fy] = fwdOf(yaw);
  const grade = Math.tan(roadPitch * DEG), crossfall = Math.tan(roadRoll * DEG);
  const heights = [];
  const obstacle = (a, l, px, py, lo, hi, stairs = false) => ({ ok: false, a, l, px, py, lo, hi, stairs });
  for (const [a, l] of CAR_WHEELS) {
    const px = x + fx*a - fy*l, py = y + fy*a + fx*l;
    const ref = z + a*grade - l*crossfall;
    const height = floorZ(world, px, py, ref, placing ? .95 : travel);
    if (height == null || (placing && Math.abs(height - z) > .95))
      return obstacle(a, l, px, py, ref + travel, ref + CAR.height, true);
    heights.push(height);
  }
  // An axle still on the lip supports the chassis as the other axle drops.
  const high = Math.max(...heights);
  const [fl, fr, rl, rr] = heights.map(v => Math.max(v, high - CAR.wheelbase*Math.tan(CAR.maxTilt*DEG)));
  // A bench under just one wheel twists the support plane; a continuous
  // inclined driveway still supports the full footprint.
  if (spawning && Math.abs(fl+rr-fr-rl)>.18) return {ok:false};
  const support = (fl + fr + rl + rr) / 4;
  const pitch = Math.atan2(fl + fr - rl - rr, 2*CAR.wheelbase) / DEG;
  const roll = Math.atan2(fr + rr - fl - rl, 2*CAR.track) / DEG;
  if (placing && (Math.abs(pitch) > CAR.maxTilt || Math.abs(roll) > CAR.maxTilt)) return { ok: false };
  const foreGrade = Math.tan(pitch*DEG), sideGrade = Math.tan(roll*DEG);
  for (const [a, l] of hull) {
    const px = x + fx*a - fy*l, py = y + fy*a + fx*l;
    if (spawning) {
      const plane=support+a*foreGrade-l*sideGrade;
      const surface=floorZ(world,px,py,plane,.65);
      if(surface==null || Math.abs(surface-plane)>.16) return {ok:false};
    }
    const base = Math.max(z, support) + a*foreGrade - l*sideGrade;
    const lo = base + travel + .02, hi = base + (Math.abs(a) > 1.45 ? .91 : CAR.height);
    if (spanBlocked(world, px, py, lo, hi)) return obstacle(a, l, px, py, lo, hi);
  }
  return { ok: true, z: support, pitch, roll, heights };
}

export function carFits(world, x, y, z, yaw, spawning=false) {
  return probeCar(world, x, y, z, yaw, 0, 0, CAR.step, true, spawning);
}

function contactNormal(world, contact, vx, vy) {
  let x = 0, y = 0;
  for (let i = 0; i < 8; i++) {
    const dx = Math.cos(i*Math.PI/4), dy = Math.sin(i*Math.PI/4);
    const px = contact.px + dx*.32, py = contact.py + dy*.32;
    const clear = contact.stairs ? world.floorBelow(px, py, contact.lo) != null :
      !spanBlocked(world, px, py, contact.lo, contact.hi);
    if (clear) { x += dx; y += dy; }
  }
  const len = Math.hypot(x, y);
  if (len > .1 && x*vx + y*vy <= .01) return [x/len, y/len];
  const speed = Math.hypot(vx, vy) || 1;
  return [-vx/speed, -vy/speed];
}

export function carGear(v) {
  if (v < -.15) return "R";
  return 1 + [7.4, 13.2, 19.3, 25.8].filter(limit => v > limit).length;
}

export function stepCar(prev, input, dt, world) {
  const c = { ...prev, hit: false, stairs: false, impact: 0 };
  const throttle = clamp(input.fwd || 0, -1, 1);
  const turn = clamp((input.side || 0) + (input.turn || 0), -1, 1);
  const handbrake = !!input.handbrake;
  let { x, y, z, yaw } = c;
  let v = c.v || 0, slip = c.slip || 0, steer = c.steer || 0, spin = c.spin || 0;
  let roadPitch = c.roadPitch ?? c.pitch ?? 0, roadRoll = c.roadRoll ?? c.roll ?? 0;
  let spring = c.vz || 0, support = c.zr ?? z, wheel = c.wheel || 0;
  let pitch = c.pitch || 0, roll = c.roll || 0, kick = c.kick || 0;
  let heights = c.heights || [z, z, z, z];
  let cooldown = c.cooldown || 0, fxAge = c.fxAge ?? 1;
  const n = Math.max(1, Math.ceil(dt * Math.max(48, (Math.hypot(v, slip) + 3) / .23)));
  const h = dt/n;
  for (let i = 0; i < n && h > 0; i++) {
    const oldV = v;
    const grounded = z <= support + .26;
    const braking = (throttle < -.04 && v > .12) || (throttle > .04 && v < -.12);
    if (grounded) {
      if (braking) v = approach(v, 0, CAR.brake*Math.abs(throttle)*h);
      else if (throttle > .04) {
        const limit = input.sprint ? CAR.sprint : CAR.speed;
        v = approach(v, limit*throttle, (v > limit*throttle ? 2.3 : CAR.accel*(1.12 - .45*Math.abs(v)/CAR.sprint))*h);
      } else if (throttle < -.04) v = approach(v, CAR.back*throttle, 5*h);
      else v = approach(v, 0, (.9 + .004*v*v)*h);
      v -= 6.8*Math.sin(roadPitch*DEG)*h;
      if (handbrake) v = approach(v, 0, 5.8*h);
    }
    const steerLimit = 8 + 26/(1 + Math.abs(v)*.095);
    steer = approach(steer, -turn*steerLimit, 132*h);
    const rate = grounded ? -v*Math.tan(steer*DEG)/CAR.wheelbase * (handbrake ? 1.43 : .91) : 0;
    const rotation = (rate/DEG + spin)*h;
    const candidateYaw = norm360(yaw + rotation);
    const [fx, fy] = fwdOf(candidateYaw);
    // Resolve momentum into the new wheel axes. Releasing rear grip keeps
    // some sideways velocity instead of rotating the whole velocity vector.
    const angle = rotation*DEG;
    const lateral = slip*Math.cos(angle) - v*Math.sin(angle);
    v = v*Math.cos(angle) + slip*Math.sin(angle);
    slip = lateral*Math.exp(-(grounded ? (handbrake ? 1.7 : 8.5) : .35)*h);
    let vx = fx*v + fy*slip, vy = fy*v - fx*slip;
    const nx = x + vx*h, ny = y + vy*h;
    const travel = CAR.step + Math.min(.18, Math.abs(v)*.009);
    const probe = probeCar(world, nx, ny, Math.max(z, support), candidateYaw, roadPitch, roadRoll, travel, false);
    cooldown = Math.max(0, cooldown - h);
    fxAge += h;
    kick *= Math.exp(-6.5*h);
    spin *= Math.exp(-3.8*h);
    if (probe.ok) {
      x = nx; y = ny; yaw = candidateYaw;
      support = probe.z; roadPitch = probe.pitch; roadRoll = probe.roll; heights = probe.heights;
      wheel = (wheel + v*h/CAR.wheelR) % (2*Math.PI);
    } else {
      c.hit = true; c.stairs ||= !!probe.stairs;
      const [ax, ay] = contactNormal(world, probe, vx, vy);
      const speedIn = Math.max(0, -(vx*ax + vy*ay));
      const bounce = speedIn > 2 ? .34 : .02;
      vx = (vx + (1 + bounce)*speedIn*ax)*.90;
      vy = (vy + (1 + bounce)*speedIn*ay)*.90;
      const [ox, oy] = fwdOf(yaw);
      v = vx*ox + vy*oy; slip = vx*oy - vy*ox;
      if (speedIn > 2.2 && !cooldown) {
        const force = clamp((speedIn - 1.5)/17, .06, 1);
        const rx = probe.px - nx, ry = probe.py - ny;
        spin = clamp(spin + (ry*ax - rx*ay)*speedIn*4.2, -100, 100);
        const front = clamp(.5 + probe.a/2.4, 0, 1), left = clamp(.5 + probe.l/1.6, 0, 1);
        const weights = [front*left, front*(1-left), (1-front)*left, (1-front)*(1-left)];
        c.dents = weights.map((w, j) => clamp((c.dents?.[j] || 0) + w*force*1.65, 0, 1));
        c.impact = Math.max(c.impact, speedIn);
        c.contact = { x: probe.px, y: probe.py, z: z + .60, ax, ay, force };
        fxAge = 0; kick = force; cooldown = .30;
      }
    }
    if (z > support + .23) spring -= 16*h;
    else spring += ((support - z)*160 - spring*12)*h;
    z = Math.max(support - .17, z + spring*h);
    if (z <= support - .169) spring = Math.max(0, -spring*.18);
    const accel = clamp((v - oldV)/h, -18, 10);
    pitch += (roadPitch + accel*.16 - pitch)*decay(8, h);
    roll += (roadRoll + clamp(rate*v*.43, -7, 7) - roll)*decay(7, h);
  }
  const braking = handbrake || (throttle < -.04 && v > .12) || (throttle > .04 && v < -.12);
  const gear = carGear(v);
  const gearBase = [0, 0, 7.4, 13.2, 19.3, 25.8][gear] || 0;
  const rpm = clamp(1100 + (Math.abs(v)-gearBase)*595 + (gearBase ? 1700 : 0) + Math.max(0, throttle)*420, 900, 7400);
  const skid = z < support + .24 && Math.abs(v) > 3 && (handbrake || Math.abs(slip) > 2.8 || (braking && Math.abs(v) > 13));
  const time = (c.time || 0) + dt;
  let marks = c.marks || [], anchor = c.markAnchor;
  if (marks.length && time - marks[0].time > 7) marks = marks.filter(m => time - m.time <= 7);
  if (skid) {
    const [fx, fy] = fwdOf(yaw);
    const tires = CAR_WHEELS.slice(2).map(([a,l],i) => [x+a*fx-l*fy, y+a*fy+l*fx, heights[i+2]+.045]);
    if (!anchor) anchor = tires;
    else if (Math.hypot(tires[0][0]-anchor[0][0], tires[0][1]-anchor[0][1]) > .46) {
      marks = [...marks.slice(-47), { from: anchor, to: tires, time }];
      anchor = tires;
    }
  } else anchor = null;
  return { ...c, x, y, z, yaw, v, slip, steer, spin, wheel, vz: spring, zr: support, roadPitch, roadRoll, heights,
    pitch, roll, kick, cooldown, fxAge, rpm, gear, braking, reverse: v < -.12, air: z > support + .23,
    skid, marks, markAnchor: anchor, time };
}
