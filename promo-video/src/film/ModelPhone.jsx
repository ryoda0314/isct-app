import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// 本物らしい iPhone（3Dモデル public/film/iphone.glb を three.js で描く）。
// 本体（金属のフレーム・厚み・ボタン・カメラ）は WebGL で描き、画面の中身はこれまでどおり DOM（実際の操作動画・タップの印・通知など）。
// DOM の画面は、3Dモデルの表示部分の4隅を画面に投影した位置へ matrix3d で貼り付けるので、本体の傾きと1コマずつ一致する。
// ガラスの映り込みは、ガラスだけを別に描いて画面の上に重ねる（映り込みの明るさを不透明度にした光の層。screen 合成とほぼ同じ見え方で、
// 親に透明度や重なり順があって合成が切り離されても黒くならない）。
//
// iphone.glb は capture の段階で Blender から書き出したもの：表示部分の中心が原点、1単位 = 画面の 1px（幅 390px）、
// 正面が +Z、上が +Y。表示部分は 390x844（角丸）で、Z = 0 の面にある。

export const SCR_W = 390;
export const SCR_H = 844;
const PERSP = 2400; // これまでの CSS の perspective と同じ距離（見え方をそろえる）
const FRAME_COLOR = 0x2b3a55; // 本体の色（深い紺のチタン）

// ── 1つのタブで1つの WebGL を使い回す（端末ごとに 2D のキャンバスへ写す）──────
let shared = null;
const load = () => {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const body = new THREE.Scene();
  body.environment = env;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-0.6, 1, 1.2);
  body.add(key, new THREE.AmbientLight(0xffffff, 0.35));
  const glass = new THREE.Scene();
  glass.environment = env;
  const camera = new THREE.PerspectiveCamera((2 * Math.atan(540 / PERSP) * 180) / Math.PI, 1920 / 1080, 10, 20000);
  const handle = delayRender('iPhone の3Dモデルを読み込み中', { timeoutInMilliseconds: 120000 });
  let resolveReady;
  shared = { renderer, body, glass, camera, ready: false, bodyRoot: null, glassRoot: null, readyPromise: new Promise((r) => { resolveReady = r; }) };
  new GLTFLoader().load(staticFile('film/iphone.glb'), (gltf) => {
    const root = gltf.scene;
    const glassRoot = new THREE.Group();
    const toGlass = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material?.name || '';
      const metal = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.25, ...extra });
      if (name === '17ProMax_glass') {
        // ガラス：映り込みだけ。色 c をそのまま、不透明度を max(c) にして書く（キャンバスは乗算済みアルファなので、重ねると c + 下地×(1 − max(c))。
        // 白っぽい映り込みでは screen 合成 c + 下地×(1 − c) と同じ）
        const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4 });
        m.blending = THREE.NoBlending;
        m.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, '\tgl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);\n}');
        };
        o.material = m;
        toGlass.push(o);
      } else if (name === 'Material.001') {
        o.material = new THREE.MeshBasicMaterial({ color: 0x000000 }); // 表示部分（DOM の画面が上に乗る）
      } else if (/Black2\.001|2112\.001|Lens2\.001/.test(name)) {
        o.visible = false; // ダイナミックアイランドは DOM の画面の上に描く
      } else if (name === '17ProMax_color') {
        o.material = metal(FRAME_COLOR, 0.3);
      } else if (name === '17ProMax_color2') {
        o.material = new THREE.MeshPhysicalMaterial({ color: FRAME_COLOR, metalness: 0.35, roughness: 0.55, envMapIntensity: 1.0 }); // 背面のすりガラス
      } else if (name === '17ProMax_color3') {
        o.material = metal(0x1c2638, 0.4);
      } else if (name === '17ProMax_Black2') {
        o.material = new THREE.MeshPhysicalMaterial({ color: 0x030304, metalness: 0.2, roughness: 0.25, envMapIntensity: 1.0 }); // 画面のふち
      } else if (/Lens/.test(name)) {
        o.material = new THREE.MeshPhysicalMaterial({ color: 0x05070d, metalness: 0.6, roughness: 0.08, clearcoat: 1, envMapIntensity: 2 });
      } else if (name === '17ProMax_Logo') {
        o.material = metal(0x3a4a68, 0.15);
      } else if (o.material) {
        o.material.envMapIntensity = 1.2;
      }
    });
    toGlass.forEach((o) => { o.removeFromParent(); glassRoot.add(o); });
    shared.bodyRoot = root;
    shared.glassRoot = glassRoot;
    body.add(root);
    glass.add(glassRoot);
    shared.ready = true;
    resolveReady();
    continueRender(handle);
  }, undefined, (err) => { console.error(err); continueRender(handle); });
  return shared;
};

// 端末の置き方（x, y は画面上の中心、s は大きさ、rx/ry/rz は CSS と同じ向きの角度）→ 3D の行列
const DEG = Math.PI / 180;
const placeObject = (o, pose) => {
  o.position.set(0, 0, 0);
  o.rotation.set(-pose.rx * DEG, pose.ry * DEG, -pose.rz * DEG, 'XYZ');
  o.scale.setScalar(pose.s);
  o.updateMatrixWorld(true);
};
// カメラは端末の中心の正面（CSS の perspective-origin を端末の中心にしていたのと同じ見え方）
const placeCamera = (cam, pose, region) => {
  cam.position.set(0, 0, PERSP);
  cam.lookAt(0, 0, 0);
  if (region) {
    // 端末の中心が画面上の (x, y) に来るよう、1920x1080 の中の一部だけを描く
    cam.setViewOffset(1920, 1080, region.x - (pose.x - 960), region.y - (pose.y - 540), region.w, region.h);
  } else cam.clearViewOffset();
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
};

// 端末の座標（px、表示部分の中心が原点、y は上向き）の点 → 画面上の位置
const tmpObj = new THREE.Object3D();
const tmpCam = new THREE.PerspectiveCamera((2 * Math.atan(540 / PERSP) * 180) / Math.PI, 1920 / 1080, 10, 20000);
export const projectPoints = (pose, pts) => {
  placeObject(tmpObj, pose);
  placeCamera(tmpCam, pose, null);
  return pts.map(([x, y, z]) => {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(tmpObj.matrixWorld).project(tmpCam);
    return [((v.x + 1) / 2) * 1920 + (pose.x - 960), ((1 - v.y) / 2) * 1080 + (pose.y - 540)];
  });
};

// 長方形 (0,0)-(w,h) を4点 [左上, 右上, 右下, 左下] へ写す CSS の matrix3d
export const quadMatrix = (w, h, q) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  // 単位正方形 → 4点 の射影変換
  const dx1 = x1 - x2; const dx2 = x3 - x2; const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2; const dy2 = y3 - y2; const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1; const b = x3 - x0 + hh * x3; const c = x0;
  const d = y1 - y0 + g * y1; const e = y3 - y0 + hh * y3; const f = y0;
  // (u, v) は 0〜1。要素の px から (u, v) へは 1/w, 1/h を掛ける
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((x) => +x.toFixed(9)).join(',')})`;
};
// 端末の表示部分（DOM の画面 390x844 の左上が端末座標の (-195, 422)）の上に、高さ z で貼る板の matrix3d
export const screenMatrix = (pose, { x = 0, y = 0, w = SCR_W, h = SCR_H, z = 0 } = {}) => {
  const L = -SCR_W / 2 + x;
  const T = SCR_H / 2 - y;
  const q = projectPoints(pose, [[L, T, z], [L + w, T, z], [L + w, T - h, z], [L, T - h, z]]);
  return quadMatrix(w, h, q);
};

// 本体（またはガラス）を 2D のキャンバスに描く
const draw = (ctx, which, pose, region) => {
  const S = load();
  if (!S.ready) return;
  const { renderer, camera } = S;
  const pr = 1.5; // 少し大きく描いて縮める（輪郭をなめらかに）
  renderer.setPixelRatio(pr);
  renderer.setSize(region.w, region.h, false);
  const root = which === 'glass' ? S.glassRoot : S.bodyRoot;
  placeObject(root, pose);
  placeCamera(camera, pose, region);
  renderer.setClearColor(0x000000, 0);
  renderer.render(which === 'glass' ? S.glass : S.body, camera);
  ctx.canvas.width = region.w * pr;
  ctx.canvas.height = region.h * pr;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(renderer.domElement, 0, 0);
};

const Layer = ({ which, pose, region, style }) => {
  const ref = useRef(null);
  // モデルの読み込みが終わったら描き直す（最初の描画のときはまだ無いことがある）
  const [ready, setReady] = useState(() => load().ready);
  useEffect(() => {
    if (ready) return undefined;
    const handle = delayRender('iPhone の3Dモデルを待っています');
    load().readyPromise.then(() => { setReady(true); continueRender(handle); });
    return undefined;
  }, [ready]);
  useLayoutEffect(() => {
    const ctx = ref.current.getContext('2d');
    draw(ctx, which, pose, region);
  });
  return <canvas ref={ref} style={{ position: 'absolute', left: region.x, top: region.y, width: region.w, height: region.h, ...style }} />;
};

// 端末1台。children は 390x844 の画面の中（角丸で切る）。outside は画面の外にはみ出して描くもの（通知のバナーなど）
export const ModelPhone = ({ pose, children, outside, shadow = 1, island = true, glare = 1 }) => {
  load();
  if (pose.o <= 0.001) return null;
  const s = pose.s;
  // 描く範囲（端末の回りに余白）
  const w = Math.ceil(560 * s + 240);
  const h = Math.ceil(1000 * s + 240);
  const region = { x: Math.round(pose.x - w / 2), y: Math.round(pose.y - h / 2), w, h };
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: pose.o, pointerEvents: 'none' }}>
      <Layer which="body" pose={pose} region={region} style={{ filter: shadow > 0 ? `drop-shadow(0 ${46 * s}px ${60 * s}px rgba(14,32,48,${0.42 * shadow})) drop-shadow(0 ${12 * s}px ${16 * s}px rgba(14,32,48,${0.22 * shadow}))` : undefined }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: SCR_W, height: SCR_H, transformOrigin: '0 0', transform: screenMatrix(pose), borderRadius: 54, overflow: 'hidden', background: '#000' }}>
        {children}
        {island && <div style={{ position: 'absolute', top: 15, left: SCR_W / 2 - 46, width: 92, height: 27, borderRadius: 14, background: '#000', zIndex: 100 }} />}
      </div>
      {outside && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: SCR_W, height: SCR_H, transformOrigin: '0 0', transform: screenMatrix(pose) }}>
          <div style={{ position: 'absolute', left: -12, top: -12 }}>{outside}</div>
        </div>
      )}
      {glare > 0 && <Layer which="glass" pose={pose} region={region} style={{ opacity: glare }} />}
    </div>
  );
};
