// Keyboard + mouse input: WASD/arrows move/drive, E steal/exit car, Space punch,
// F or mouse shoot, M mute, P pause.
import { KEYS } from "./config.js";

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const pointer = { x: 0, y: 0, worldX: 0, worldY: 0, active: false, mouseDown: false };

  function actionFor(code) {
    for (const [action, codes] of Object.entries(KEYS)) {
      if (codes.includes(code)) return action;
    }
    return null;
  }

  function onKeyDown(event) {
    const action = actionFor(event.code);
    if (!action) return;
    if (["forward", "back", "left", "right", "interact", "punch", "shoot", "reload", "pause"].includes(action)) {
      event.preventDefault();
    }
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  }

  function onKeyUp(event) {
    const action = actionFor(event.code);
    if (action) held.delete(action);
  }

  function updatePointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    updatePointer(event);
    pointer.mouseDown = true;
    pressed.add("shoot");
  }

  function onMouseUp(event) {
    if (event.button === 0) pointer.mouseDown = false;
  }

  function onMouseMove(event) {
    updatePointer(event);
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    held.clear();
    pressed.clear();
    pointer.mouseDown = false;
  });
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  return {
    pointer,
    isDown(action) {
      return held.has(action);
    },
    wasPressed(action) {
      return pressed.has(action);
    },
    endFrame() {
      pressed.clear();
    },
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
    },
  };
}
