// All positions passed to the preview are CSS pixels in the model viewport.
export function bindModelGestures(element, view) {
  const pointers = new Map();
  let moved = false;
  function down(e) {
    if (e.button !== 0 || pointers.size >= 2) return;
    if (!pointers.size) moved = false;
    const p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    pointers.set(e.pointerId, p);
    // A stationary tap must still click the room marker underneath the finger.
    const target = e.target.closest("button") || element;
    if (target === element) element.focus({ preventScroll: true });
    target.setPointerCapture(e.pointerId);
    if (pointers.size === 2) moved = true;
  }
  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pointers.size === 1) {
      if (!moved && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 3) return;
      moved = true;
      view.rotate(dx, dy);
    } else {
      const other = [...pointers.values()].find(q => q !== p);
      const before = Math.hypot(p.x - other.x, p.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const rect = element.getBoundingClientRect();
      if (before > 2 && after > 2) {
        view.scale(after / before, (p.x + other.x) / 2 - rect.left, (p.y + other.y) / 2 - rect.top);
      }
      view.pan(dx / 2, dy / 2);
    }
    p.x = e.clientX;
    p.y = e.clientY;
  }
  function up(e) { pointers.delete(e.pointerId); }
  function click(e) {
    if (moved && e.detail !== 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  function wheel(e) {
    if (!e.deltaY) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? element.clientHeight : 1;
    const delta = Math.max(-160, Math.min(160, e.deltaY * unit));
    const rect = element.getBoundingClientRect();
    view.scale(Math.exp(-delta * (e.ctrlKey ? 0.008 : 0.0025)), e.clientX - rect.left, e.clientY - rect.top);
  }
  function key(e) {
    if (e.target !== element || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowLeft": view.rotate(-10,0); break;
      case "ArrowRight": view.rotate(10,0); break;
      case "ArrowUp": view.rotate(0,7); break;
      case "ArrowDown": view.rotate(0,-7); break;
      case "+": case "=": view.scale(1.2); break;
      case "-": view.scale(1 / 1.2); break;
      case "Home": view.reset(); break;
      default: return;
    }
    e.preventDefault();
  }
  function reset(e) {
    if (!moved && !e.target.closest("button")) view.reset();
  }
  const listeners = [
    ["pointerdown", down], ["pointermove", move], ["pointerup", up],
    ["pointercancel", up], ["lostpointercapture", up], ["click", click, true],
    ["wheel", wheel, { passive:false }], ["keydown", key], ["dblclick", reset],
  ];
  for (const args of listeners) element.addEventListener(...args);
  return () => {
    for (const args of listeners) element.removeEventListener(...args);
    pointers.clear();
  };
}
