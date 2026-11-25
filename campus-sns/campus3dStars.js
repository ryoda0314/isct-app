import { compile, PER_M } from "./campus3dLayer.js";
import { BRIGHT_STARS } from "./campus3dStarCatalog.js";
import { visiblePlanets } from "./campus3dPlanets.js";

const DEG = Math.PI / 180;
export function equatorialDirection(ra, dec) {
  const a = ra * DEG,
    d = dec * DEG;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

// Estimated limiting V magnitude at the zenith. Nearby Nakahara and Saiwai survey sites
// measured 16.66–17.17 mag/arcsec² in summer 2025 and winter 2026. Seeing and eye adaptation vary.
// https://www.env.go.jp/air/life/hoshizorakansatsu/observe-4.html
const TWILIGHT = [
  [-16, 4.1],
  [-11, 3.95],
  [-8, 3.25],
  [-6, 2.05],
  [-3, 0.35],
  [0, -2.65],
  [3, -5.5],
];
export function twilightLimit(sunElevation) {
  if (sunElevation <= TWILIGHT[0][0]) return TWILIGHT[0][1];
  for (let i = 1; i < TWILIGHT.length; i++) {
    const [el, mag] = TWILIGHT[i],
      [prevEl, prevMag] = TWILIGHT[i - 1];
    if (sunElevation <= el) return prevMag + ((mag - prevMag) * (sunElevation - prevEl)) / (el - prevEl);
  }
  return TWILIGHT[TWILIGHT.length - 1][1];
}

const vertex = (clouds) => `
precision highp float;
attribute vec2 a_corner;
attribute vec3 a_dir, a_photo; // J2000 direction; V magnitude, B-V, scintillation phase (-1 for a planet)
uniform mat4 u_matrix;
uniform mat3 u_local;
uniform vec4 u_perM, u_screen; // east & north in map units; two NDC units per CSS pixel, DPR, seconds
uniform vec3 u_moon, u_sun;
uniform vec2 u_moonSize; // angular radius, vertical compression from differential refraction
uniform vec4 u_air; // zenith limit, extinction magnitudes per airmass, fog, moonlight
varying vec2 v_offset;
varying vec4 v_psf;
varying vec3 v_colour;
${clouds}
void main() {
  gl_Position=vec4(2.0,2.0,1.0,1.0);
  v_psf=vec4(1.0,1.0,0.0,0.0); v_offset=vec2(0.0); v_colour=vec3(1.0);
  vec3 d=normalize(u_local*a_dir);
  if (d.z < -0.012) return;
  float alt=degrees(asin(clamp(d.z,-1.0,1.0)));
  // Apply the same standard-atmosphere correction as the Moon for occultations.
  if (alt < 89.9) {
    float refr=radians(1.02/60.0)/tan(radians(alt+10.3/(alt+5.11)));
    float apparent=radians(alt)+refr;
    d=vec3(normalize(d.xy)*cos(apparent),sin(apparent));
  }
  if (d.z <= 0.0) return;
  vec2 xy=d.x*u_perM.xy+d.y*u_perM.zw;
  vec4 pos=u_matrix*vec4(xy,d.z,0.0); // direction at infinity: camera translation has no effect
  if (pos.w<=0.0 || any(greaterThan(abs(pos.xy),vec2(1.04*pos.w)))) return;
  float airmass=1.0/(d.z+0.50572*pow(max(0.0,alt)+6.07995,-1.6364));
  float extinction=u_air.y*max(0.0,airmass-1.0);
  float separation=acos(clamp(dot(d,u_moon),-1.0,1.0));
  if (dot(d,u_sun)>0.999982) return;
  if (separation < u_moonSize.x) {
    vec3 vertical=normalize(vec3(0,0,1)-u_moon*u_moon.z);
    vec3 offset=d-u_moon;
    offset+=vertical*dot(offset,vertical)*(1.0/u_moonSize.y-1.0);
    if (length(offset)<u_moonSize.x) return;
  }
  float limit=u_air.x-0.92*exp(-d.z*4.6)-u_air.w*(0.45+2.1*exp(-separation*3.6));
  limit-=0.58*max(0.0,dot(d,u_sun))*smoothstep(-0.22,-0.02,u_sun.z);
  float mag=a_photo.x+extinction;
  if (mag > limit+0.18) return;
  float transmission=1.0-u_air.z;
  if (u_cloud.x>0.001) {
    vec2 p; float mass,footprint,litHeight;
    float density=cloudDensity(d,p,mass,footprint,litHeight);
    transmission*=exp(-7.5*density*density)*(1.0-smoothstep(0.70,0.91,density));
  }
  mag-=2.5*log(max(transmission,0.00001))/log(10.0);
  float visible=smoothstep(-0.18,0.82,limit-mag)*smoothstep(0.0,0.014,d.z);
  if (visible<0.002) return;
  // A display cannot reproduce the full flux range. Broaden only the brightest cores
  // and retain a low-energy wing. Colours desaturate toward the naked-eye limit.
  float bright=1.0-smoothstep(-0.8,3.55,mag);
  float core=0.52+0.55*bright+0.30*clamp(-mag/4.0,0.0,1.0);
  float s2=core*core, integrated=s2+1.0/(12.0*u_screen.z*u_screen.z);
  float wing=1.5+1.5*bright+0.9*clamp(-mag/4.0,0.0,1.0);
  float light=(1.0-exp(-1.85*exp(-0.425*mag)))*visible;
  if (a_photo.z>=0.0) {
    float ph=a_photo.z*6.2831853, t=u_screen.w;
    float variation=0.62*sin(t*(3.0+a_photo.z*3.1)+ph)+0.38*sin(t*8.3+ph*3.2);
    light*=1.0+(0.014+0.095*exp(-3.6*d.z))*variation;
  }
  vec3 blue=vec3(0.71,0.82,1.0), white=vec3(0.98,0.98,1.0), amber=vec3(1.0,0.67,0.45);
  float bv=a_photo.y+min(0.55,extinction*0.25);
  vec3 colour=mix(blue,white,smoothstep(-0.28,0.53,bv));
  colour=mix(colour,amber,smoothstep(0.54,1.92,bv));
  v_colour=mix(vec3(0.94,0.96,1.0),colour,0.24+0.76*bright);
  v_psf=vec4(0.5/integrated,0.5/(wing*wing),light*s2/integrated,light*0.085*bright*bright);
  v_offset=a_corner*max(3.7*sqrt(integrated),3.0*wing*bright);
  gl_Position=vec4(pos.xy+v_offset*u_screen.xy*pos.w,0.9999*pos.w,pos.w);
}`;
const FS = `
precision highp float;
varying vec2 v_offset;
varying vec4 v_psf;
varying vec3 v_colour;
void main() {
  float r2=dot(v_offset,v_offset);
  float light=dot(exp(-r2*v_psf.xy),v_psf.zw);
  gl_FragColor=vec4(v_colour*light,0.0);
}`;

export function createStarField(gl, clouds) {
  const program = compile(gl, vertex(clouds), FS);
  const vao = gl.createVertexArray(),
    corners = gl.createBuffer(),
    sources = gl.createBuffer();
  const stride = 6,
    tail = new Float32Array(5 * stride);
  const catalog = new Float32Array(BRIGHT_STARS.length * stride);
  BRIGHT_STARS.forEach(([hr, ra, dec, mag, bv], i) => {
    catalog.set([...equatorialDirection(ra, dec), mag, bv ?? 0.55, (hr * 0.61803398875) % 1], i * stride);
  });
  const previous = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner = program.att("a_corner");
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, sources);
  gl.bufferData(gl.ARRAY_BUFFER, catalog.byteLength + tail.byteLength, gl.DYNAMIC_DRAW);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, catalog);
  for (const [name, offset] of [
    ["a_dir", 0],
    ["a_photo", 12],
  ]) {
    const loc = program.att(name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 4 * stride, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(previous);
  const u = Object.fromEntries(
    ["matrix", "local", "perM", "screen", "moon", "moonSize", "sun", "air", "noise", "cloud", "cloudFrame", "cloudPixel"].map((key) => [
      key,
      program.loc("u_" + key),
    ]),
  );
  let minute = null,
    planets = 0;
  return {
    draw(matrix, sky, cloudFrame, date, now, canvas) {
      const stamp = Math.floor(date.getTime() / 60000);
      if (stamp !== minute) {
        const bodies = visiblePlanets(date);
        planets = bodies.length;
        bodies.forEach(({ direction, magnitude, bv }, i) => tail.set([...direction, magnitude, bv, -1], i * stride));
        gl.bindBuffer(gl.ARRAY_BUFFER, sources);
        gl.bufferSubData(gl.ARRAY_BUFFER, catalog.byteLength, tail);
        minute = stamp;
      }
      const width = Math.max(1, canvas.clientWidth),
        height = Math.max(1, canvas.clientHeight);
      const oldVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      const srcRGB = gl.getParameter(gl.BLEND_SRC_RGB),
        dstRGB = gl.getParameter(gl.BLEND_DST_RGB);
      const srcAlpha = gl.getParameter(gl.BLEND_SRC_ALPHA),
        dstAlpha = gl.getParameter(gl.BLEND_DST_ALPHA);
      gl.useProgram(program.p);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(u.matrix, false, matrix);
      gl.uniformMatrix3fv(u.local, false, sky.equatorialToLocal);
      gl.uniform4f(u.perM, PER_M.e[0], PER_M.e[1], PER_M.n[0], PER_M.n[1]);
      gl.uniform4f(u.screen, 2 / width, 2 / height, gl.drawingBufferHeight / height, (now / 1000) % 86400);
      gl.uniform3fv(u.moon, sky.moon);
      gl.uniform2f(u.moonSize, sky.moonRadius, sky.moonVertical);
      gl.uniform3fv(u.sun, sky.sun);
      gl.uniform4fv(u.air, sky.starAir);
      gl.uniform1i(u.noise, 1); // same cloud-noise texture as the sky pass
      gl.uniform4fv(u.cloud, sky.cloud);
      gl.uniform3fv(u.cloudFrame, cloudFrame);
      gl.uniform1f(u.cloudPixel, sky.cloudPixel);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, BRIGHT_STARS.length + planets);
      gl.blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(oldVao);
    },
    remove() {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(corners);
      gl.deleteBuffer(sources);
      gl.deleteProgram(program.p);
    },
  };
}
