import { SUN_SITE } from "./campus3dSky.js";
import { toXY } from "./campus3dFeatures.js";

// The ephemeris is for the reference observer 40 m above sea level. Translate
// the lunar centre to the actual camera (east, north, altitude in metres).
const siteEye = [...toXY([SUN_SITE.lng, SUN_SITE.lat]), 40];
export function moonFromEye(moon, eye) {
  const sight = moon.dir.map((v, i) => v * moon.dist + (siteEye[i] - eye[i]) / 1000);
  const distance = Math.hypot(...sight);
  return {
    dir: sight.map(v => v / distance),
    radius: Math.asin(Math.sin(moon.radius) * moon.dist / distance),
  };
}

// NASA's Scientific Visualization Studio, CGI Moon Kit (https://svs.gsfc.nasa.gov/4720/).
// LROC WAC albedo (NASA/GSFC/ASU), 0° at image centre, north up, east to the right.
// LOLA (NASA/GSFC/MIT) LDEM_16, 0.5 m/count, recentered from 0–360 to ±180°,
// resampled in elevation and losslessly stored as (km + 11) / 22.
// https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.lbl
// Pixel centres in both 2048 × 1024 maps cover the whole sphere.
const MATERIALS = [
  ["/map-3d/moon/lroc-color.jpg", [184, 181, 177, 255]],
  ["/map-3d/moon/lola-height.webp", [128, 128, 128, 255]],
];

export function createMoonTextures(gl, repaint) {
  let active = true;
  const materials = MATERIALS.map(([url, neutral]) => {
    const texture = gl.createTexture();
    const img = new Image();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(neutral));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    img.onload = () => { if (active) repaint(); };
    img.src = url;
    return { texture, img, uploaded: false };
  });
  return {
    bind() {
      materials.forEach((m, i) => {
        gl.activeTexture(gl.TEXTURE2 + i);
        gl.bindTexture(gl.TEXTURE_2D, m.texture);
        if (m.uploaded || !m.img.complete || !m.img.naturalWidth) return;
        const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        const colour = gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // v = 0 is the north edge of the source raster
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m.img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, colour);
        m.uploaded = true;
      });
    },
    remove() {
      active = false;
      for (const { img, texture } of materials) { img.onload = null; gl.deleteTexture(texture); }
    },
  };
}

export const MOON_SURFACE = `
uniform sampler2D u_lunarColor, u_lunarHeight;
uniform mat3 u_localToMoon;
uniform vec4 u_lunarSun, u_lunarEarth; // body-fixed unit vectors plus Sun angular radius and Rmoon / Earth distance
uniform float u_moonRadius, u_moonVertical, u_moonLit;
uniform vec3 u_moonTransmission;
const float LUNAR_R = 1737.4;
const vec2 LUNAR_TEXEL = vec2(1.0/2048.0, 1.0/1024.0);

vec2 lunarUV(vec3 n) {
  return vec2(0.5 + atan(n.y,n.x)/(2.0*PI), 0.5 - asin(clamp(n.z,-1.0,1.0))/PI);
}
float groundHeight(vec2 uv, float lod) {
  return 22.0*textureLod(u_lunarHeight,uv,lod).r - 11.0;
}
// Test the actual terrain between this surface point and the rising/setting Sun.
// Distance, height, and the drop of the curved reference surface are in kilometres.
float terrainSun(vec3 n, float mu, vec2 uv, float lod) {
  float detail = 1.0-smoothstep(2.5,3.5,lod);
  if (mu > 0.30 || mu < -0.035 || detail <= 0.0) return 1.0;
  vec3 tangent = normalize(u_lunarSun.xyz - n*mu);
  float floorHeight = groundHeight(uv,lod);
  float horizon = -1.0;
  float stepKm = 4.5;
  for (int i=0; i<6; ++i) {
    vec2 sampleUV = lunarUV(normalize(n + tangent*(stepKm/LUNAR_R)));
    float rise = (groundHeight(sampleUV,lod)-floorHeight)/stepKm - stepKm/(2.0*LUNAR_R);
    horizon = max(horizon,rise);
    stepKm *= 1.75;
  }
  return mix(1.0,smoothstep(horizon-u_lunarSun.w,horizon+u_lunarSun.w,mu),detail);
}
vec3 lunarSample(vec3 ray, float pixel, float horizonWidth, vec3 background, vec3 air) {
  float aboveHorizon = smoothstep(-horizonWidth,horizonWidth,ray.z);
  if (aboveHorizon <= 0.0) return background;
  // The lower limb is raised more than the upper limb near the horizon.
  vec3 vertical = normalize(vec3(0,0,1)-u_moon*u_moon.z);
  ray = normalize(ray + vertical*dot(ray-u_moon,vertical)*(1.0/u_moonVertical-1.0));
  // Ray / sphere intersection in units of the lunar radius. Retain precision at 0.5°.
  vec3 offset = cross(ray,cross(ray,u_moon)) / sin(u_moonRadius);
  float r = length(offset);
  float aa = 0.54*pixel/(u_moonRadius*min(1.0,u_moonVertical));
  float edge = aboveHorizon*(1.0-smoothstep(1.0-aa,1.0+aa,r));
  if (edge <= 0.0) return background;
  offset *= min(1.0,0.999999/max(0.000001,r));
  vec3 n = normalize(u_localToMoon*(offset - ray*sqrt(max(0.0,1.0-dot(offset,offset)))));
  vec3 eye = normalize(u_localToMoon*(-ray));
  float mu = max(0.003,dot(eye,n));
  float cosLat = max(0.015,length(n.xy));
  vec3 east = vec3(-n.y,n.x,0.0)/cosLat;
  vec3 north = cross(n,east);
  vec2 uv = lunarUV(n);
  float lod = clamp(log2(max(1.0, pixel*2048.0/(2.0*PI*u_moonRadius*max(0.17,min(mu,cosLat))))),0.0,10.0);
  vec3 rock = textureLod(u_lunarColor,uv,lod).rgb;
  float dzEast = groundHeight(uv+vec2(LUNAR_TEXEL.x,0),lod) - groundHeight(uv-vec2(LUNAR_TEXEL.x,0),lod);
  float dzNorth = groundHeight(uv-vec2(0,LUNAR_TEXEL.y),lod) - groundHeight(uv+vec2(0,LUNAR_TEXEL.y),lod);
  // 2 adjacent sample intervals along a lunar meridian / parallel.
  vec3 normal = normalize(n-(east*dzEast/cosLat+north*dzNorth)/(4.0*PI*LUNAR_R/2048.0));
  float sunEl = dot(n,u_lunarSun.xyz), incidence = max(0.0,dot(normal,u_lunarSun.xyz));
  float horizon = smoothstep(-0.025,0.008,sunEl)*terrainSun(n,sunEl,uv,lod);
  float emission = max(0.015,dot(normal,eye));
  // The regolith backscatters. Mare/highland contrast survives all the way to the
  // edge at opposition; at quadrature, ridges and craters show along the terminator.
  float reflected = (0.90*2.0*incidence/(incidence+emission)+0.10*incidence)*horizon;
  reflected *= 0.52 + 0.48*pow(u_moonLit,3.0);
  vec3 illumination = vec3(reflected);
  if (dot(u_lunarEarth.xyz,u_lunarSun.xyz)>0.9994) {
    // The Earth subtends a different angle from each point across the lunar disk.
    vec3 earth = normalize(u_lunarEarth.xyz - n*u_lunarEarth.w);
    float sep = length(earth-u_lunarSun.xyz);
    float earthRad = (6378.14/LUNAR_R)*u_lunarEarth.w*1.01;
    float sunlight = smoothstep(earthRad-u_lunarSun.w,earthRad+u_lunarSun.w,sep);
    float rim = smoothstep(0.0,earthRad,sep);
    // Approximate the reddened light refracted through the Earth's atmosphere;
    // individual eclipses vary with aerosols and clouds around the Earth's limb.
    illumination *= mix(vec3(0.115,0.023,0.006)*(0.33+0.67*rim),vec3(1),sunlight);
  }
  // Earthshine fades as the Earth seen from the Moon wanes. The urban sky sets
  // the contrast floor; the atmosphere and clouds are in front of this surface.
  illumination += vec3(0.014,0.016,0.020)*pow(1.0-u_moonLit,2.0)*u_night;
  vec3 radiance = 1.16*rock*sqrt(max(vec3(0),illumination))*u_moonTransmission;
  vec3 disc = sqrt(air*air + radiance*radiance);
  return mix(background,disc,edge);
}
vec3 lunarDisc(vec3 ray, vec3 dx, vec3 dy, vec3 background, vec3 air) {
  float pixel = max(length(dx),length(dy));
  if (dot(ray,u_moon)<=0.0 || length(cross(ray,u_moon))>u_moonRadius+1.5*pixel) return background;
  float horizonWidth = max(1e-7,0.5*(abs(dx.z)+abs(dy.z)));
  float radiusPx = u_moonRadius/max(1e-8,pixel);
  float spread = 1.0-smoothstep(24.0,48.0,radiusPx);
  if (spread <= 0.0) return lunarSample(ray,pixel,horizonWidth,background,air);
  // Fixed, stratified subpixel positions filter the bright limb and dark maria
  // during a pan. Collapse the footprint continuously as the lens zooms in.
  const vec2 taps[8] = vec2[8](vec2(1,-3),vec2(-1,3),vec2(5,1),vec2(-3,-5),
                               vec2(-5,5),vec2(-7,-1),vec2(3,7),vec2(7,-7));
  float footprint = 1.0-0.60*spread;
  vec3 total = vec3(0);
  for (int i=0;i<8;++i) {
    vec3 offset = (dx*taps[i].x + dy*taps[i].y)*(spread/16.0);
    total += lunarSample(normalize(ray+offset),pixel*footprint,horizonWidth*footprint,background,air);
  }
  return total/8.0;
}`;
