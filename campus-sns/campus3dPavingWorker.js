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
    const bitmap = await render(...data.tile, controller.signal);
    if (controller.signal.aborted) bitmap?.close();
    else self.postMessage({ id: data.id, bitmap }, bitmap ? [bitmap] : []);
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id: data.id, error: error.message });
  } finally {
    active.delete(data.id);
  }
};
