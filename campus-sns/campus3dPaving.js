import { TILE, emptyPavingTile, pavingTiles, tileImage } from "./campus3dPavingTiles.js";

let nextMap = 0;
export function attachPaving(map, ml, surfaces, bounds) {
  let worker, render, revision = 0, request = 0, blank, removed = false;
  const protocol = "campuspave" + (++nextMap);
  const pending = new Map();

  function stopWorker() {
    worker?.terminate();
    worker = null;
    for (const { reject } of pending.values()) reject(new Error("Paving worker stopped"));
    pending.clear();
  }
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" &&
      OffscreenCanvas.prototype.transferToImageBitmap && typeof createImageBitmap === "function") {
    try {
      worker = new Worker(new URL("./campus3dPavingWorker.js", import.meta.url), { type: "module" });
      worker.onerror = stopWorker;
      worker.onmessage = ({ data }) => {
        if (data.unavailable) { stopWorker(); return; }
        const entry = pending.get(data.id);
        if (!entry) { data.image?.close?.(); return; }
        pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error));
        else entry.resolve(data.image);
      };
    } catch { worker = null; }
  }
  function update(collection) {
    surfaces = collection;
    render = null;
    worker?.postMessage({ surfaces });
  }
  update(surfaces);
  async function getTile(tile, signal) {
    if (worker) {
      const id = ++request;
      const abort = () => {
        worker?.postMessage({ id, cancel: true });
        pending.get(id)?.reject(new DOMException("Tile request aborted", "AbortError"));
        pending.delete(id);
      };
      try {
        if (signal?.aborted) throw new DOMException("Tile request aborted", "AbortError");
        const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        signal?.addEventListener("abort", abort, { once: true });
        worker.postMessage({ id, tile });
        return await result;
      } catch (error) {
        if (worker || removed || signal?.aborted) throw error;
      } finally {
        signal?.removeEventListener("abort", abort);
        pending.delete(id);
      }
    }
    render ??= pavingTiles(surfaces);
    return render(...tile, signal);
  }
  const url = () => protocol + "://{z}/{x}/{y}?v=" + revision;
  ml.addProtocol(protocol, async ({ url }, controller) => {
    const tile = url.split("://")[1].split("?")[0].split("/").map(Number);
    const image = await getTile(tile, controller?.signal);
    return { data: tileImage(image ?? await (blank ??= emptyPavingTile())) };
  });
  map.once("remove", () => {
    removed = true;
    stopWorker();
    blank?.then(bitmap => bitmap.close?.(), () => {});
    ml.removeProtocol(protocol);
  });
  // At walking distance level 23 resolves a 10 cm paver across about thirteen texels.
  map.addSource("cbPaving", { type: "raster", tiles: [url()], bounds: [bounds.w, bounds.s, bounds.e, bounds.n], tileSize: TILE, minzoom: 18, maxzoom: 23 });
  map.addLayer({ id: "cb-paving-detail", type: "raster", source: "cbPaving", minzoom: 18, paint: {
    "raster-opacity": ["interpolate", ["linear"], ["zoom"], 18, 0, 20, 1], "raster-fade-duration": 0,
  } }, "cb-pave-fine");
  return collection => {
    update(collection);
    revision++;
    map.getSource("cbPaving").setTiles([url()]);
  };
}
