// Keyboard input for Sunbreak Coastline.
//
// Tracks which movement keys are held and fires one-shot edges for the
// action keys. The game loop reads this object every frame and calls
// clearPressed() at the end of the frame, so an edge only fires once.

export const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  interact: false,
  interactPressed: false,
  startPressed: false,
  pausePressed: false,
  mutePressed: false,
  punch: false,
  punchPressed: false,
  shoot: false,
  shootPressed: false,

  clearPressed() {
    this.interactPressed = false;
    this.startPressed = false;
    this.pausePressed = false;
    this.mutePressed = false;
    this.punchPressed = false;
    this.shootPressed = false;
  },

  clearAll() {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.interact = false;
    this.punch = false;
    this.shoot = false;
    this.clearPressed();
  },

  // True while any movement key is held. The audio engine and the shot
  // scenarios use this to tell driving from standing still.
  anyMove() {
    return this.up || this.down || this.left || this.right;
  },
};

const MOVE_KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

function onKeyDown(event) {
  const move = MOVE_KEYS[event.code];
  if (move) {
    input[move] = true;
    event.preventDefault();
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyE') {
    input.interact = true;
    input.interactPressed = true;
  } else if (event.code === 'Enter') {
    input.startPressed = true;
    event.preventDefault();
  } else if (event.code === 'KeyP' || event.code === 'Escape') {
    input.pausePressed = true;
  } else if (event.code === 'KeyM') {
    input.mutePressed = true;
  } else if (event.code === 'Space') {
    input.punch = true;
    input.punchPressed = true;
    event.preventDefault();
  } else if (event.code === 'KeyF') {
    input.shoot = true;
    input.shootPressed = true;
  }
}

function onKeyUp(event) {
  const move = MOVE_KEYS[event.code];
  if (move) {
    input[move] = false;
    return;
  }
  if (event.code === 'KeyE') input.interact = false;
  if (event.code === 'Space') input.punch = false;
  if (event.code === 'KeyF') input.shoot = false;
}

export function attachInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => input.clearAll());
}
