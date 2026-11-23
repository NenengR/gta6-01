// Keyboard + mouse, mapped through KEYS. Movement/driving are held actions;
// punches, interactions and clicks are edge-triggered and cleared once per frame.
// `pointer.x/y` are meant to be WORLD coordinates; main.js overwrites them every
// frame from the camera transform before combat.js uses them for aiming.
import { KEYS } from "./config.js";

export function createInput(canvas, onGesture) {
  const heldActions = new Set();
  const freshPresses = new Set();
  const pointer = {
    screenX: 0,
    screenY: 0,
    x: 0,
    y: 0,
    active: false,
    mouseDown: false,
    clicked: false,
  };
  let clickSwallowed = false;

  // One lookup, built up front: event.code -> action name.
  const codeToAction = new Map();
  Object.entries(KEYS).forEach(([action, codes]) => {
    codes.forEach((code) => codeToAction.set(code, action));
  });

  // These keys scroll or otherwise fight the page, so swallow them.
  const SWALLOW = new Set([
    "forward", "back", "left", "right", "punch", "interact", "reload", "pause", "confirm",
  ]);

  function noteGesture(kind) {
    if (onGesture) onGesture(kind);
  }

  function keyDown(event) {
    noteGesture("key");
    const action = codeToAction.get(event.code);
    if (action === undefined) return;
    if (SWALLOW.has(action)) event.preventDefault();
    if (!heldActions.has(action)) freshPresses.add(action);
    heldActions.add(action);
  }

  function keyUp(event) {
    const action = codeToAction.get(event.code);
    if (action !== undefined) heldActions.delete(action);
  }

  function trackPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.screenX = event.clientX - bounds.left;
    pointer.screenY = event.clientY - bounds.top;
    pointer.active = true;
  }

  function mouseDown(event) {
    if (event.button !== 0) return;
    noteGesture("mouse");
    trackPointer(event);
    pointer.mouseDown = true;
    pointer.clicked = true;
  }

  function mouseUp(event) {
    if (event.button !== 0) return;
    pointer.mouseDown = false;
    clickSwallowed = false;
  }

  function mouseMove(event) {
    trackPointer(event);
  }

  function resetAll() {
    heldActions.clear();
    freshPresses.clear();
    clickSwallowed = false;
    pointer.mouseDown = false;
    pointer.clicked = false;
  }

  function blockContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", resetAll);
  canvas.addEventListener("mousedown", mouseDown);
  window.addEventListener("mouseup", mouseUp);
  canvas.addEventListener("mousemove", mouseMove);
  canvas.addEventListener("contextmenu", blockContextMenu);

  function mouseHeld() {
    return !clickSwallowed && pointer.mouseDown;
  }

  return {
    pointer,
    // combat.js reads `input.mouseDown`: true for the mouse button OR the F key.
    get mouseDown() {
      return mouseHeld() || heldActions.has("shoot");
    },
    isDown(action) {
      return heldActions.has(action);
    },
    wasPressed(action) {
      return freshPresses.has(action);
    },
    wasClicked() {
      return pointer.clicked;
    },
    consumePressed(action) {
      return freshPresses.delete(action);
    },
    consumeUiInput() {
      freshPresses.clear();
      pointer.clicked = false;
      clickSwallowed = pointer.mouseDown;
    },
    endFrame() {
      freshPresses.clear();
      pointer.clicked = false;
    },
    destroy() {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", resetAll);
      canvas.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      canvas.removeEventListener("mousemove", mouseMove);
      canvas.removeEventListener("contextmenu", blockContextMenu);
    },
  };
}
