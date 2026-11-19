import { marketProductModel } from "./campus3dMarketProducts.js";
import { marketRGB } from "./campus3dMarketGeometry.js";
import { stationModel } from "./campus3dStationModels.js";

export const STOCK_STRIDE = 14;
export function marketStockCollection(project) {
  const center = project([0, 0]),
    meter = [project([1, 0])[0] - center[0], project([0, 1])[1] - center[1]];
  const cells = new Map();
  return {
    add(model, point, z, angle, size, colors, light = 1, behind = false) {
      const cell = Math.floor(point[0] / 6) + "," + Math.floor(point[1] / 6);
      if (!cells.has(cell))
        cells.set(cell, {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
          groups: new Map()
        });
      const chunk = cells.get(cell),
        p = project(point),
        r = Math.hypot(size[0], size[1]) * 0.55;
      for (let i = 0; i < 2; i++) {
        chunk.min[i] = Math.min(chunk.min[i], p[i] - r * Math.abs(meter[i]));
        chunk.max[i] = Math.max(chunk.max[i], p[i] + r * Math.abs(meter[i]));
      }
      chunk.min[2] = Math.min(chunk.min[2], z - 0.02);
      chunk.max[2] = Math.max(chunk.max[2], z + size[2] * 1.05);
      const key = model + (behind ? ":back" : "");
      if (!chunk.groups.has(key)) chunk.groups.set(key, { model, behind, instances: [] });
      chunk.groups
        .get(key)
        .instances.push(...p, z, angle, ...size, light, ...marketRGB(colors[0]), ...marketRGB(colors[1]));
    },
    result() {
      return {
        meter,
        chunks: [...cells.values()].map(({ min, max, groups }) => ({
          center: min.map((x, i) => (x + max[i]) / 2),
          extent: min.map((x, i) => (max[i] - x) / 2),
          groups: [...groups.values()].map((g) => ({ ...g, instances: Float32Array.from(g.instances) }))
        }))
      };
    }
  };
}

const VS = `
attribute vec3 a_local;
attribute vec3 a_normal;
attribute vec4 a_material;
attribute vec4 a_pose;
attribute vec4 a_size;
attribute vec3 a_primary;
attribute vec3 a_accent;
uniform mat4 u_matrix;
uniform vec2 u_meter;
uniform vec3 u_eye;
varying mediump vec3 v_color;
varying mediump float v_film;
void main(){
  float c=cos(a_pose.w),s=sin(a_pose.w);
  mat2 rotation=mat2(c,s,-s,c);
  vec2 offset=rotation*(a_local.xy*a_size.xy);
  vec3 pos=a_pose.xyz+vec3(offset*u_meter,a_local.z*a_size.z);
  gl_Position=u_matrix*vec4(pos,1.0);
  vec3 n=normalize(a_normal/a_size.xyz);
  n.xy=rotation*n.xy;
  vec3 eye=normalize(vec3((u_eye.xy-pos.xy)/u_meter,u_eye.z-pos.z));
  vec3 lamp=normalize(vec3(-.36,.48,.82));
  vec3 color=a_material.a>2.5?a_material.rgb:a_material.a>1.5?a_accent:a_material.a>.5?a_primary:a_material.rgb;
  float light=.61+.28*max(0.,dot(n,lamp))+.12*max(n.z,0.)+.055*max(0.,dot(n,vec3(.67,-.70,.22)));
  float shine=.095*pow(max(0.,dot(n,normalize(lamp+eye))),20.);
  v_color=color*(light*a_size.w)*(.94+.06*clamp(a_local.z,0.,1.))+vec3(shine);
  if (a_material.a>3.5) v_color=color;
  v_film=a_material.a>2.5 && a_material.a<3.5?.055+.14*pow(max(0.,1.-abs(dot(n,eye))),3.):0.;
}`;
const FS = `precision mediump float; varying mediump vec3 v_color; varying mediump float v_film;
void main(){
  if(v_film>0.){
    vec2 p=mod(floor(gl_FragCoord.xy),4.);
    float a=mod(p.x,2.),b=mod(p.y,2.);
    float threshold=(4.*mod(2.*a+3.*b,4.)+mod(2.*floor(p.x*.5)+3.*floor(p.y*.5),4.)+.5)/16.;
    if(threshold>v_film)discard;
  }
  gl_FragColor=vec4(v_color,1.);
}`;
function inFrustum(chunk, M) {
  const { center: p, extent: e } = chunk;
  for (let axis = 0; axis < 3; axis++)
    for (const s of [-1, 1]) {
      const x = M[3] + s * M[axis],
        y = M[7] + s * M[axis + 4],
        z = M[11] + s * M[axis + 8];
      if (
        x * p[0] +
          y * p[1] +
          z * p[2] +
          M[15] +
          s * M[axis + 12] +
          Math.abs(x) * e[0] +
          Math.abs(y) * e[1] +
          Math.abs(z) * e[2] <
        0
      )
        return false;
    }
  return true;
}

// Only the visible sections of shelving submit instances. Both viewing distances
// use indexed solid models, including on WebGL 1 without the instancing extension.
export function createMarketRenderer(gl, compile) {
  const program = compile(gl, VS, FS);
  const ext = gl.drawElementsInstanced ? null : gl.getExtension("ANGLE_instanced_arrays");
  const instanced = Boolean(gl.drawElementsInstanced || ext);
  const divisor = (a, v) =>
    gl.vertexAttribDivisor ? gl.vertexAttribDivisor(a, v) : ext.vertexAttribDivisorANGLE(a, v);
  const attrs = ["local", "normal", "material", "pose", "size", "primary", "accent"].map((n) => program.att("a_" + n));
  const upload = (target, data) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  };
  const models = new Map();
  let chunks = [],
    meter = [1, -1];
  const release = () => {
    for (const c of chunks)
      for (const g of c.groups)
        if (g.buffer) {
          gl.deleteBuffer(g.buffer);
          g.buffer = null;
        }
    chunks = [];
  };
  function modelFor(name, detail) {
    const id = name + Number(detail);
    if (models.has(id)) return models.get(id);
    const m = name.startsWith("station/") ? stationModel(name, detail) : marketProductModel(name, detail);
    const gpu = {
      vertices: upload(gl.ARRAY_BUFFER, m.vertices),
      elems: upload(gl.ELEMENT_ARRAY_BUFFER, m.indices),
      count: m.indices.length,
      indexType: m.indices.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    };
    models.set(id, gpu);
    return gpu;
  }
  const attr = (a, n, stride, offset) => gl.vertexAttribPointer(a, n, gl.FLOAT, false, stride * 4, offset * 4);
  return {
    set(data) {
      release();
      chunks = (data?.chunks || []).map((chunk) => ({
        ...chunk,
        groups: chunk.groups.map((group) => ({ ...group, buffer: null }))
      }));
      meter = data?.meter || meter;
    },
    draw(M, eye) {
      if (!eye) return;
      const visible = [];
      for (const c of chunks)
        if (inFrustum(c, M)) {
          const d = Math.hypot(
            ...c.center.map(
              (v, i) => Math.max(0, Math.abs(v - eye[i]) - c.extent[i]) / (i === 2 ? 1 : Math.abs(meter[i]))
            )
          );
          if (d < 100) visible.push([c, d]);
        }
      if (!visible.length) return;
      gl.useProgram(program.p);
      gl.uniformMatrix4fv(program.loc("u_matrix"), false, M);
      gl.uniform2fv(program.loc("u_meter"), meter);
      gl.uniform3fv(program.loc("u_eye"), eye);
      gl.depthMask(true);
      const cull = gl.isEnabled(gl.CULL_FACE);
      gl.disable(gl.CULL_FACE);
      for (const a of attrs.slice(0, 3)) gl.enableVertexAttribArray(a);
      for (const a of attrs.slice(3))
        if (instanced) {
          gl.enableVertexAttribArray(a);
          divisor(a, 1);
        } else gl.disableVertexAttribArray(a);
      for (const [c, distance] of visible)
        for (const group of c.groups) {
          // A front-facing item remains wherever a row has a vacancy. Omit only the
          // stock directly behind a facing when viewed from a distant, aisle-height eye.
          if (group.behind && distance > 9 && eye[2] < c.center[2] + c.extent[2] + 1) continue;
          const model = modelFor(group.model, distance < 3.4),
            data = group.instances,
            count = data.length / STOCK_STRIDE;
          gl.bindBuffer(gl.ARRAY_BUFFER, model.vertices);
          attr(attrs[0], 3, 10, 0);
          attr(attrs[1], 3, 10, 3);
          attr(attrs[2], 4, 10, 6);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.elems);
          if (instanced) {
            group.buffer ||= upload(gl.ARRAY_BUFFER, data);
            gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
            attr(attrs[3], 4, STOCK_STRIDE, 0);
            attr(attrs[4], 4, STOCK_STRIDE, 4);
            attr(attrs[5], 3, STOCK_STRIDE, 8);
            attr(attrs[6], 3, STOCK_STRIDE, 11);
            if (gl.drawElementsInstanced)
              gl.drawElementsInstanced(gl.TRIANGLES, model.count, model.indexType, 0, count);
            else ext.drawElementsInstancedANGLE(gl.TRIANGLES, model.count, model.indexType, 0, count);
          } else
            for (let i = 0; i < data.length; i += STOCK_STRIDE) {
              gl.vertexAttrib4fv(attrs[3], data.subarray(i, i + 4));
              gl.vertexAttrib4fv(attrs[4], data.subarray(i + 4, i + 8));
              gl.vertexAttrib3fv(attrs[5], data.subarray(i + 8, i + 11));
              gl.vertexAttrib3fv(attrs[6], data.subarray(i + 11, i + 14));
              gl.drawElements(gl.TRIANGLES, model.count, model.indexType, 0);
            }
        }
      if (instanced) for (const a of attrs.slice(3)) divisor(a, 0);
      for (const a of attrs) gl.disableVertexAttribArray(a);
      if (cull) gl.enable(gl.CULL_FACE);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
    remove() {
      release();
      for (const m of models.values()) {
        gl.deleteBuffer(m.vertices);
        gl.deleteBuffer(m.elems);
      }
      gl.deleteProgram(program.p);
    }
  };
}
