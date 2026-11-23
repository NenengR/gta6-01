// Deterministic screenshot scenes: ?shot=start|drive|chase|mission&seed=N.
// Each scene is built from the real systems through the state factory passed in by
// main.js, then arranged/advanced with a scripted input so a fixed seed always
// yields the same frame. No randomness and no sound in staging.
import { STEP, clamp } from "./config.js";
import { placePlayer, updatePlayer } from "./player.js";
import { createVehicle, updateVehicle } from "./vehicles.js";
import { updateTraffic } from "./traffic.js";
import { startMission, updateMissions, MISSION_DEFINITIONS } from "./missions.js";
import { addCombatEffect } from "./combat.js";
import { SCREEN_TITLE, SCREEN_PLAY } from "./render.js";

const IDLE_INPUT = { isDown: () => false, wasPressed: () => false, mouseDown: false, pointer: { x: 0, y: 0 } };
const THROTTLE_INPUT = {
  isDown: (action) => action === "forward",
  wasPressed: () => false,
  mouseDown: false,
  pointer: { x: 0, y: 0 },
};
const QUIET_EVENTS = {
  onWanted() {}, onStep() {}, onComplete() {}, failMission() {},
};

function tick(state, input, steps, runMissions = false) {
  const { player, city, traffic, police, missions } = state;
  for (let i = 0; i < steps; i += 1) {
    state.time += STEP;
    updatePlayer(player, input, city, STEP, state.time);
    if (player.vehicle) {
      updateVehicle(player.vehicle, input, city, STEP, state.time, true);
      placePlayer(player, player.vehicle.x, player.vehicle.y, player.vehicle.angle);
    }
    updateTraffic(traffic, player, city, STEP, state.time);
    if (runMissions) updateMissions(missions, player, traffic, police, STEP, state.time, QUIET_EVENTS);
  }
}

function seatPlayerInCar(state, x, y, angle, velocity = 0) {
  const car = createVehicle({ x, y, angle, color: "#d34f45", parked: false });
  car.vx = Math.cos(angle) * velocity;
  car.vy = Math.sin(angle) * velocity;
  car.speed = velocity;
  car.occupied = true;
  state.traffic.cars.push(car);
  state.player.vehicle = car;
  placePlayer(state.player, x, y, angle);
  return car;
}

function spawnChaser(state, x, y) {
  const player = state.player;
  const unit = createVehicle({
    x,
    y,
    angle: Math.atan2(player.y - y, player.x - x),
    color: "#e8edf0",
    type: "police",
    ai: true,
  });
  unit.police = true;
  unit.occupied = true;
  unit.aiSpeed = 170 + state.police.wanted * 13;
  unit.target = { x: player.x, y: player.y };
  unit.skid = 0.4;
  state.police.units.push(unit);
}

function spawnOfficer(state, x, y) {
  state.police.officers.push({
    x,
    y,
    angle: Math.atan2(state.player.y - y, state.player.x - x),
    speed: 112,
    health: 48,
    radius: 9,
    cooldown: 0,
    color: "#315a91",
  });
}

// A muzzle flash at the officer's gun, aimed back at the player.
function officerFlash(state, ox, oy) {
  const aimBack = Math.atan2(-oy, -ox);
  addCombatEffect(state.combat, {
    type: "muzzle",
    x: state.player.vehicle.x + ox + Math.cos(aimBack) * 16,
    y: state.player.vehicle.y + oy + Math.sin(aimBack) * 16,
    life: 0.07,
    maxLife: 0.07,
  });
}

// ---- one staging function per scene; the table below picks by name ----
function stageDrive(state) {
  seatPlayerInCar(state, 1080, 1440, 0, 210);
  tick(state, THROTTLE_INPUT, 160);
  state.player.vehicle.skid = 0.55;
  addCombatEffect(state.combat, { type: "crash", x: state.player.vehicle.x + 40, y: state.player.vehicle.y, life: 0.28, maxLife: 0.28 });
  state.screen = SCREEN_PLAY;
}

function stageChase(state) {
  seatPlayerInCar(state, 1480, 1440, -Math.PI / 2, 250);
  state.police.heat = 88;
  state.police.wanted = 5;
  state.police.sight = true;
  state.police.timeSinceSeen = 0;
  state.police.lastSeenX = state.player.x;
  state.police.lastSeenY = state.player.y;
  const car = state.player.vehicle;
  const chaserOffsets = [[300, -60], [-270, 90], [90, -300], [-150, -250], [360, 180]];
  for (const [dx, dy] of chaserOffsets) spawnChaser(state, car.x + dx, car.y + dy);
  const officerOffsets = [[-130, 80], [170, -110], [-210, -60], [70, 150]];
  for (const [dx, dy] of officerOffsets) {
    spawnOfficer(state, car.x + dx, car.y + dy);
    officerFlash(state, dx, dy);
  }
  tick(state, THROTTLE_INPUT, 24);
  state.message = "Five stars — lose the pack!";
  state.messageTimer = 9;
  state.screen = SCREEN_PLAY;
}

function stageMission(state) {
  const definition = MISSION_DEFINITIONS[0];
  startMission(state.missions, definition.id, 1);
  placePlayer(state.player, 1790, 1040, 0);
  tick(state, IDLE_INPUT, 30, true);
  state.message = definition.story;
  state.messageTimer = 9;
  state.screen = SCREEN_PLAY;
}

function stageStart(state) {
  // Title screen: a calm city turning over behind the panel.
  tick(state, IDLE_INPUT, 40);
  state.screen = SCREEN_TITLE;
}

const SCENES = {
  drive: stageDrive,
  chase: stageChase,
  mission: stageMission,
  start: stageStart,
};

/**
 * Return a fully built state staged for `name` (unknown names fall back to start).
 * `createState(seed)` is supplied by main.js so the scene uses the real wiring.
 */
export function stageShot(name, seed, createState) {
  const state = createState(seed);
  state.screen = SCREEN_PLAY;
  state.hasSave = name === "start";
  state.gameOverReason = null;
  state.message = "";
  state.messageTimer = 0;
  const stage = SCENES[name] || SCENES.start;
  stage(state);
  return state;
}
