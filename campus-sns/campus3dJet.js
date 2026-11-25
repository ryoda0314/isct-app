import { DEG, clamp, norm360, fwdOf, spanBlocked } from "./campus3dVehicleMath.js";

export const JET = { halfLength: 5.1, halfSpan: 4.6, cruise: 35, maxSpeed: 67, liftSpeed: 21, ceiling: 210 };
// Samples follow the swept planform, including both low wingtips while banked.
const contacts = [[4.8, 0, 1.2], [2.3, 0, 1.55], [0, 0, 1.65], [-2.5, 0, 1.55], [-4.5, 0, 1.85], [-4.2, 0, 2.9]];
for (const s of [-1, 1]) {
  for (const [a, l, h] of [[.1, .8, 1], [-.32, 1.7, 1], [-.72, 2.5, 1.05], [-1.2, 3.4, 1.12], [-1.72, 4.45, 1.2], [-3.8, 1.75, 1.95]]) contacts.push([a, l*s, h]);
}
function obstructed(world, x, y, z, yaw, pitch, bank) {
  const [fx, fy] = fwdOf(yaw);
  const cp = Math.cos(pitch*DEG), sp = Math.sin(pitch*DEG);
  const cb = Math.cos(bank*DEG), sb = Math.sin(bank*DEG);
  for (const [a, l, h] of contacts) {
    const lateral = l*cb - h*sb, up = l*sb + h*cb;
    const fore = a*cp - up*sp;
    const px = x + fx*fore - fy*lateral, py = y + fy*fore + fx*lateral, pz = z + a*sp + up*cp;
    if (spanBlocked(world, px, py, pz - .22, pz + .32)) return true;
    // Terrain has no solid volume in walkWorld. A rising hillside or a low
    // wing can intersect it even when the fuselage is still above the ground.
    if (!world.floorBelow(px, py, pz + .08)) return true;
  }
  return false;
}

export function launchJet(world, at) {
  const [fx, fy] = fwdOf(at.yaw);
  // Clear the skyline in the initial direction, so the garage also works
  // from the entrance deck or a narrow courtyard.
  let roof = at.z;
  for (const ahead of [0, 12, 27, 48]) {
    const surface = world.floorBelow(at.x + fx*ahead, at.y + fy*ahead, Infinity);
    if (surface) roof = Math.max(roof, surface.z);
  }
  for (const rise of [38, 58, 85]) {
    const z = roof + rise;
    if (obstructed(world, at.x, at.y, z, at.yaw, 0, 0)) continue;
    return { x: at.x, y: at.y, z, yaw: at.yaw, v: JET.cruise, throttle: .46, pitch: 0, bank: 0, gearDown: 0,
      vz: 0, agl: z - (world.floorBelow(at.x, at.y, z)?.z ?? at.z), grounded: false,
      launch: { x: at.x, y: at.y, z, yaw: at.yaw }, home: { ...at } };
  }
  return null;
}

export function stepJet(prev, input, dt, world) {
  const j = { ...prev, recovered: false };
  const throttleInput = clamp(input.fwd || 0, -1, 1);
  const stick = clamp(input.side || 0, -1, 1), rudder = clamp(input.turn || 0, -1, 1);
  const elevator = Number(!!input.up) - Number(!!input.down);
  j.elevator = (j.elevator || 0) + (elevator-(j.elevator || 0))*(1-Math.exp(-9*dt));
  j.aileron = (j.aileron || 0) + (stick-(j.aileron || 0))*(1-Math.exp(-9*dt));
  j.fanAngle = ((j.fanAngle || 0) + (39+j.throttle*86)*dt) % (Math.PI*2);
  const n = Math.max(1, Math.ceil(dt * Math.max(36, (j.v + 4)/.54)));
  const h = dt/n;
  for (let i = 0; i < n && h > 0; i++) {
    j.throttle = clamp(j.throttle + throttleInput*.47*h, 0, 1);
    const target = (j.grounded ? 0 : 9) + j.throttle*(j.grounded ? JET.maxSpeed : JET.maxSpeed - 9);
    const accel = target > j.v ? 9 + j.throttle*6 : (j.grounded && throttleInput < 0 ? 20 : 7);
    j.v += clamp(target - j.v, -accel*h, accel*h);
    const canLift = j.v > JET.liftSpeed;
    const liftoff = j.grounded && elevator > 0 && canLift;
    if (liftoff) j.grounded = false;
    const slow = clamp((JET.liftSpeed - j.v)/10, 0, 1);
    const targetPitch = j.grounded ? 0 : elevator*(elevator > 0 ? 25 : 22) - slow*10;
    j.pitch += (targetPitch - j.pitch)*(1 - Math.exp(-2.3*h));
    const targetBank = j.grounded ? 0 : stick*51;
    j.bank += (targetBank - j.bank)*(1 - Math.exp(-2.7*h));
    const turn = j.grounded ? (stick + .5*rudder)*clamp(j.v*1.9, 0, 34) :
      Math.tan(j.bank*DEG)*clamp(860/Math.max(j.v, 15), 14, 38) + rudder*14;
    const yaw = norm360(j.yaw + turn*h);
    const [fx, fy] = fwdOf(yaw);
    const horizontal = j.v*Math.cos(j.pitch*DEG);
    const x = j.x + fx*horizontal*h, y = j.y + fy*horizontal*h;
    const vz = j.grounded ? 0 : j.v*Math.sin(j.pitch*DEG) - slow*3.5;
    let z = Math.min(j.launch.z + JET.ceiling, j.z + vz*h);
    const floor = world.floorBelow(x, y, j.z + .8);
    const touching = floor && (z < floor.z || (z <= floor.z + .035 && vz <= 0)) && !liftoff;
    const landing = touching && Math.abs(j.bank) < 13 && j.pitch > -12 && vz > -5.5 && j.v < 36;
    const rolling = j.grounded && floor && Math.abs(floor.z - j.z) < .38;
    if (rolling || landing) {
      z = floor.z; j.grounded = true; j.pitch *= Math.exp(-8*h); j.bank *= Math.exp(-8*h);
    }
    if (!floor || (touching && !rolling && !landing) || obstructed(world, x, y, z, yaw, j.pitch, j.bank)) {
      // Return to a known clear pose on a hard landing, clipped wing or map edge.
      return { ...j, ...j.launch, v: JET.cruise, throttle: .46, pitch: 0, bank: 0, vz: 0, gearDown: 0,
        grounded: false, recovered: true, agl: j.launch.z - (world.floorBelow(j.launch.x, j.launch.y, j.launch.z)?.z ?? j.home.z) };
    }
    j.vz = j.grounded ? 0 : (z - j.z)/h;
    j.x = x; j.y = y; j.z = z; j.yaw = yaw;
    j.agl = Math.max(0, z - floor.z);
    const extend = j.grounded || (j.agl < 9 && j.v < 38);
    j.gearDown += ((extend ? 1 : 0) - j.gearDown)*(1 - Math.exp(-4*h));
  }
  return j;
}
