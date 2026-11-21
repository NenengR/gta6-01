// The game loop and state machine: title, playing, paused (P), game over, restart.
// Wires city + player + vehicles + traffic + police + combat + missions + audio + save + hud.
import { WORLD, clamp, distance } from "./config.js";
import { createCity } from "./city.js";
import { createPlayer, damagePlayer, placePlayer } from "./player.js";
import { createVehicle, updateVehicle, getVehicleSpeed, nearbyVehicle, recoverVehicle } from "./vehicles.js";
import { createTraffic, addParkedCars, updateTraffic } from "./traffic.js";
import { createPolice, reportCrime, updatePolice, clearPolice, policeStars } from "./police.js";
import { createCombat, updateCombat, updateCombatBullets, combatStatus } from "./combat.js";
import { createMissionSystem, startMission, availableMission, updateMissions, missionObjective, resetMission } from "./missions.js";
import { createAudio } from "./audio.js";
import { saveGame, loadGame, hasSaveGame, clearSaveGame } from "./save.js";
import { createHud } from "./hud.js";
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from "./render.js";
import { createInput } from "./input.js";

const MAX_FRAME = 0.25;
const STEP = 1 / 60;

const params = new URLSearchParams(window.location.search);
const shot = params.get("shot");
const seedParam = Number.parseInt(params.get("seed") ?? "", 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById("game");
const statusEl = document.getElementById("status");
const container = document.body;

const renderer = createRenderer(canvas);
const hud = createHud(container);
const audio = createAudio();
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let city, player, traffic, police, combat, missions, accumulator, last, now;
let gameStarted = false;

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function resumeAudio() {
  if (audio.context && audio.context.state === "suspended") audio.context.resume();
}

function newGame() {
  city = createCity(seed);
  player = createPlayer();
  traffic = createTraffic(seed, city);
  addParkedCars(traffic, city);
  police = createPolice(seed);
  combat = createCombat();
  missions = createMissionSystem();
  resetMission(missions);
  accumulator = 0;
  last = performance.now();
  screen = SCREEN_PLAY;
  gameStarted = true;
  announce("Sunbreak Coastline. E to steal a car, P to pause.");
}

function continueGame() {
  const data = loadGame();
  if (!data) return;
  city = createCity(seed);
  player = createPlayer(data.player.x, data.player.y);
  player.angle = data.player.angle;
  player.health = data.player.health;
  player.cash = data.player.cash;
  traffic = createTraffic(seed, city);
  addParkedCars(traffic, city);
  police = createPolice(seed);
  police.heat = data.police.heat;
  police.wanted = data.police.wanted;
  combat = createCombat();
  combat.magazine = data.combat.magazine;
  combat.reserveAmmo = data.combat.reserveAmmo;
  missions = createMissionSystem();
  missions.completed = data.missions.completed || [];
  missions.availableIndex = data.missions.availableIndex;
  if (data.missions.active) {
    missions.active = { ...data.missions.active };
    startMission(missions, missions.active.id, missions.active.stepIndex);
  }
  accumulator = 0;
  last = performance.now();
  screen = SCREEN_PLAY;
  gameStarted = true;
  announce("Continue loaded.");
}

function endGame() {
  screen = SCREEN_OVER;
  audio.stop();
  announce("Game over. Press Space or click to restart.");
}

function handleInput() {
  if (input.wasPressed("pause")) {
    if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce("Paused."); audio.stop(); }
    else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce("Playing."); last = performance.now(); }
    return;
  }
  if (screen !== SCREEN_PLAY) return;
  if (input.wasPressed("interact")) {
    if (player.vehicle) {
      // Exit car
      const v = player.vehicle;
      v.occupied = false;
      player.vehicle = null;
      placePlayer(player, v.x + Math.cos(v.angle) * 40, v.y + Math.sin(v.angle) * 40, v.angle);
      announce("Exited vehicle.");
    } else {
      const car = nearbyVehicle(traffic.cars, player);
      if (car) {
        car.occupied = true;
        player.vehicle = car;
        announce("Stole a car.");
      } else {
        announce("No car nearby.");
      }
    }
  }
  if (input.wasPressed("mute")) {
    const muted = audio.toggleMute();
    announce(muted ? "Audio muted." : "Audio on.");
  }
}

function onCrime(type, x, y) {
  const amount = type === "gunshot" ? 12 : type === "assault" ? 8 : 6;
  reportCrime(police, amount, now, x, y);
  if (type === "gunshot") audio.alarm();
}

const missionEvents = {
  onStep(definition, step, stepIndex) {
    audio.pickup();
    announce(`Objective: ${step.label}`);
  },
  onComplete(definition) {
    player.cash = clamp(player.cash + definition.reward, 0, 999999);
    audio.mission();
    announce(`${definition.title} complete — $${definition.reward}`);
  },
  failMission(message) {
    announce(message);
    audio.alarm();
  },
  onWanted(heat) {
    announce(`Wanted level raised.`);
  },
};

function update(delta) {
  if (player.vehicle) {
    updateVehicle(player.vehicle, input, city, delta, now, true);
    player.x = player.vehicle.x;
    player.y = player.vehicle.y;
    player.angle = player.vehicle.angle;
  } else {
    updatePlayer(player, input, city, delta, now);
  }

  updateTraffic(traffic, player, city, delta, now);
  const busted = updatePolice(police, player, city, delta, now, combat);
  updateCombat(combat, player, input, city, delta, now, input.pointer, police, traffic, onCrime);
  updateCombatBullets(combat, player, police, city, delta, onCrime);
  updateMissions(missions, player, traffic, police, delta, now, missionEvents);

  if (player.health <= 0) { endGame(); return; }
  if (busted || police.busted) { endGame(); return; }

  // mission marker
  const active = activeMissionValue(missions);
  if (active && active.step.type === "reach") {
    missions.missionMarker = { x: active.step.x, y: active.step.y };
  } else {
    const m = missionMarkerValue(missions);
    missions.missionMarker = m ? { x: m.x, y: m.y } : null;
  }
  missions.objectiveText = missionObjective(missions);
}

function activeMissionValue(missions) {
  if (!missions.active) return null;
  const def = MISSION_DEFINITIONS.find((m) => m.id === missions.active.id);
  if (!def) return null;
  return { ...def, step: def.steps[missions.active.stepIndex], stepIndex: missions.active.stepIndex };
}
function missionMarkerValue(missions) {
  const mission = availableMission(missions);
  return mission ? { x: 680, y: 704, mission } : null;
}

// Import MISSION_DEFINITIONS for lookup
import { MISSION_DEFINITIONS } from "./missions.js";

function frame(time) {
  requestAnimationFrame(frame);
  if (screen === SCREEN_PAUSED || screen === SCREEN_TITLE || screen === SCREEN_OVER) {
    renderer.draw(city, player, traffic, police, combat, screen, player);
    hud.update(player, police, missions, city, now, 0);
    return;
  }
  now = time / 1000;
  accumulator = Math.min(accumulator + (now - last), MAX_FRAME);
  last = now;
  handleInput();
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  const target = player.vehicle || player;
  renderer.draw(city, player, traffic, police, combat, screen, target);
  const speedKmh = player.vehicle ? getVehicleSpeed(player.vehicle) : 0;
  hud.update(player, police, missions, city, now, speedKmh);
}

// Boot
renderer.resize();
window.addEventListener("resize", () => renderer.resize());

function startFromTitle(continueSave) {
  resumeAudio();
  if (continueSave && hasSaveGame()) continueGame();
  else newGame();
}

canvas.addEventListener("mousedown", () => {
  resumeAudio();
  if (screen === SCREEN_TITLE) startFromTitle(false);
  else if (screen === SCREEN_OVER) startFromTitle(false);
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    resumeAudio();
    if (screen === SCREEN_TITLE) startFromTitle(false);
    else if (screen === SCREEN_OVER) startFromTitle(false);
    else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; last = performance.now(); }
  }
});

if (shot) {
  // Shot mode: stage via shots.js
  import("./shots.js").then(({ stageShot }) => {
    const scene = stageShot(shot, seed);
    city = scene.city;
    player = scene.player;
    traffic = scene.traffic;
    police = scene.police;
    combat = scene.combat;
    missions = scene.missions;
    screen = scene.screen;
    last = performance.now();
    requestAnimationFrame(function paint() {
      requestAnimationFrame(paint);
      renderer.draw(city, player, traffic, police, combat, screen, player);
      const speedKmh = player.vehicle ? getVehicleSpeed(player.vehicle) : 0;
      hud.update(player, police, missions, city, now, speedKmh);
      if (window.__shotReady) return;
    });
    setTimeout(() => { window.__shotReady = true; }, 600);
  });
} else {
  announce("Sunbreak Coastline. Press Space or click to start. (Continue loads save)");
  requestAnimationFrame(frame);
}
