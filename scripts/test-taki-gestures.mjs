import assert from "node:assert/strict";
import test from "node:test";
import { bindModelGestures } from "../campus-sns/components/takiModelGestures.js";

test("a marker tap selects, a drag or pinch manipulates the model, and lifting a finger keeps the gesture continuous", () => {
  const handlers = new Map(), calls = [];
  const viewport = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name),
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
  };
  const marker = { closest: () => marker, setPointerCapture() {} };
  function send(type, id, x, y) {
    const event = { pointerId: id, clientX: x, clientY: y, button: 0, target: marker, detail: 1,
      preventDefault() { this.prevented = true; }, stopPropagation() {} };
    handlers.get(type)(event);
    return event;
  }
  const unbind = bindModelGestures(viewport, {
    rotate: (...args) => calls.push(["rotate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    pan: (...args) => calls.push(["pan", ...args]),
  });
  send("pointerdown", 1, 20, 40);
  send("pointermove", 1, 21, 40);
  send("pointerup", 1);
  assert.equal(send("click").prevented, undefined);
  assert.equal(calls.length, 0);

  send("pointerdown", 1, 20, 40);
  send("pointerdown", 2, 40, 40);
  send("pointermove", 2, 60, 40);
  assert.deepEqual(calls.splice(0), [["scale", 2, 20, 20], ["pan", 10, 0]]);
  send("pointerup", 2);
  send("pointermove", 1, 23, 42);
  assert.deepEqual(calls.splice(0), [["rotate", 3, 2]]);
  send("lostpointercapture", 1);
  send("pointermove", 1, 90, 42);
  assert.equal(calls.length, 0);
  assert.equal(send("click").prevented, true);
  unbind();
  assert.equal(handlers.size, 0);
});
