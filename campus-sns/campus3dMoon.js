import { Body, GeoMoon, GeoVector, KM_PER_AU, Observer, ObserverVector, Refraction, RotationAxis, Rotation_EQJ_HOR } from "astronomy-engine";
import { SUN_SITE } from "./campus3dSky.js";

// East-positive lunar longitudes, IAU mean Earth/polar axis frame. Surface maps use
// the same near-side meridian. Geometry and lighting use the world clock, including
// when the user overrides the colour or illumination of the campus sky.
const RAD = Math.PI / 180;
const RADIUS_KM = 1737.4;
const observer = new Observer(SUN_SITE.lat, SUN_SITE.lng, 40);
const xyz = ({ x, y, z }) => [x, y, z];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const unit = (a) => { const length = Math.hypot(...a); return a.map(v => v / length); };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const minus = (a, b) => a.map((v, i) => v - b[i]);

let lastInterval, lastPosition;
export function moonPosition(date) {
  // Weather and accelerated time can drive envAt every frame. A quarter second
  // of sky rotation is under four arcseconds, even at the celestial equator.
  const interval = Math.floor(date.getTime() / 250);
  if (interval === lastInterval) return lastPosition;
  const geo = GeoMoon(date);
  const time = geo.t;
  const moon = xyz(geo);
  const sight = minus(moon, xyz(ObserverVector(time, observer, false)));
  const sunlight = minus(xyz(GeoVector(Body.Sun, time, true)), moon);
  const toSun = unit(sunlight);
  const toEye = unit(sight).map(v => -v);
  const dist = Math.hypot(...sight) * KM_PER_AU;
  const geoDistance = Math.hypot(...moon) * KM_PER_AU;
  const radius = Math.asin(RADIUS_KM / dist);

  // Rotation_EQJ_HOR takes J2000 to north/west/up. Our map uses east/north/up.
  const hor = Rotation_EQJ_HOR(time, observer).rot;
  const toENU = (v) => {
    const component = k => hor[0][k]*v[0] + hor[1][k]*v[1] + hor[2][k]*v[2];
    return [-component(1), component(0), component(2)];
  };
  const direction = toENU(unit(sight));
  const altitude = Math.asin(direction[2]) / RAD;
  const az = Math.atan2(direction[0], direction[1]);
  const bend = Refraction("normal", altitude) * RAD;
  const elevation = altitude + bend / RAD;
  const upper = Refraction("normal", altitude + radius/RAD), lower = Refraction("normal", altitude - radius/RAD);
  const verticalScale = 1 + (upper-lower)*RAD/(2*radius);
  const dir = [Math.sin(az)*Math.cos(elevation*RAD), Math.cos(az)*Math.cos(elevation*RAD), Math.sin(elevation*RAD)];

  // IAU pole and prime meridian include physical libration. Looking at this body
  // from the observer's position also gives optical and diurnal libration.
  const axis = RotationAxis(Body.Moon, time);
  const z = xyz(axis.north), ra = axis.ra * 15 * RAD, w = (axis.spin % 360) * RAD;
  const node = [-Math.sin(ra), Math.cos(ra), 0], meridian = cross(z, node);
  const axes = [
    node.map((v, i) => Math.cos(w)*v + Math.sin(w)*meridian[i]),
    node.map((v, i) => -Math.sin(w)*v + Math.cos(w)*meridian[i]), z,
  ];
  const body = (v) => axes.map(axis => dot(axis, v));
  // Carry the body frame along with the refracted image, so refraction never
  // slides the texture across the surface. Column-major local ENU → lunar XYZ.
  const right = [Math.cos(az), -Math.sin(az), 0];
  const localAxes = axes.map(axis => {
    const v = toENU(axis), turn = cross(right, v), along = dot(right, v);
    return v.map((n, i) => n*Math.cos(bend) + turn[i]*Math.sin(bend) + right[i]*along*(1-Math.cos(bend)));
  });
  const localToBody = [0,1,2].flatMap(i => localAxes.map(axis => axis[i]));
  const toEarth = unit(moon).map(v => -v);
  const sunRadius = Math.asin(695700 / (Math.hypot(...sunlight)*KM_PER_AU));
  const earthRadius = Math.asin(6378.14 / geoDistance);
  const earthSeparation = Math.acos(Math.min(1, Math.max(-1, dot(toEarth, toSun))));
  const shadowWidth = sunRadius + RADIUS_KM / geoDistance;
  const shadow = Math.min(1, Math.max(0, (earthSeparation - earthRadius + shadowWidth) / (2*shadowWidth)));
  const lit = (1 + dot(toEye, toSun)) / 2;
  // The z component of Sun × Moon in the ecliptic frame fixes the sign of elongation.
  const pole = [0, -0.397777, 0.917482];
  lastInterval = interval;
  lastPosition = {
    elevation, azimuth: (az / RAD + 360) % 360, dir, dist, radius, verticalScale, localToBody, lit,
    waxing: dot(cross(toSun, moon), pole) >= 0,
    sun: [...body(toSun), sunRadius],
    earth: [...body(toEarth), RADIUS_KM / geoDistance],
    sunlightFraction: shadow * shadow * (3 - 2 * shadow),
  };
  return lastPosition;
}
