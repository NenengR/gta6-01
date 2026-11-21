// SUNBREAK: COASTLINE — tuning constants and shared math.
// Everything the nine gameplay systems import from here is preserved; the extra
// blocks at the bottom are new tuning knobs for the wiring (camera, HUD, crime).

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

// P1-3: one coast definition shared by rendering, the minimap and collision.
// WORLD.oceanStart is the hard land edge in city.resolveCircle, so water must
// begin exactly there. Sand begins at the existing beachStart constant.
export const COAST = {
  sandStart: WORLD.beachStart,
  wetSandStart: WORLD.oceanStart - 40,
  waterStart: WORLD.oceanStart,
  deepWaterStart: WORLD.oceanStart + 90,
};

// P1-5: story landmarks and characters, placed just outside the asphalt.
export const LANDMARKS = [
  { id: "radio-tower", label: "RADIO TOWER", x: 790, y: 750, kind: "tower" },
  { id: "lockup", label: "LOCKUP", x: 780, y: 1950, kind: "lockup" },
  { id: "gilded-room", label: "GILDED ROOM", x: 2580, y: 750, kind: "gallery" },
  { id: "nia", label: "NIA", x: 780, y: 880, kind: "npc", color: "#e37ba6" },
  { id: "sol", label: "SOL", x: 1180, y: 740, kind: "npc", color: "#e0b24c" },
  { id: "curator", label: "CURATOR", x: 1180, y: 1940, kind: "npc", color: "#a98cd6" },
];

// P1-8: permanent city pickups. Respawned as active after each mission.
export const PICKUPS = [
  { id: "ammo-1", kind: "ammo", label: "AMMO", x: 1180, y: 1140, amount: 24 },
  { id: "health-1", kind: "health", label: "HEALTH", x: 2080, y: 540, amount: 35 },
];

function nearestRoadIndex(values, value) {
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
  }
  return best;
}

// P1-4: street names derived from coordinates, never hard-coded by hand.
export function streetNameAt(x, y, axis = "both") {
  const vertical = STREET_NAMES.vertical[nearestRoadIndex(ROAD_X, x)];
  const horizontal = STREET_NAMES.horizontal[nearestRoadIndex(ROAD_Y, y)];
  if (axis === "vertical") return vertical;
  if (axis === "horizontal") return horizontal;
  return `${vertical} / ${horizontal}`;
}

export const VEHICLE_COLORS = ["#d34f45", "#e4a73d", "#3f8ea3", "#e8e1cf", "#6f7f92", "#7b9560", "#9c5f83", "#d9d4c8"];

// Keyboard + mouse only. Space punches; F (or the left mouse button) shoots.
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
  confirm: ["Enter"],
};

// ---- shared math (unchanged) ----
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

// ---- wiring tuning ----
export const STEP = 1 / 60;          // fixed simulation step
export const MAX_FRAME = 0.25;       // a longer stall is dropped, never replayed

export const CAMERA = {
  zoom: 1,
  follow: 4.4,        // higher = snappier follow
  lookAhead: 0.16,    // fraction of velocity shown ahead of the target
  margin: 40,
};

export const GAME = {
  autosaveInterval: 14,  // seconds between background saves
  interactRange: 76,     // E reach for cars / the radio
  startCash: 250,
};

export const CRIME = {
  theft: 9,
  assault: 15,
  gunshot: 24,
  murder: 32,
  default: 12,
};

export const HUD = {
  healthWidth: 224,
  healthHeight: 16,
  minimapWidth: 198,
  minimapHeight: 152,
  minimapMargin: 18,
  starSize: 15,
};
