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

const NO_INPUT = { isDown: () => false, wasPressed: () => false, mouseDown: false, pointer: { x: 0, y: 0 } };
const DRIVE_INPUT = {
  isDown: (action) => action === "forward",
  wasPressed: () => false,
  mouseDown: false,
  pointer: { x: 0, y: 0 },
};
const NO_EVENTS = {
  onWanted() {}, onStep() {}, onComplete() {}, failMission() {},
};

function advance(state, input, steps, doMissions = false) {
  const { player, city, traffic, police, combat, missions } = state;
  for (let i = 0; i < steps; i += 1) {
    state.time += STEP;
    updatePlayer(player, input, city, STEP, state.time);
    if (player.vehicle) {
      updateVehicle(player.vehicle, input, city, STEP, state.time, true);
      placePlayer(player, player.vehicle.x, player.vehicle.y, player.vehicle.angle);
    }
    updateTraffic(traffic, player, city, STEP, state.time);
    if (doMissions) updateMissions(missions, player, traffic, police, STEP, state.time, NO_EVENTS);
  }
  void combat;
}

function takeCar(state, x, y, angle, velocity = 0) {
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

function addPoliceUnit(state, x, y) {
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

function addOfficer(state, x, y) {
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

  if (name === "drive") {
    takeCar(state, 1080, 1440, 0, 210);
    advance(state, DRIVE_INPUT, 160);
    state.player.vehicle.skid = 0.55;
    addCombatEffect(state.combat, { type: "crash", x: state.player.vehicle.x + 40, y: state.player.vehicle.y, life: 0.28, maxLife: 0.28 });
    state.screen = SCREEN_PLAY;
    return state;
  }

  if (name === "chase") {
    takeCar(state, 1480, 1440, -Math.PI / 2, 250);
    state.police.heat = 88;
    state.police.wanted = 5;
    state.police.sight = true;
    state.police.timeSinceSeen = 0;
    state.police.lastSeenX = state.player.x;
    state.police.lastSeenY = state.player.y;
    const car = state.player.vehicle;
    for (const [dx, dy] of [[300, -60], [-270, 90], [90, -300], [-150, -250], [360, 180]]) {
      addPoliceUnit(state, car.x + dx, car.y + dy);
    }
    for (const [dx, dy] of [[-130, 80], [170, -110], [-210, -60], [70, 150]]) {
      addOfficer(state, car.x + dx, car.y + dy);
      addCombatEffect(state.combat, {
        type: "muzzle",
        x: car.x + dx + Math.cos(Math.atan2(-dy, -dx)) * 16,
        y: car.y + dy + Math.sin(Math.atan2(-dy, -dx)) * 16,
        life: 0.07,
        maxLife: 0.07,
      });
    }
    advance(state, DRIVE_INPUT, 24);
    state.message = "Five stars — lose the pack!";
    state.messageTimer = 9;
    state.screen = SCREEN_PLAY;
    return state;
  }

  if (name === "mission") {
    const definition = MISSION_DEFINITIONS[0];
    startMission(state.missions, definition.id, 1);
    placePlayer(state.player, 1790, 1040, 0);
    advance(state, NO_INPUT, 30, true);
    state.message = definition.story;
    state.messageTimer = 9;
    state.screen = SCREEN_PLAY;
    return state;
  }

  // start (title screen): a calm city turning over behind the panel.
  advance(state, NO_INPUT, 40);
  state.screen = SCREEN_TITLE;
  return state;
}
