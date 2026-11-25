import assert from "node:assert/strict";
import test from "node:test";
import { envAt, moonPosition } from "../campus-sns/campus3dEnv.js";

const RAD = Math.PI/180;
function near(actual, reference, delta) {
  assert.ok(Math.abs(actual-reference) < delta, `${actual} vs ${reference} (±${delta})`);
}
function coordinates(v) {
  return [(Math.atan2(v[1],v[0])/RAD+360)%360, Math.asin(v[2])/RAD];
}

// JPL Horizons, target 301, geodetic 139.6845 E / 35.6058 N / 0.040 km,
// refracted observer quantities 4,10,13,14,15. Diameter in arcseconds, times UT.
// https://ssd.jpl.nasa.gov/horizons/
const references = [
  ["2026-01-03T12:00Z", 91.055008,51.786841,99.85441,2004.844,3.980825,-5.303901,2.208713,-1.304038],
  ["2026-01-10T20:30Z",177.103502,41.611215,48.00452,1811.460,5.142668,5.142229,272.952734,-1.188626],
  ["2026-03-03T11:34Z",110.575305,35.286945,99.99358,1891.702,5.474199,0.745731,4.785662,0.138341],
  ["2026-04-19T10:15Z",289.189247,14.155343,5.21134,1990.569,358.601212,-6.172577,152.620805,1.190345],
];
test("Ookayama lunar pointing, apparent size, illumination and surface orientation match Horizons", () => {
  for (const [time,az,alt,lit,diam,lon,lat,sunLon,sunLat] of references) {
    const m = moonPosition(new Date(time));
    near(m.azimuth,az,0.02);
    near(m.elevation,alt,0.02);
    near(2*m.radius/RAD*3600,diam,0.6);
    near(100*m.lit,lit,0.015);
    // This is the centre texel hit by the shader, including diurnal libration.
    const face = [0,1,2].map(i => m.dir.reduce((v,d,j) => v-d*m.localToBody[j*3+i],0));
    const [faceLon,faceLat] = coordinates(face), [lightLon,lightLat] = coordinates(m.sun);
    near(faceLon,lon,0.03);
    near(faceLat,lat,0.02);
    near(lightLon,sunLon,0.02);
    near(lightLat,sunLat,0.02);
  }
});
test("geocentric libration matches NASA's 2026 lunar maps; a fixed sky keeps its physical terminator", () => {
  // https://svs.gsfc.nasa.gov/5587/ (hourly mooninfo, east-positive longitude).
  const date = new Date("2026-01-03T12:00Z");
  const m = moonPosition(date), [lon,lat] = coordinates(m.earth);
  near(lon,3.393,0.02);
  near(lat,-5.502,0.02);
  const fixed = envAt(date,null,{elevation:-40, azimuth:0});
  assert.deepEqual(fixed.moon.sun, m.sun);
  assert.equal(moonPosition(new Date("2026-04-19T10:15Z")).waxing,true);
  assert.equal(moonPosition(new Date("2026-01-10T20:30Z")).waxing,false);
});
test("Earth's shadow crosses the full Moon on 3 March; ordinary full Moons illuminate the sky", () => {
  // https://www.nao.ac.jp/astro/sky/2026/03-topics02.html
  const fraction = time => moonPosition(new Date(time)).sunlightFraction;
  assert.equal(fraction("2026-03-03T08:00Z"),1);
  assert.ok(fraction("2026-03-03T10:00Z")>0 && fraction("2026-03-03T10:00Z")<1);
  assert.equal(fraction("2026-03-03T11:34Z"),0);
  assert.equal(fraction("2026-03-03T15:00Z"),1);
  assert.equal(fraction("2026-01-03T12:00Z"),1);
});
test("at moonrise refraction compresses the vertical diameter; high in the sky the disk is circular", () => {
  const rising = moonPosition(new Date("2026-01-03T07:20Z"));
  const high = moonPosition(new Date("2026-01-03T12:00Z"));
  assert.ok(rising.elevation > 0 && rising.elevation < 1);
  assert.ok(rising.verticalScale > 0.82 && rising.verticalScale < 0.90);
  near(high.verticalScale, 1, 0.001);
});
