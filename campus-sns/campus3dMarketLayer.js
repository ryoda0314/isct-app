import { marketProductModel } from "./campus3dMarketProducts.js";
import { marketRGB } from "./campus3dMarketGeometry.js";
import { stationModel } from "./campus3dStationModels.js";
import { streetModel } from "./campus3dStreetModels.js";

export const STOCK_STRIDE = 14;
const streetSilhouette = /^street\/(shop|flank|entrance|pole|lamp)(?:\/|$)/;
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
uniform float u_shop;
uniform float u_leaf;
varying mediump vec3 v_color;
varying mediump float v_film;
varying mediump float v_finish;
varying highp vec3 v_metres;
varying highp vec3 v_localEye;
varying mediump vec3 v_normalStreet;
void main(){
  float c=cos(a_pose.w),s=sin(a_pose.w);
  mat2 rotation=mat2(c,s,-s,c);
  vec2 localXY=a_local.xy*a_size.xy;
  mat2 hinge=mat2(1.,0.,0.,1.);
  if(u_leaf>.5){
    float distanceToDoor=length((u_eye.xy-a_pose.xy)/u_meter);
    float open=1.-smoothstep(1.1,2.48,distanceToDoor);
    if(u_leaf>1.5){
      float angle=1.49*open;
      hinge=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
      vec2 jamb=vec2(-a_size.x*.50,0.);
      localXY=jamb+hinge*(localXY-jamb);
    }else localXY.x+=open*a_size.x*.97;
  }
  vec2 offset=rotation*localXY;
  vec3 pos=a_pose.xyz+vec3(offset*u_meter,a_local.z*a_size.z);
  gl_Position=u_matrix*vec4(pos,1.0);
  vec3 n=normalize(a_normal/a_size.xyz);
  n.xy=rotation*hinge*n.xy;
  vec3 toEye=vec3((u_eye.xy-pos.xy)/u_meter,u_eye.z-pos.z);
  vec3 eye=normalize(toEye);
  vec3 lamp=normalize(vec3(-.36,.48,.82));
  vec3 color=a_material.a>2.5?a_material.rgb:a_material.a>1.5?a_accent:a_material.a>.5?a_primary:a_material.rgb;
  float light=.61+.28*max(0.,dot(n,lamp))+.12*max(n.z,0.)+.055*max(0.,dot(n,vec3(.67,-.70,.22)));
  float shine=.095*pow(max(0.,dot(n,normalize(lamp+eye))),20.);
  v_color=color*(light*a_size.w)*(.94+.06*clamp(a_local.z,0.,1.))+vec3(shine);
  if (u_shop>.5) {
    vec3 localPosition=a_local*a_size.xyz+vec3(0.,1.2,0.);
    v_color=mix(v_color,color*(.78+.22*max(n.z,0.)),.39);
    float inset=smoothstep(-.24,2.9,localPosition.y)*(1.-smoothstep(2.86,3.34,localPosition.z));
    float belowEave=(1.-smoothstep(.0,.77,2.70-localPosition.z))*(1.-smoothstep(2.72,3.05,localPosition.z))*smoothstep(-.62,-.12,localPosition.y);
    v_color*=mix(vec3(1.),vec3(.76,.70,.61),inset)*(1.-.20*belowEave);
  }
  if (a_material.a>3.5 && a_material.a<4.5) v_color=color;
  v_finish=a_material.a;
  v_metres=((a_material.a>8.5 && a_material.a<9.5) || (a_material.a>14.5 && a_material.a<15.5)) ? vec3(pos.xy/u_meter,pos.z) : a_local*a_size.xyz;
  mat2 orientation=rotation*hinge;
  v_localEye=vec3(dot(toEye.xy,orientation[0]),dot(toEye.xy,orientation[1]),toEye.z);
  v_normalStreet=normalize(a_normal/a_size.xyz);
  v_film=a_material.a>2.5 && a_material.a<3.5?.055+.14*pow(max(0.,1.-abs(dot(n,eye))),3.):0.;
}`;
const FS = `precision highp float; varying mediump vec3 v_color; varying mediump float v_film;
varying mediump float v_finish;
varying highp vec3 v_metres;
varying highp vec3 v_localEye;
varying mediump vec3 v_normalStreet;
uniform vec3 u_horizon;
uniform vec3 u_zenith;
float hash21(vec2 p) {
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z);
}
float noise21(vec2 p) {
  vec2 i=floor(p), t=fract(p); t=t*t*(3.-2.*t);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),t.x),mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.)),t.x),t.y);
}
float seam(vec2 p,vec2 thickness) {
  vec2 q=abs(fract(p+.5)-.5);
  vec2 a=1.-smoothstep(thickness*.38,thickness*1.55,q);
  return max(a.x,a.y);
}
void main(){
  if(v_film>0.){
    vec2 p=mod(floor(gl_FragCoord.xy),4.);
    float a=mod(p.x,2.),b=mod(p.y,2.);
    float threshold=(4.*mod(2.*a+3.*b,4.)+mod(2.*floor(p.x*.5)+3.*floor(p.y*.5),4.)+.5)/16.;
    if(threshold>v_film)discard;
  }
  vec3 col=v_color;
  if (v_finish>4.5) {
    bool backed=v_finish<5.5;
    bool frosted=v_finish>11.5 && v_finish<12.5;
    bool tinted=v_finish>15.5 && v_finish<16.5;
    bool doorPane=v_finish>19.5 && v_finish<20.5;
    bool clearPane=(v_finish>13.5 && v_finish<14.5) || tinted;
    if (backed || frosted || clearPane || doorPane) {
      vec3 view=normalize(v_localEye), normal=normalize(v_normalStreet);
      float grazing=pow(1.-clamp(abs(dot(normal,view)),0.,1.),5.);
      float elevation=reflect(-view,normal).z;
      vec3 sky=u_horizon*mix(.57,1.,smoothstep(-.46,.15,elevation));
      sky=mix(sky,u_zenith,smoothstep(.03,.85,elevation));
      if (doorPane) {
        // The deep reveal cuts off much of the sky at these east-facing doors.
        vec3 reflected=reflect(-view,normal);
        float sill=smoothstep(-.08,.055,reflected.z);
        vec3 exterior=mix(u_horizon*.24,sky*.83,sill);
        float underArch=1.-smoothstep(.25,.86,reflected.z);
        gl_FragColor=vec4(mix(col*.56,exterior,(.27+.32*grazing)*underArch),1.);
      } else if (clearPane) {
        float alpha=tinted ? .25+.30*grazing : .052+.38*grazing;
        gl_FragColor=vec4(mix(sky,col,tinted ? .22 : .12)*alpha,alpha);
      } else {
        float daylight=dot(u_horizon,vec3(.2126,.7152,.0722));
        vec3 glass=col*(.39+.61*daylight);
        vec3 surface=frosted ? mix(glass,mix(u_horizon,u_zenith,.3),.11) : mix(glass,sky,.14+.27*grazing);
        gl_FragColor=vec4(surface,1.);
      }
      return;
    }
    vec3 an=abs(v_normalStreet);
    vec2 uv=an.z>.72 ? v_metres.xy : an.x>an.y ? v_metres.yz : v_metres.xz;
    if (v_finish>16.5) {
      // Weathering in metres, continuous across a pier and around carved reveals.
      float metresPerPixel = length(v_localEye) * .0015;
      float closeGrain=1.-smoothstep(.004,.036,metresPerPixel);
      float mass=noise21(uv*1.8+7.);
      float breakup=noise21(uv*11.4+2.2);
      float granules=noise21(uv*88.);
      if (v_finish>26.5) {
        vec3 n=normalize(v_normalStreet), eye=normalize(v_localEye);
        vec2 metalUV=v_metres.xz+vec2(.43*v_metres.y,.15*v_metres.y);
        float casting=noise21(metalUV*61.)*.64+noise21(metalUV*174.)*.36;
        float streak=noise21(metalUV*vec2(174.,22.)+casting*.34);
        float wear=smoothstep(.50,.87,.56*casting+.44*streak);
        vec2 grainUV=metalUV*268.;
        float grain=noise21(grainUV);
        vec2 grainSlope=vec2(noise21(grainUV+vec2(.37,0.)),noise21(grainUV+vec2(0.,.37)))-grain;
        n=normalize(n+.32*vec3(grainSlope.x,.35*grainSlope.x,grainSlope.y));
        vec3 reflection=reflect(-eye,n);
        float skylight=smoothstep(-.36,.76,reflection.z);
        col*=.63+.20*smoothstep(-.6,.68,n.z)+.27*casting+.16*streak+.068*grain;
        col=mix(col,col*vec3(.87,1.08,1.035),wear*.52);
        vec3 halfVector=normalize(eye+normalize(vec3(-.52,-.46,.82)));
        float polish=pow(max(0.,dot(n,halfVector)),18.)*(.13+.16*wear);
        float exposure=smoothstep(.14,.53,dot(col,vec3(.25,.64,.11)));
        col+=u_horizon*exposure*(polish+skylight*(.039+.064*wear+.052*smoothstep(.65,.85,grain)));
      } else if (v_finish>25.5) {
        float twigs=noise21(uv*vec2(16.,30.))+noise21(uv*39.)*.45;
        col*=.71+.25*mass+.45*breakup+.21*step(.93,twigs);
        col+=vec3(.035,.045,.015)*smoothstep(.68,.84,granules);
      } else if (v_finish>24.5) {
        vec3 reflected=reflect(-normalize(v_localEye),normalize(v_normalStreet));
        float polish=.12+.16*pow(1.-abs(dot(normalize(v_localEye),normalize(v_normalStreet))),3.);
        float horizon=smoothstep(-.16,.28,reflected.z);
        vec3 garden=mix(vec3(.075,.095,.068),u_horizon*.82,horizon);
        col=mix(col*(.83+.15*mass+.12*breakup),garden,polish);
        float quartz=noise21(uv*273.0);
        col+=vec3(.074)*closeGrain*(.27*granules+.73*smoothstep(.43,.91,quartz));
      } else if (v_finish>23.5) {
        vec3 n=normalize(v_normalStreet),eye=normalize(v_localEye);
        float patinated=smoothstep(.53,.87,mass*.48+breakup*.42+granules*.10);
        col=mix(col*(.76+.22*mass+.19*breakup+.10*granules),col*vec3(.91,1.20,1.14),patinated*.83);
        vec3 halfVector=normalize(eye+normalize(vec3(-.45,-.45,.78)));
        float highlight=pow(max(0.,dot(n,halfVector)),21.)*(.12+.07*breakup);
        col+=u_horizon*(highlight+.032*pow(1.-abs(dot(eye,n)),2.));
      } else if (v_finish>22.5) {
        vec2 holes=uv/vec2(.016,.014);
        holes.x+=.5*mod(floor(holes.y),2.);
        float hole=1.-smoothstep(.18,.30,length(fract(holes)-.5));
        col*=.83+.10*mass+closeGrain*(.10-.5*hole);
      } else if (v_finish>21.5) {
        vec2 form=uv/vec2(1.8,.9);
        float joint=seam(form,vec2(.003,.006));
        vec2 tie=(fract(uv/vec2(.9,.45))-.5)*vec2(.9,.45);
        float socket=1.-smoothstep(.010,.017,length(tie));
        float streak=noise21(uv*vec2(7.8,.86)+1.25*mass);
        col*=.84+.21*mass+.12*breakup-.13*streak-.20*joint-.28*socket*closeGrain;
      } else if (v_finish<18.5) {
        bool wall=v_finish<17.5;
        vec2 course=uv/vec2(.89,.535);
        course.x+=.5*mod(floor(course.y),2.);
        float joint=wall ? seam(course,vec2(.006,.012)) : 0.;
        float block=wall ? hash21(floor(course)) : .53;
        float wash=noise21(uv*vec2(4.6,1.15)+1.35*mass)+.39*breakup+.09*granules;
        float bloom=smoothstep(.84,1.05,wash);
        float trail=smoothstep(.61,.83,noise21(uv*vec2(11.7,1.6)+mass*1.3));
        col*=.83+.20*mass+.11*block-.10*trail;
        col=mix(col,col*.78+u_horizon*vec3(.53,.51,.46),bloom*(wall?.17:.40));
        col+=vec3(.044)*joint;
        col*=1.+closeGrain*((granules-.48)*.29-.15*smoothstep(.72,.95,noise21(uv*174.)));
      } else {
        float flecks=noise21(uv*145.);
        col*=.84+.19*mass+.12*breakup;
        col+=closeGrain*vec3((flecks-.5)*.26+.13*smoothstep(.69,.9,granules)-.13*smoothstep(.68,.87,1.-granules));
        if(v_finish>20.5) col*=.85+.29*noise21(uv*39.);
      }
    } else if (v_finish<7.5) {
      bool bricks=v_finish<6.5;
      vec2 course=uv/(bricks?vec2(.205,.071):vec2(.185,.066));
      if(bricks)course.x+=.5*mod(floor(course.y),2.);
      float mortar=seam(course,vec2(.018,.044));
      col*=.96+.069*hash21(floor(course))+.025*noise21(uv*27.);
      col=mix(col,bricks?vec3(.54,.49,.44):col*.77,mortar*.60);
    } else if(v_finish<8.5) {
      col*=.94+.058*noise21(uv*1.3)+.065*noise21(uv*43.);
    } else if(v_finish<9.5) {
      uv=v_metres.xy;
      float grit=noise21(uv*123.);
      float aggregate=.77+.14*noise21(uv*2.9)+.26*grit+.095*noise21(uv*37.);
      col=col*aggregate+vec3(.095)*smoothstep(.70,.94,grit);
    } else if(v_finish<10.5) {
      col*=.94+.042*noise21(uv*61.)+.03*cos(uv.x*86.);
    } else if(v_finish<11.5) {
      col*=.87+.18*noise21(uv*vec2(13.,2.4))+.06*noise21(uv*vec2(66.,3.8));
    } else if (v_finish>14.5) {
      vec2 p=vec2(dot(uv,vec2(.983,-.184)),dot(uv,vec2(.184,.983)));
      float j=seam(p/vec2(.48,.63),vec2(.004,.006));
      col*=.83+.16*noise21(p*65.)+.12*hash21(floor(p/vec2(.48,.63)))+.06*noise21(p*117.)-.24*j;
    } else if(v_finish>12.5) {
      float joint=seam(uv/vec2(.60,.34),vec2(.007,.012));
      col*=.91+.11*noise21(uv*29.)+.058*hash21(floor(uv/vec2(.60,.34)))-.13*joint;
    }
  }
  gl_FragColor=vec4(col,1.);
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
    const makeModel = name.startsWith("street/") ? streetModel : name.startsWith("station/") ? stationModel : marketProductModel;
    const m = makeModel(name, detail);
    const gpu = {
      vertices: upload(gl.ARRAY_BUFFER, m.vertices),
      elems: upload(gl.ELEMENT_ARRAY_BUFFER, m.indices),
      opaqueCount: m.opaqueCount,
      paneCount: m.indices.length - m.opaqueCount,
      paneOffset: m.opaqueCount * m.indices.BYTES_PER_ELEMENT,
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
        streetscape: chunk.groups.some(g => streetSilhouette.test(g.model)),
        groups: chunk.groups.map((group) => ({ ...group, distant: streetSilhouette.test(group.model), buffer: null }))
      }));
      meter = data?.meter || meter;
    },
    draw(M, eye, sky) {
      if (!eye) return;
      const visible = [];
      for (const c of chunks)
        if (inFrustum(c, M)) {
          const d = Math.hypot(
            ...c.center.map(
              (v, i) => Math.max(0, Math.abs(v - eye[i]) - c.extent[i]) / (i === 2 ? 1 : Math.abs(meter[i]))
            )
          );
          if (d < 100 || (c.streetscape && d < 235)) visible.push([c, d]);
        }
      if (!visible.length) return;
      gl.useProgram(program.p);
      gl.uniformMatrix4fv(program.loc("u_matrix"), false, M);
      gl.uniform2fv(program.loc("u_meter"), meter);
      gl.uniform3fv(program.loc("u_eye"), eye);
      gl.uniform3fv(program.loc("u_horizon"), sky?.horizon ?? [.78, .81, .83]);
      gl.uniform3fv(program.loc("u_zenith"), sky?.zenith ?? [.47, .61, .76]);
      const shopUniform = program.loc("u_shop");
      const leafUniform = program.loc("u_leaf");
      let previousLeaf = null;
      let shadedFront = null;
      gl.depthMask(true);
      const cull = gl.isEnabled(gl.CULL_FACE);
      gl.disable(gl.CULL_FACE);
      for (const a of attrs.slice(0, 3)) gl.enableVertexAttribArray(a);
      for (const a of attrs.slice(3))
        if (instanced) {
          gl.enableVertexAttribArray(a);
          divisor(a, 1);
        } else gl.disableVertexAttribArray(a);
      function drawGroup(group, model, indexCount, byteOffset, start, instanceCount) {
        const data = group.instances;
        const front = group.model.startsWith("street/shop/") || group.model.startsWith("street/flank/");
        const leaf = group.model === "street/leaf/curry" ? 2 : group.model === "street/leaf/family" ? 1 : 0;
        if (leaf !== previousLeaf) {
          gl.uniform1f(leafUniform, leaf);
          previousLeaf = leaf;
        }
        if (shadedFront !== front) {
          gl.uniform1f(shopUniform, front ? 1 : 0);
          shadedFront = front;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vertices);
        attr(attrs[0], 3, 10, 0);
        attr(attrs[1], 3, 10, 3);
        attr(attrs[2], 4, 10, 6);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.elems);
        if (instanced) {
          group.buffer ||= upload(gl.ARRAY_BUFFER, data);
          gl.bindBuffer(gl.ARRAY_BUFFER, group.buffer);
          attr(attrs[3], 4, STOCK_STRIDE, start);
          attr(attrs[4], 4, STOCK_STRIDE, start + 4);
          attr(attrs[5], 3, STOCK_STRIDE, start + 8);
          attr(attrs[6], 3, STOCK_STRIDE, start + 11);
          if (gl.drawElementsInstanced)
            gl.drawElementsInstanced(gl.TRIANGLES, indexCount, model.indexType, byteOffset, instanceCount);
          else ext.drawElementsInstancedANGLE(gl.TRIANGLES, indexCount, model.indexType, byteOffset, instanceCount);
        } else
          for (let i = start; i < start + STOCK_STRIDE * instanceCount; i += STOCK_STRIDE) {
            gl.vertexAttrib4fv(attrs[3], data.subarray(i, i + 4));
            gl.vertexAttrib4fv(attrs[4], data.subarray(i + 4, i + 8));
            gl.vertexAttrib3fv(attrs[5], data.subarray(i + 8, i + 11));
            gl.vertexAttrib3fv(attrs[6], data.subarray(i + 11, i + 14));
            gl.drawElements(gl.TRIANGLES, indexCount, model.indexType, byteOffset);
          }
      }
      const panes = [];
      for (const [c, distance] of visible)
        for (const group of c.groups) {
          if (distance >= 100 && !group.distant) continue;
          // The rear stock in a row is hidden by the facing from a distant, aisle-height eye.
          if (group.behind && distance > 9 && eye[2] < c.center[2] + c.extent[2] + 1) continue;
          const model = modelFor(group.model, distance < (group.model.startsWith("street/") ? 16 : 3.4));
          const data = group.instances;
          if (model.opaqueCount) drawGroup(group, model, model.opaqueCount, 0, 0, data.length / STOCK_STRIDE);
          if (model.paneCount)
            for (let i = 0; i < data.length; i += STOCK_STRIDE) {
              const depth = M[3] * data[i] + M[7] * data[i + 1] + M[11] * data[i + 2];
              panes.push({ group, model, start: i, depth });
            }
        }
      if (panes.length) {
        // Stock and window frames already occupy the depth buffer when glass is blended over them.
        panes.sort((a, b) => b.depth - a.depth);
        const blend = gl.isEnabled(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (const { group, model, start } of panes)
          drawGroup(group, model, model.paneCount, model.paneOffset, start, 1);
        gl.depthMask(true);
        if (!blend) gl.disable(gl.BLEND);
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
