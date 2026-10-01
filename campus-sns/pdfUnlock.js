/* ──────────────────────────────────────────────
   PDF パスワード解除 (qpdf WebAssembly, クライアント完結)
   ・qpdf 12 の wasm ビルド @neslinesli93/qpdf-wasm@0.3.0 (ISC) を jsdelivr から読み込む
   ・JS は SRI(integrity)、wasm は SHA-256 を検証してから実行する
   ・ファイルとパスワードは端末内でのみ扱い、サーバーには送らない
   ・「開くためのパスワード」は正しいパスワードが必要（総当たり等はしない）。
     印刷・コピー禁止などの権限パスワードだけのPDFはパスワードなしで解除できる
   ────────────────────────────────────────────── */
const QPDF_CDN = "https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist";
const QPDF_JS_SRI = "sha384-viHHfnvZlwDzjAQCrTUX3UR1zDr3OW9ItyLOqwH2wTHYHXWK8NdKi5LFp++BT8NL";
const QPDF_WASM_SHA256 = "abd933f4ccace4f732999381b21aec8b7e3726f18a5b167fafd57f88dd440876";

let factoryPromise = null;
let wasmPromise = null;

function loadFactory() {
  if (factoryPromise) return factoryPromise;
  factoryPromise = new Promise((resolve, reject) => {
    const prev = window.Module;
    const s = document.createElement("script");
    s.src = `${QPDF_CDN}/qpdf.js`;
    s.integrity = QPDF_JS_SRI;
    s.crossOrigin = "anonymous";
    s.onload = () => {
      // qpdf.js はグローバル `Module` にファクトリを置くので、取り出して元に戻す
      const factory = window.Module;
      if (prev === undefined) { try { delete window.Module; } catch { window.Module = undefined; } }
      else window.Module = prev;
      if (typeof factory === "function") resolve(factory);
      else reject(new Error("qpdf factory not found"));
    };
    s.onerror = () => reject(new Error("qpdf.js load failed"));
    document.head.appendChild(s);
  }).catch(e => { factoryPromise = null; throw e; });
  return factoryPromise;
}

async function sha256Hex(buf) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

function loadWasm() {
  if (wasmPromise) return wasmPromise;
  wasmPromise = (async () => {
    const r = await fetch(`${QPDF_CDN}/qpdf.wasm`);
    if (!r.ok) throw new Error(`qpdf.wasm HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    if ((await sha256Hex(buf)) !== QPDF_WASM_SHA256) throw new Error("qpdf.wasm integrity mismatch");
    return buf;
  })().catch(e => { wasmPromise = null; throw e; });
  return wasmPromise;
}

/** 先に読み込んでおく（パスワード入力中などに呼ぶと体感が速い） */
export function preloadQpdf() {
  return Promise.all([loadFactory(), loadWasm()]).catch(() => {});
}

/**
 * PDF に暗号化辞書(/Encrypt)があるか。トレーラ / xref ストリーム辞書は圧縮されないので
 * バイト列の単純検索で判定できる（本文中の偶然の一致は、復号=再保存になるだけで無害）。
 */
export function hasEncryption(bytes) {
  const pat = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
  const n = bytes.length - pat.length;
  outer: for (let i = 0; i <= n; i++) {
    if (bytes[i] !== 0x2f) continue;
    for (let j = 1; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
    return true;
  }
  return false;
}

export class PdfPasswordError extends Error {
  constructor() { super("invalid password"); this.name = "PdfPasswordError"; }
}

/**
 * 暗号化を外した PDF のバイト列を返す。
 * password 省略時は空パスワード（= 権限パスワードのみのPDF）で試す。
 * パスワード違いは PdfPasswordError を投げる。
 */
export async function decryptPdf(bytes, password = "") {
  const [factory, wasmBinary] = await Promise.all([loadFactory(), loadWasm()]);
  // このビルドは print/printErr オプションを無視し、ファクトリ呼び出し時に
  // console.log / console.error を bind して出力先に固定する。そこで呼び出しの同期部分の間だけ
  // console を差し替え、このインスタンスの出力を log に集める（警告の大量出力も抑えられる）
  let log = "";
  const capture = (...a) => { log += a.join(" ") + "\n"; };
  const origLog = console.log, origErr = console.error;
  console.log = capture; console.error = capture;
  let pending;
  try { pending = factory({ wasmBinary: wasmBinary.slice(0), noInitialRun: true }); }
  finally { console.log = origLog; console.error = origErr; }
  const qpdf = await pending;
  qpdf.FS.writeFile("/in.pdf", bytes);
  const args = ["--decrypt"];
  if (password) args.push(`--password=${password}`);
  args.push("/in.pdf", "/out.pdf");
  let code;
  try { code = qpdf.callMain(args); }
  catch (e) { code = typeof e?.status === "number" ? e.status : 2; }
  // qpdf: 0=成功, 3=警告付き成功（壊れ気味の xref を修復した等。出力は有効）, 2=エラー
  if (code !== 0 && code !== 3) {
    if (/invalid password/i.test(log)) throw new PdfPasswordError();
    throw new Error(`qpdf failed (${code}): ${log.trim().split("\n").slice(-1)[0] || ""}`);
  }
  const out = qpdf.FS.readFile("/out.pdf");
  try { qpdf.FS.unlink("/in.pdf"); qpdf.FS.unlink("/out.pdf"); } catch {}
  return out;
}
