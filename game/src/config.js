export const WORLD = {
  width: 3200,
  height: 2400,
  oceanStart: 2760,
  beachStart: 2640,
};

export const ROAD_X = [280, 680, 1080, 1480, 1880, 2280, 2680];
export const ROAD_Y = [240, 640, 1040, 1440, 1840, 2240];
export const ROAD_WIDTH = 146;

export const COLORS = {
  sand: "#e8c98f",
  sandLight: "#f2dca7",
  ocean: "#2a9db0",
  oceanDeep: "#176d83",
  ground: "#d9c89d",
  asphalt: "#39434a",
  asphaltLight: "#465159",
  lane: "#e9d7a6",
  sidewalk: "#e5d7b8",
  roof: "#b65e45",
  shadow: "rgba(33, 28, 31, 0.22)",
  sun: "rgba(255, 194, 112, 0.18)",
};

export const STREET_NAMES = {
  vertical: ["Harbor Avenue", "Lime Street", "Copa Way", "Sol Avenue", "Marina Road", "Vista Lane", "Dune Drive"],
  horizontal: ["Sunset Drive", "Coral Way", "Mercado Street", "Mango Avenue", "Bayfront Road", "Palmetto Drive"],
};

export const VEHICLE_COLORS = ["#d34f45", "#e4a73d", "#3f8ea3", "#e8e1cf", "#6f7f92", "#7b9560", "#9c5f83", "#d9d4c8"];

export const KEYS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  interact: ["KeyE"],
  punch: ["Space"],
  shoot: ["KeyF"],
  reload: ["KeyR"],
  pause: ["KeyP", "Escape"],
  mute: ["KeyM"],
};

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const distance = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const turnToward = (from, to, amount) => from + clamp(angleDelta(from, to), -amount, amount);
export const pointInRect = (x, y, rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

export function makeRng(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}
