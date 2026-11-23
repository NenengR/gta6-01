// Screenshot scenarios for Sunbreak Coastline.
//
// Each scenario sets up the game state from a seed and lets the renderer
// draw one frame. The shot driver asks for a scenario by name with seed 1,
// either through the page URL (?shot=drive&seed=1), the hash (#shot=drive),
// or the window.__shot(name, seed) hook. The four scenarios are:
//   start   - the title screen
//   drive   - the player driving a car through the city
//   chase   - a police chase at wanted level 3
//   mission - the first mission, finding the radio on Lime Street
//
// The scenarios advance the simulation by stepping the same operations the
// main loop runs each frame: walking or driving from the input, then the
// city, player, vehicles, traffic, police, combat and missions updates.

import { input } from './input.js';
import { CONFIG } from './config.js';
import { TITLE_TEXT, NEW_GAME_TEXT } from './hud.js';

export const SHOT_NAMES = ['start', 'drive', 'chase', 'mission'];

const ALIASES = {
  start: 'start',
  title: 'start',
  '1-start': 'start',
  1: 'start',
  drive: 'drive',
  '2-drive': 'drive',
  2: 'drive',
  chase: 'chase',
  '3-chase': 'chase',
  3: 'chase',
  mission: 'mission',
  '4-mission': 'mission',
  4: 'mission',
};

export function normalizeShotName(name) {
  if (name === undefined || name === null) return null;
  const key = String(name).trim().toLowerCase();
  return ALIASES[key] || null;
}

export function getShotRequest() {
  try {
    const params = new URLSearchParams(window.location.search);
    let name = params.get('shot') || params.get('scenario');
    let seed = params.get('seed');
    if (!name) {
      // Also accept a bare name, as in ?drive or ?chase&seed=1.
      const raw = window.location.search.replace(/^\?/, '').split('&')[0] || '';
      if (normalizeShotName(raw.split('=')[0])) name = raw.split('=')[0];
    }
    if (!name && window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      name = hash.get('shot') || hash.get('scenario');
      seed = seed || hash.get('seed');
    }
    const clean = normalizeShotName(name);
    if (!clean) return null;
    return { name: clean, seed: parseInt(seed, 10) || 1 };
  } catch (e) {
    return null;
  }
}

export function installShotHook(setup) {
  window.__shot = function (name, seed) {
    const clean = normalizeShotName(name);
    if (!clean) return false;
    setup(clean, seed || 1);
    return true;
  };
}

function stepOnce(state, dt) {
  const p = state.player;
  if (p && p.onFoot) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      p.walk(dx / len, dy / len, dt, state.city);
    }
    if (input.interactPressed) {
      const list = (state.vehicles && state.vehicles.list) || [];
      let bestCar = null;
      let bestD = 48;
      for (const car of list) {
        if (!car || car.wrecked || car.driver) continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < bestD) {
          bestD = d;
          bestCar = car;
        }
      }
      if (bestCar) {
        p.reset({ x: bestCar.x, y: bestCar.y });
        p.enterCar(bestCar);
      }
    }
  } else if (p && p.car) {
    const throttle = (input.up ? 1 : 0) - (input.down ? 0.6 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.vehicles.drive(p.car, throttle, steer, dt, state.city);
  }
  state.city.update(dt);
  state.player.update(dt, !state.police.isChasing());
  state.vehicles.update(dt);
  state.traffic.update(dt, state.player);
  state.police.update(dt, state.player);
  state.combat.update(dt);
  state.missions.update(dt, state.player, input);
}

function advance(state, frames, drive) {
  if (drive) input.up = true;
  for (let i = 0; i < frames; i++) {
    stepOnce(state, 1 / 60);
    state.time += 1 / 60;
  }
  input.up = false;
  input.clearPressed();
  centerCamera(state);
}

function centerCamera(state) {
  const p = state.player;
  if (!p || !state.camera) return;
  const vw = (CONFIG && CONFIG.canvas && (CONFIG.canvas.width || CONFIG.canvas.w)) || 1280;
  const vh = (CONFIG && CONFIG.canvas && (CONFIG.canvas.height || CONFIG.canvas.h)) || 800;
  const cfg = (CONFIG && CONFIG.city) || {};
  const size = { w: cfg.width || cfg.w || 3200, h: cfg.height || cfg.h || 2400 };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  state.camera.x = clamp(p.x - vw / 2, 0, Math.max(0, size.w - vw));
  state.camera.y = clamp(p.y - vh / 2, 0, Math.max(0, size.h - vh));
}

function putPlayerInCar(state) {
  const cars = (state.vehicles && state.vehicles.list) || [];
  // Pick the available car nearest the middle of the city, so the drive and
  // chase shots stay on the map while the car runs straight ahead.
  const cfg = (CONFIG && CONFIG.city) || {};
  const cx = (cfg.width || cfg.w || 3200) / 2;
  const cy = (cfg.height || cfg.h || 2400) / 2;
  let parked = null;
  let bestD = Infinity;
  for (const c of cars) {
    if (!c || c.wrecked || c.driver) continue;
    const d = Math.hypot(c.x - cx, c.y - cy);
    if (d < bestD) {
      bestD = d;
      parked = c;
    }
  }
  if (!parked) parked = cars[0];
  if (!parked) return null;
  const p = state.player;
  p.reset({ x: parked.x, y: parked.y });
  p.enterCar(parked);
  return parked;
}

function missionTarget(state) {
  const missions = state.missions;
  if (missions && typeof missions.targetPos === 'function') {
    try {
      const pos = missions.targetPos();
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
    } catch (e) {
      // Fall through to the spawn table below.
    }
  }
  const spawns = (state.world && state.world.spawns) || {};
  const targets = spawns.missionTargets || {};
  if (targets.lime) return targets.lime;
  return { x: 1000, y: 902 };
}

export function setupShot(state, name, seed) {
  const clean = normalizeShotName(name);
  if (!clean || !state) return false;

  if (clean === 'start') {
    state.mode = 'title';
    state.status = TITLE_TEXT;
    centerCamera(state);
    return true;
  }

  state.mode = 'playing';

  if (clean === 'drive') {
    putPlayerInCar(state);
    state.status = 'Cruising through downtown Sunbreak.';
    advance(state, 90, true);
    return true;
  }

  if (clean === 'chase') {
    putPlayerInCar(state);
    state.player.setWanted(3);
    state.status = 'Wanted level 3. Lose the police!';
    advance(state, 150, true);
    return true;
  }

  if (clean === 'mission') {
    const target = missionTarget(state);
    const p = state.player;
    p.reset({ x: target.x - 90, y: target.y + 80 });
    state.status = NEW_GAME_TEXT;
    advance(state, 30, false);
    return true;
  }

  return false;
}
