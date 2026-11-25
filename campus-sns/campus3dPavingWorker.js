import { pavingTiles } from "./campus3dPavingTiles.js";

let render;
const active = new Map();
self.onmessage = async ({ data }) => {
  if (data.surfaces) {
    try { render = pavingTiles(data.surfaces); }
    catch { self.postMessage({ unavailable: true }); }
    return;
  }
  if (data.cancel) { active.get(data.id)?.abort(); return; }
  const controller = new AbortController();
  active.set(data.id, controller);
  try {
    // An ImageBitmap, or ImageData pixels on WebKit (see rawPixelTiles); both move without a copy.
    const image = await render(...data.tile, controller.signal);
    if (controller.signal.aborted) image?.close?.();
    else self.postMessage({ id: data.id, image }, !image ? [] : "data" in image ? [image.data.buffer] : [image]);
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id: data.id, error: error.message });
  } finally {
    active.delete(data.id);
  }
};
