// Game loop and state machine for Sunbreak Coastline.
//
// main.js owns one shared state object and passes it to the systems each
// frame. It owns the modes title, playing, paused, busted, wasted and
// mission-complete, starts a new game from the title screen, keeps the
// camera on the player, and keeps the page status line in sync with the
// game. It also drives the player: walking on foot and driving a car are
// orchestrated here from the input, because the systems expose walk, drive
// and enterCar as separate operations.
//
// Interface contract (verified against the systems modules at build time):
//   CONFIG.canvas = { width, height }; CONFIG.city = { width, height }
//   makeRng(seed) -> { float, int, pick, shuffle, chance, dice }
//   buildWorld(rng) -> layout { roads, buildings, districts, sea, sand, plaza, spawns }
//   makeCity(world, rng) -> city { world, details, isRoad, hitsBuilding, isWater, isSand,
//                                  districtAt, update, hour, daylight }
//   makePlayer(spawn) -> player { x, y, angle, health, money, wanted, onFoot, car, radius,
//                                 isAlive, reset, walk, enterCar, exitCar, damage, heal,
//                                 earn, spend, raiseWanted, lowerWanted, setWanted, update }
//   makeVehicles(rng, city) -> { list, add, count, spawnParked, nearest, steal, drive,
//                                damage, removeWrecked, update }
//   makeTraffic(rng, city) -> { cars, peds, count, clear, spawn, flee, update }
//   makePolice() -> { units, blocks, heat, isChasing, clear, update }
//   makeCombat() -> { hits, clearHits, hitCount, punch, shoot, knockDown, update }
//   makeMissions(targets) -> { current(), index(), done(), message(), progress(), reset(),
//                              targetPos(), complete(), update }
//   makeAudio() -> { ensure, isMuted, toggleMute, engine, stopEngine, siren, gunshot,
//                    punch, chime, jingle, blip }
//   save: loadGame(), loadBest(), saveGame(state), saveBest(score), clearSave(), hasSave()

import { CONFIG } from './config.js';
import { makeRng } from './random.js';
import { buildWorld } from './world.js';
import { makeCity } from './city.js';
import { makePlayer } from './player.js';
import { makeVehicles } from './vehicles.js';
import { makeTraffic } from './traffic.js';
import { makePolice } from './police.js';
import { makeCombat } from './combat.js';
import { makeMissions } from './missions.js';
import { makeAudio } from './audio.js';
import { loadGame, loadBest, saveGame } from './save.js';
import { input, attachInput } from './input.js';
import { drawScene } from './render.js';
import { drawHud, TITLE_TEXT, NEW_GAME_TEXT } from './hud.js';
import { setupShot, getShotRequest, installShotHook } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const newGameBtn = document.getElementById('new-game');

const VIEW_W = (CONFIG && CONFIG.canvas && (CONFIG.canvas.width || CONFIG.canvas.w)) || 1280;
const VIEW_H = (CONFIG && CONFIG.canvas && (CONFIG.canvas.height || CONFIG.canvas.h)) || 800;

let state = null;
let lastTime = 0;
let missionIndexSeen = 0;
let missionBannerT = 0;
let pausedStatus = '';

export function getState() {
  return state;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function worldSize() {
  const cfg = (CONFIG && CONFIG.city) || {};
  return {
    w: cfg.width || cfg.w || 3200,
    h: cfg.height || cfg.h || 2400,
  };
}

function setStatus(text) {
  if (state) state.status = text;
  if (statusEl) statusEl.textContent = text;
}

function pushMessage(text, life) {
  if (!state) return;
  state.messages.push({ text, t: 0, life: life || 4 });
  if (state.messages.length > 4) state.messages.shift();
}

function updateCamera(snap) {
  const p = state.player;
  const size = worldSize();
  let cx;
  let cy;
  if (p) {
    cx = p.x - VIEW_W / 2;
    cy = p.y - VIEW_H / 2;
  } else {
    cx = size.w / 2 - VIEW_W / 2;
    cy = size.h / 2 - VIEW_H / 2;
  }
  cx = clamp(cx, 0, Math.max(0, size.w - VIEW_W));
  cy = clamp(cy, 0, Math.max(0, size.h - VIEW_H));
  if (snap) {
    state.camera.x = cx;
    state.camera.y = cy;
  } else {
    state.camera.x += (cx - state.camera.x) * 0.12;
    state.camera.y += (cy - state.camera.y) * 0.12;
  }
}

function initGame(seed) {
  const rng = makeRng(seed);
  const world = buildWorld(rng);
  const city = makeCity(world, rng);
  const player = makePlayer(world.spawns.player);
  const vehicles = makeVehicles(rng, city);
  vehicles.spawnParked(world.spawns.parkedCars);
  const traffic = makeTraffic(rng, city, vehicles);
  const police = makePolice(rng, city, vehicles);
  traffic.spawn();
  const combat = makeCombat();
  const missions = makeMissions(world.spawns.missionTargets);
  const audio = makeAudio();
  const saved = loadGame() || {};
  const best = loadBest() || saved.best || 0;
  if (saved.muted && audio.isMuted && !audio.isMuted()) audio.toggleMute();

  state = {
    mode: 'title',
    time: 0,
    seed,
    rng,
    config: CONFIG,
    world,
    city,
    player,
    vehicles,
    traffic,
    police,
    combat,
    missions,
    audio,
    camera: { x: 0, y: 0 },
    status: TITLE_TEXT,
    messages: [],
    completedMission: null,
    score: 0,
    best,
  };
  missionIndexSeen = 0;
  missionBannerT = 0;
  setStatus(TITLE_TEXT);
  updateCamera(true);
  return state;
}

function startNewGame() {
  initGame(state ? state.seed : 1);
  state.mode = 'playing';
  setStatus(NEW_GAME_TEXT);
  pushMessage(NEW_GAME_TEXT, 6);
  if (state.audio.ensure) state.audio.ensure();
}

function nearestCar(maxDist) {
  const p = state.player;
  const list = (state.vehicles && state.vehicles.list) || [];
  let bestCar = null;
  let bestD = maxDist;
  for (const car of list) {
    if (!car || car.wrecked || car.driver) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) {
      bestD = d;
      bestCar = car;
    }
  }
  return bestCar;
}

function drivePlayer(dt) {
  const p = state.player;
  const city = state.city;
  if (p.onFoot) {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      p.walk(dx / len, dy / len, dt, city);
    }
    if (input.interactPressed) {
      const car = nearestCar(48);
      if (car) {
        p.reset({ x: car.x, y: car.y });
        p.enterCar(car);
      }
    }
  } else if (p.car) {
    const throttle = (input.up ? 1 : 0) - (input.down ? 0.6 : 0);
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.vehicles.drive(p.car, throttle, steer, dt, city);
    if (input.interactPressed) p.exitCar();
  }
}

function updateAudio() {
  const audio = state.audio;
  if (!audio) return;
  const p = state.player;
  const speed = p.car ? p.car.speed || 0 : input.anyMove() ? 230 : 0;
  if (audio.engine) audio.engine(speed);
  if (audio.siren) audio.siren(state.police.isChasing());
}

function nearestPed(maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist;
  for (const ped of state.traffic.peds) {
    if (!ped || ped.fleeing) continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  return best;
}

function handleCombat() {
  const p = state.player;
  if (input.punchPressed && p.onFoot) {
    const target = nearestPed(56);
    if (target && state.combat.punch(p, target)) {
      state.traffic.flee(p.x, p.y);
      if (state.audio.punch) state.audio.punch();
    }
  }
  if (input.shootPressed && state.missions.index() >= 2) {
    const targets = [];
    for (const u of state.police.units) {
      const car = u && u.car;
      if (!car || car.wrecked) continue;
      targets.push({
        get x() { return car.x; },
        get y() { return car.y; },
        get health() { return car.hp; },
        down: false,
        damage(n) { state.vehicles.damage(car, n); },
      });
    }
    if (targets.length > 0 && state.combat.shoot(p, p.angle, targets, true)) {
      if (state.audio.gunshot) state.audio.gunshot();
    }
  }
}

function updatePlaying(dt) {
  const missions = state.missions;
  const beforeIdx = missions.index();
  const beforeMission = missions.current();

  drivePlayer(dt);
  handleCombat();

  state.city.update(dt);
  state.player.update(dt, !state.police.isChasing());
  state.vehicles.update(dt);
  state.traffic.update(dt, state.player);
  const arrested = state.police.update(dt, state.player);
  state.combat.update(dt);
  missions.update(dt, state.player, input);
  updateAudio();
  updateCamera(false);

  const p = state.player;

  const afterIdx = missions.index();
  if (afterIdx > beforeIdx) {
    missionIndexSeen = afterIdx;
    const reward = beforeMission ? beforeMission.reward || 0 : 0;
    state.completedMission = beforeMission || null;
    pushMessage('Mission complete! +$' + reward, 5);
    state.mode = 'mission-complete';
    missionBannerT = 2.2;
    saveGame(state);
  } else {
    missionIndexSeen = afterIdx;
  }

  if (!p.isAlive() || p.health <= 0) {
    state.mode = 'wasted';
    state.score = p.money || 0;
    if (state.score > state.best) state.best = state.score;
    saveGame(state);
    setStatus('Wasted. Press Enter to try again.');
    return;
  }

  if (arrested && p.wanted > 0) {
    state.mode = 'busted';
    state.score = p.money || 0;
    if (state.score > state.best) state.best = state.score;
    saveGame(state);
    setStatus('Busted. Press Enter to try again.');
  }
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000 || 0.016));
  lastTime = now;
  if (!state) return;
  state.time += dt;
  for (const m of state.messages) m.t += dt;
  state.messages = state.messages.filter((m) => m.t < m.life);

  const mode = state.mode;
  if (mode === 'title') {
    state.city.update(dt);
    updateCamera(false);
    if (input.startPressed) startNewGame();
  } else if (mode === 'playing') {
    if (input.pausePressed) {
      pausedStatus = state.status || '';
      state.mode = 'paused';
      setStatus('Paused. Press P to resume.');
    } else {
      updatePlaying(dt);
    }
  } else if (mode === 'paused') {
    if (input.pausePressed || input.startPressed) {
      state.mode = 'playing';
      setStatus(pausedStatus || NEW_GAME_TEXT);
    }
  } else if (mode === 'mission-complete') {
    missionBannerT -= dt;
    if (missionBannerT <= 0) state.mode = 'playing';
  } else if (mode === 'busted' || mode === 'wasted') {
    if (input.startPressed) startNewGame();
  }

  if (input.mutePressed && state.audio) {
    state.audio.toggleMute();
    saveGame(state);
  }

  drawScene(ctx, state);
  drawHud(ctx, state);
  input.clearPressed();
}

attachInput();

const shot = getShotRequest();
initGame(shot ? shot.seed || 1 : 1);
if (shot) setupShot(state, shot.name, shot.seed || 1);
installShotHook((name, seed) => {
  initGame(seed || 1);
  setupShot(state, name, seed || 1);
});

if (newGameBtn) {
  newGameBtn.addEventListener('click', () => {
    if (state && (state.mode === 'title' || state.mode === 'busted' || state.mode === 'wasted')) {
      startNewGame();
    }
  });
}

requestAnimationFrame(tick);
