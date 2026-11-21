// Keyboard + mouse, mapped through KEYS. Movement/driving are held actions;
// punches, interactions and clicks are edge-triggered and cleared once per frame.
// `pointer.x/y` are meant to be WORLD coordinates; main.js overwrites them every
// frame from the camera transform before combat.js uses them for aiming.
import { KEYS } from "./config.js";

export function createInput(canvas, onGesture) {
  const held = new Set();
  const pressed = new Set();
  let mouseBlocked = false;
  const pointer = {
    screenX: 0,
    screenY: 0,
    x: 0,
    y: 0,
    active: false,
    mouseDown: false,
    clicked: false,
  };

  // Build a lookup once: event.code -> action name.
  const actionByCode = new Map();
  for (const [action, codes] of Object.entries(KEYS)) {
    for (const code of codes) actionByCode.set(code, action);
  }

  const PREVENT = new Set([
    "forward", "back", "left", "right", "punch", "interact", "reload", "pause", "confirm",
  ]);

  function onKeyDown(event) {
    if (onGesture) onGesture("key");
    const action = actionByCode.get(event.code);
    if (!action) return;
    if (PREVENT.has(action)) event.preventDefault();
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  }

  function onKeyUp(event) {
    const action = actionByCode.get(event.code);
    if (action) held.delete(action);
  }

  function updatePointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.screenX = event.clientX - bounds.left;
    pointer.screenY = event.clientY - bounds.top;
    pointer.active = true;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    if (onGesture) onGesture("mouse");
    updatePointer(event);
    pointer.mouseDown = true;
    pointer.clicked = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) {
      pointer.mouseDown = false;
      mouseBlocked = false;
    }
  }

  function onMouseMove(event) {
    updatePointer(event);
  }

  function clearHeld() {
    held.clear();
    pressed.clear();
    mouseBlocked = false;
    pointer.mouseDown = false;
    pointer.clicked = false;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clearHeld);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  return {
    pointer,
    // combat.js reads `input.mouseDown`: true for the mouse button OR the F key.
    get mouseDown() {
      return (!mouseBlocked && pointer.mouseDown) || held.has("shoot");
    },
    isDown(action) {
      return held.has(action);
    },
    wasPressed(action) {
      return pressed.has(action);
    },
    wasClicked() {
      return pointer.clicked;
    },
    consumePressed(action) {
      return pressed.delete(action);
    },
    consumeUiInput() {
      pressed.clear();
      pointer.clicked = false;
      mouseBlocked = pointer.mouseDown;
    },
    endFrame() {
      pressed.clear();
      pointer.clicked = false;
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearHeld);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
    },
  };
}
