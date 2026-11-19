import { BOOK_STRIDE, SPINE_TITLES, bookModel, rackBooks } from "./campus3dLibraryBooks.js";

const BATCH_SIZE = 24;
const vertexShader = instanced => `
attribute vec3 a_model;
attribute vec4 a_surface;
${instanced ? `attribute vec4 a_pose;
attribute vec4 a_size;
attribute vec4 a_binding;` : `attribute float a_slot;
uniform vec4 u_books[${BATCH_SIZE*3}];`}
uniform mat4 u_matrix;
uniform vec3 u_origin;
uniform vec2 u_along;
uniform vec2 u_across;
uniform float u_hand;
varying highp vec4 v_surface;
varying mediump vec3 v_color;
varying highp vec2 v_print;
void main() {
  ${instanced ? "" : `int i = int(a_slot);
  vec4 a_pose = u_books[i], a_size = u_books[i+1], a_binding = u_books[i+2];`}
  float x = a_pose.x + a_model.x * a_size.x * sign(a_size.y) * u_hand + a_model.z * a_pose.w;
  float y = a_pose.y + a_model.y * a_size.y;
  gl_Position = u_matrix * vec4(u_origin.xy + x*u_along + y*u_across,
      u_origin.z + a_pose.z + a_model.z*a_size.z, 1.0);
  v_surface = a_surface;
  v_color = a_binding.rgb;
  v_print = vec2(a_binding.a, a_size.w);
}`;
const FS = `
precision highp float;
uniform sampler2D u_letters;
uniform vec4 u_highlight;
uniform float u_legible;
varying highp vec4 v_surface;
varying mediump vec3 v_color;
varying highp vec2 v_print;
float ink(float tile, vec2 xy) {
  vec2 cell = vec2(mod(tile, 8.0), floor(tile / 8.0));
  return texture2D(u_letters, (cell + clamp(xy, 0.015, 0.985)) / 8.0).a;
}
void main() {
  vec2 uv = v_surface.xy;
  float face = v_surface.z;
  vec3 color = v_color;
  vec2 printID = floor(v_print + .5);
  bool journal = printID.x >= 32.0;
  vec3 letters = dot(color, vec3(.299,.587,.114)) > .56 ? vec3(.16,.18,.18) : journal ? vec3(.91,.8,.57) : vec3(.94,.92,.86);
  if (face > 1.5 && face < 3.5) {
    float aged = fract(printID.y * .618);
    color = mix(vec3(.79,.75,.65), vec3(.96,.94,.86), aged);
    if (u_legible > .5) color *= .98 + .02 * cos((face < 2.5 ? uv.x : uv.y)*180.0);
  } else if (face < .5) {
    float design = mod(printID.x, 8.0);
    if (journal && ((uv.y > .858 && uv.y < .872) || (uv.y > .292 && uv.y < .303))) color = mix(color, letters, .8);
    if (!journal && design < 3.0 && uv.y < .27) color = mix(color, vec3(.17,.31,.39), .56);
    bool label = uv.x > .11 && uv.x < .89 && uv.y > .052 && uv.y < .197;
    if (label) {
      color = uv.y > .165 ? (journal ? vec3(.52,.55,.48) : vec3(.46,.57,.64)) : vec3(.93,.91,.82);
      if (u_legible > .5 && uv.y > .079 && uv.y < .153) {
        float pos = clamp((uv.x-.12)/.76, 0.0, .999)*3.0;
        float n = mod(floor(printID.y / pow(10.0, 2.0-floor(pos)) + .0001), 10.0);
        color = mix(color, vec3(.18), ink(48.0+n, vec2(fract(pos), 1.0-(uv.y-.079)/.074)));
      }
    } else if (u_legible > .5 && uv.y > .34 && uv.y < (journal ? .84 : .92)) {
      float top = journal ? .84 : .92;
      color = mix(color, letters, ink(printID.x, vec2(uv.x, (top-uv.y)/(top-.34))));
    }
    color *= .93 + .07 * sin(3.14159 * uv.x);
  } else if (face < 1.5) {
    if (uv.x < .065) color *= .83;
    if (!journal && mod(printID.x, 8.0) < 3.0 && uv.y < .27) color = mix(color, vec3(.17,.31,.39), .56);
  }
  gl_FragColor = vec4(mix(color * v_surface.w, u_highlight.rgb, u_highlight.a), 1.0);
}`;

// 透明な升に印字だけを描く。紙・表紙・背・ラベルの下地は立体の材質。
function letterTexture(gl) {
  const canvas = document.createElement("canvas");
  const w = 64, h = 128;
  canvas.width = 8 * w; canvas.height = 8 * h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const [i, title] of [...SPINE_TITLES, ..."0123456789"].entries()) {
    ctx.save();
    ctx.translate((i % 8 + .5)*w, (Math.floor(i/8)+.5)*h);
    if (i >= 48) {
      ctx.font = "bold 86px sans-serif"; ctx.fillText(title, 0, 2);
    } else if (/^[A-Za-z]/.test(title)) {
      ctx.rotate(-Math.PI/2); ctx.font = i % 2 ? "bold 25px serif" : "600 24px sans-serif";
      ctx.fillText(title, 0, 0, h-12);
    } else {
      const line = Math.min(30, (h-12)/title.length);
      ctx.scale(1.28, 1);
      ctx.font = `${i%3 ? "600" : "bold"} ${line}px "${i%2 ? "Yu Gothic" : "Yu Mincho"}", sans-serif`;
      [...title].forEach((ch,j) => ctx.fillText(ch,0,(j-(title.length-1)/2)*line));
    }
    ctx.restore();
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,ctx.getImageData(0,0,canvas.width,canvas.height).data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  return t;
}

function inView(r, M) {
  const [x,y,z] = r.center;
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1,1]) {
    const a = M[3]+sign*M[axis], b = M[7]+sign*M[axis+4], c = M[11]+sign*M[axis+8];
    const extent = Math.abs(a)*r.extent[0] + Math.abs(b)*r.extent[1] + Math.abs(c)*r.extent[2];
    if (a*x+b*y+c*z+M[15]+sign*M[axis+12] < -extent) return false;
  }
  return true;
}

export function createBookRenderer(gl, compile) {
  const ext = gl.drawElementsInstanced ? null : gl.getExtension("ANGLE_instanced_arrays");
  const instanced = Boolean(gl.drawElementsInstanced || ext);
  const prog = compile(gl, vertexShader(instanced), FS);
  const divisor = (loc,n) => gl.vertexAttribDivisor ? gl.vertexAttribDivisor(loc,n) : ext.vertexAttribDivisorANGLE(loc,n);
  const buffer = (target, data) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target,b); gl.bufferData(target,data,gl.STATIC_DRAW); return b;
  };
  const models = [false, true].map(detail => {
    const m = bookModel(detail);
    let { vertices,indices } = m;
    if (!instanced) {
      // Fixed-size indexed batches on WebGL 1 hardware without instancing.
      const vertexCount = m.vertices.length/7;
      vertices = new Float32Array(BATCH_SIZE*vertexCount*8);
      indices = new Uint16Array(BATCH_SIZE*m.indices.length);
      for (let slot=0;slot<BATCH_SIZE;slot++) {
        for (let i=0;i<vertexCount;i++) {
          const out = (slot*vertexCount+i)*8;
          vertices.set(m.vertices.subarray(i*7,i*7+7),out);
          vertices[out+7] = slot*3;
        }
        indices.set(m.indices.map(i => slot*vertexCount+i),slot*m.indices.length);
      }
    }
    return { count:m.indices.length, verticesGL:buffer(gl.ARRAY_BUFFER,vertices), indicesGL:buffer(gl.ELEMENT_ARRAY_BUFFER,indices) };
  });
  gl.activeTexture(gl.TEXTURE0);
  const texture = letterTexture(gl);
  const model = prog.att("a_model"), surface = prog.att("a_surface");
  const attrs = instanced ? ["a_pose","a_size","a_binding"].map(s => prog.att(s)) : [prog.att("a_slot")];
  const uniforms = Object.fromEntries(["matrix","letters","origin","along","across","hand","highlight","legible"].map(name => [name,prog.loc("u_"+name)]));
  const batchUniform = instanced ? null : prog.loc("u_books[0]");
  let racks = [];
  function release() {
    for (const r of racks) if (r.buffer) { gl.deleteBuffer(r.buffer); r.buffer = null; }
    racks = [];
  }
  const attr = (a,n,stride,offset) => gl.vertexAttribPointer(a,n,gl.FLOAT,false,stride*4,offset*4);
  return {
    set(list) { release(); racks = (list || []).map(r => ({ ...r, buffer:null, count:null })); },
    draw(M, eye) {
      if (!eye) return;
      const visible = racks.filter(r => inView(r,M));
      if (!visible.length) return;
      gl.useProgram(prog.p); gl.uniformMatrix4fv(uniforms.matrix,false,M);
      gl.depthMask(true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture); gl.uniform1i(uniforms.letters,0);
      [model,surface,...attrs].forEach(a => gl.enableVertexAttribArray(a));
      const cull = gl.isEnabled(gl.CULL_FACE);
      gl.disable(gl.CULL_FACE);
      if (instanced) attrs.forEach(a => divisor(a,1));
      let previousModel = null;
      for (const r of visible) {
        const dx = Math.max(0,Math.abs(eye[0]-r.center[0])-r.extent[0])/r.metres;
        const dy = Math.max(0,Math.abs(eye[1]-r.center[1])-r.extent[1])/r.metres;
        const dz = Math.max(0,Math.abs(eye[2]-r.center[2])-r.extent[2]);
        const distance = Math.hypot(dx,dy,dz);
        if (distance > 105 || (!r.cut && (eye[2] < r.origin[2] - 1 || eye[2] > r.origin[2] + r.height + 9))) continue;
        if (r.count == null) {
          const data = rackBooks(r);
          r.count = data.length / BOOK_STRIDE;
          if (instanced) r.buffer = buffer(gl.ARRAY_BUFFER,data);
          else r.instances = data;
        }
        const m = models[distance < 6 ? 1 : 0];
        gl.uniform3fv(uniforms.origin,r.origin);
        gl.uniform2fv(uniforms.along,r.along); gl.uniform2fv(uniforms.across,r.across);
        gl.uniform1f(uniforms.hand,r.hand); gl.uniform4fv(uniforms.highlight,r.highlight);
        gl.uniform1f(uniforms.legible,distance < 12 ? 1 : 0);
        if (previousModel !== m) {
          const stride = instanced ? 7 : 8;
          gl.bindBuffer(gl.ARRAY_BUFFER,m.verticesGL); attr(model,3,stride,0); attr(surface,4,stride,3);
          if (!instanced) attr(attrs[0],1,stride,7);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.indicesGL); previousModel = m;
        }
        if (instanced) {
          gl.bindBuffer(gl.ARRAY_BUFFER,r.buffer);
          attrs.forEach((a,i) => attr(a,4,BOOK_STRIDE,i*4));
          if (gl.drawElementsInstanced) gl.drawElementsInstanced(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0,r.count);
          else ext.drawElementsInstancedANGLE(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0,r.count);
        } else {
          for (let i=0;i<r.count;i+=BATCH_SIZE) {
            const count = Math.min(BATCH_SIZE,r.count-i);
            gl.uniform4fv(batchUniform,r.instances.subarray(i*BOOK_STRIDE,(i+count)*BOOK_STRIDE));
            gl.drawElements(gl.TRIANGLES,m.count*count,gl.UNSIGNED_SHORT,0);
          }
        }
      }
      if (instanced) attrs.forEach(a => divisor(a,0));
      [model,surface,...attrs].forEach(a => gl.disableVertexAttribArray(a));
      if (cull) gl.enable(gl.CULL_FACE);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null); gl.bindBuffer(gl.ARRAY_BUFFER,null); gl.bindTexture(gl.TEXTURE_2D,null);
    },
    remove() {
      release();
      for (const m of models) { gl.deleteBuffer(m.verticesGL); gl.deleteBuffer(m.indicesGL); }
      gl.deleteTexture(texture); gl.deleteProgram(prog.p);
    },
  };
}
