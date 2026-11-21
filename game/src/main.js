// Boot and the single loop. Systems are created once, wired through callbacks, and advanced in
// fixed 1/60 s steps: on foot, E steals/exits cars, crimes raise wanted heat, police chase and
// bust, missions pay cash, death or a bust ends the run. Title / playing / paused / game over are
// the four screens. ?shot=start|drive|chase|mission&seed=N stages a still frame for screenshots.
import { CRIME, GAME, MAX_FRAME, STEP, clamp, distance } from "./config.js";
import { createCity } from "./city.js";
import { createPlayer, updatePlayer, placePlayer } from "./player.js";
import { createVehicle, updateVehicle, getVehicleSpeed, nearbyVehicle, resetVehicleIds, markVehicleStolen } from "./vehicles.js";
import { createTraffic, updateTraffic, addParkedCars, findTrafficCar, resolvePlayerTrafficCollisions } from "./traffic.js";
import {
  createPolice, updatePolice, reportCrime, policeStars,
} from "./police.js";
import {
  createCombat, updateCombat, updateCombatBullets, addCombatEffect, policeShoot,
  createPickups, updatePickups, respawnPickups,
} from "./combat.js";
import {
  MISSION_DEFINITIONS, createMissionSystem, startMission, availableMission,
  missionMarker, updateMissions,
} from "./missions.js";
import { createAudio } from "./audio.js";
import { saveGame, loadGame, hasSaveGame } from "./save.js";
import { createInput } from "./input.js";
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from "./render.js";
import { createHud } from "./hud.js";
import { stageShot } from "./shots.js";
import { pointInRect } from "./config.js";

const silentAudio = {
  updateEngine() {}, updateSiren() {}, shot() {}, punch() {}, crash() {}, pickup() {},
  mission() {}, alarm() {}, stop() {}, toggleMute() { return false; },
  get muted() { return true; },
};

const params = new URLSearchParams(window.location.search);
const shot = params.get("shot");
const seedParam = Number.parseInt(params.get("seed") ?? "", 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById("game");
const hudCanvas = document.getElementById("hud");
const status = document.getElementById("status");
const renderer = createRenderer(canvas);
const hud = createHud(hudCanvas, canvas);

let audio;
try {
  audio = createAudio();
} catch {
  audio = silentAudio;
}

/** Build a complete, independent game state from one seed. */
function createState(gameSeed, sound = silentAudio) {
  resetVehicleIds();
  const city = createCity(gameSeed);
  const player = createPlayer(1080, 780);
  const traffic = createTraffic(gameSeed, city);
  addParkedCars(traffic, city);

  // Two tagged cars for the repo and heist missions.
  const repo = createVehicle({ x: 2280, y: 640, angle: 0, color: "#3f8ea3", parked: true });
  repo.tag = "repo-car";
  traffic.cars.push(repo);
  const heist = createVehicle({ x: 1080, y: 1840, angle: Math.PI / 2, color: "#7b9560", parked: true });
  heist.tag = "heist-car";
  traffic.cars.push(heist);

  const police = createPolice(gameSeed);
  const combat = createCombat();
  // police.js calls combat.policeShoot(...); combat.js exports it as a plain function.
  combat.policeShoot = policeShoot;
  const missions = createMissionSystem();

  return {
    seed: gameSeed,
    city, player, traffic, police, combat, missions,
    pickups: createPickups(),
    briefing: null,
    audio: sound,
    time: 0,
    message: "",
    messageTimer: 0,
    gameOverReason: null,
    hasSave: hasSaveGame(),
    saveTimer: GAME.autosaveInterval,
    screen: SCREEN_TITLE,
  };
}

let state = createState(seed, audio);

if (shot) {
  // A staged, deterministic frame: paint twice, then raise the screenshot flag.
  const shotState = stageShot(shot, seed, (gameSeed) => createState(gameSeed, silentAudio));
  let painted = 0;
  function paint() {
    renderer.draw(shotState, shotState.screen, 0);
    hud.draw(shotState, shotState.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  runGame();
}

function runGame() {
  // P1-6: the first real key or click unlocks audio before any sound is needed.
  const input = createInput(canvas, () => {
    if (audio.resume) audio.resume();
  });
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function showMessage(message, duration = 3.2) {
    state.message = message;
    state.messageTimer = duration;
  }

  // ---- state transitions ----
  function startNew() {
    input.consumeUiInput();
    state = createState(seed, audio);
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce("New game. Find Nia's radio on Lime Street and press E.");
  }

  function continueGame() {
    input.consumeUiInput();
    const data = loadGame();
    if (!data) {
      showMessage("No save found — starting fresh.", 3);
      startNew();
      return;
    }
    state = createState(data.seed, audio);
    applySave(state, data);
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce("Save loaded. Welcome back to the coastline.");
  }

  function gameOver(reason) {
    if (screen === SCREEN_OVER) return;
    state.gameOverReason = reason;
    screen = SCREEN_OVER;
    audio.stop();
    announce(reason === "busted" ? "Busted. Game over." : "Wasted. Game over.");
  }

  function applySave(target, data) {
    const player = target.player;
    placePlayer(player, data.player.x, data.player.y, data.player.angle || player.angle);
    player.health = clamp(data.player.health, 1, player.maxHealth);
    player.cash = Math.max(0, data.player.cash || 0);
    if (data.combat) {
      target.combat.magazine = clamp(data.combat.magazine, 0, 12);
      target.combat.reserveAmmo = Math.max(0, data.combat.reserveAmmo);
    }
    if (data.police) {
      target.police.heat = clamp(data.police.heat || 0, 0, 100);
      target.police.wanted = clamp(data.police.wanted || 0, 0, 5);
    }
    if (data.missions) {
      target.missions.completed = Array.isArray(data.missions.completed) ? data.missions.completed.slice() : [];
      target.missions.availableIndex = clamp(data.missions.availableIndex || 0, 0, MISSION_DEFINITIONS.length - 1);
      target.missions.active = data.missions.active ? { ...data.missions.active } : null;
    }
    for (const saved of data.vehicles || []) {
      const vehicle = findTrafficCar(target.traffic, saved.id);
      if (!vehicle) continue;
      for (const key of ["x", "y", "angle", "health", "vx", "vy"]) {
        if (Number.isFinite(saved[key])) vehicle[key] = saved[key];
      }
      vehicle.stolen = saved.stolen === true;
      vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
    }
    if (data.player.vehicleId) {
      const vehicle = findTrafficCar(target.traffic, data.player.vehicleId);
      if (vehicle && !vehicle.occupied) {
        vehicle.occupied = true;
        player.vehicle = vehicle;
        placePlayer(player, vehicle.x, vehicle.y, vehicle.angle);
      }
    }
  }

  // ---- callbacks handed to the systems ----
  function onCrime(type, x, y) {
    const before = policeStars(state.police);
    reportCrime(state.police, CRIME[type] ?? CRIME.default, performance.now() / 1000, x, y);
    if (type === "gunshot") audio.shot();
    if (type === "assault") audio.punch();
    if (policeStars(state.police) > before) {
      audio.alarm();
      showMessage(`${policeStars(state.police)}-star heat — lose them!`, 2.6);
    }
  }

  const missionEvents = {
    onWanted(amount) {
      reportCrime(state.police, Math.max(0, amount - state.police.heat), performance.now() / 1000, state.player.x, state.player.y);
      audio.alarm();
      showMessage("The handoff is hot — move!", 3);
    },
    onStep(definition, step) {
      audio.pickup();
      showMessage(step.label, 3.6);
      saveGame(state);
    },
    onComplete(definition) {
      state.player.cash += definition.reward;
      respawnPickups(state.pickups);
      audio.mission();
      showMessage(`${definition.title} complete — $${definition.reward}`, 5);
      saveGame(state);
    },
    failMission(message) {
      audio.alarm();
      showMessage(message, 5);
    },
  };

  function exitVehicle() {
    const vehicle = state.player.vehicle;
    if (!vehicle) return;
    vehicle.occupied = false;
    // P1-7: no driver means no AI. The car stays where it was left.
    vehicle.ai = false;
    vehicle.parked = true;
    vehicle.vx = 0;
    vehicle.vy = 0;
    vehicle.speed = 0;
    vehicle.aiCruise = 0;
    vehicle.target = null;
    const side = vehicle.angle + Math.PI / 2;
    placePlayer(
      state.player,
      vehicle.x + Math.cos(side) * 36,
      vehicle.y + Math.sin(side) * 36,
      vehicle.angle,
    );
    state.city.resolveCircle(state.player, state.player.radius);
    state.player.vehicle = null;
    audio.pickup();
  }

  function handleInteract() {
    if (!input.wasPressed("interact")) return;
    const { player, city, missions, traffic } = state;
    if (player.vehicle) {
      exitVehicle();
      return;
    }
    const marker = missionMarker(missions);
    if (marker && !missions.active && distance(player.x, player.y, marker.x, marker.y) < GAME.interactRange) {
      if (missions.completed.length >= MISSION_DEFINITIONS.length) {
        showMessage("All jobs done — the coastline is yours.", 4);
        return;
      }
      const mission = availableMission(missions);
      if (mission) {
        startMission(missions, mission.id);
        state.briefing = { title: mission.title, lines: (mission.briefing || [mission.story]).slice(), timer: 7 };
        showMessage(mission.story, 6);
        audio.mission();
      }
      return;
    }
    const vehicle = nearbyVehicle(traffic.cars, player);
    if (vehicle) {
      vehicle.occupied = true;
      player.vehicle = vehicle;
      placePlayer(player, vehicle.x, vehicle.y, vehicle.angle);
      if (markVehicleStolen(vehicle)) onCrime("theft", vehicle.x, vehicle.y);
      audio.pickup();
      showMessage(
        vehicle.tag === "repo-car" ? "Repo coupe secured. Take it to the lockup."
          : vehicle.tag === "heist-car" ? "Curator's car — stay sharp."
            : "Car taken. Press E to exit.",
        3.2,
      );
    }
  }

  // ---- one fixed simulation step ----
  function step(delta) {
    const { player, city, traffic, police, combat, missions } = state;
    state.time += delta;
    // combat.js timestamps bullet damage with performance.now(), so every system
    // in this loop shares that same real-time clock for hit invulnerability.
    const now = performance.now() / 1000;
    updatePlayer(player, input, city, delta, now);

    if (player.vehicle) {
      const vehicle = player.vehicle;
      const oldCooldown = vehicle.crashCooldown;
      updateVehicle(vehicle, input, city, delta, now, true);
      placePlayer(player, vehicle.x, vehicle.y, vehicle.angle);
      audio.updateEngine(getVehicleSpeed(vehicle), true, police.units.length > 0);
      if (vehicle.crashCooldown > oldCooldown && oldCooldown <= 0) {
        addCombatEffect(combat, { type: "crash", x: vehicle.x, y: vehicle.y, life: 0.28, maxLife: 0.28 });
        audio.crash(1.3);
      }
      if (vehicle.health <= 0) {
        exitVehicle();
        showMessage("Car wrecked — back on foot!", 3);
      }
    } else {
      audio.updateEngine(0, false, false);
    }

    updateTraffic(traffic, player, city, delta, now);
    if (player.vehicle) {
      resolvePlayerTrafficCollisions(traffic, player.vehicle, now, onCrime);
      city.resolveCircle(player.vehicle, player.vehicle.radius);
      placePlayer(player, player.vehicle.x, player.vehicle.y, player.vehicle.angle);
    }
    updateCombat(combat, player, input, city, delta, now, input.pointer, police, traffic, onCrime);
    updateCombatBullets(combat, player, police, city, delta, onCrime, traffic);
    updatePickups(state.pickups, player, combat, (item, amount) => {
      showMessage(`${item.label} +${Math.round(amount)}`, 2.6);
      audio.pickup();
    });
    if (state.briefing) {
      state.briefing.timer -= delta;
      if (state.briefing.timer <= 0) state.briefing = null;
    }
    const busted = updatePolice(police, player, city, delta, now, combat);
    audio.updateSiren(police.wanted > 0, police.wanted / 5);
    updateMissions(missions, player, traffic, police, delta, now, missionEvents);
    handleInteract();

    state.messageTimer = Math.max(0, state.messageTimer - delta);
    state.saveTimer -= delta;
    if (state.saveTimer <= 0) {
      saveGame(state);
      state.saveTimer = GAME.autosaveInterval;
    }

    if (player.health <= 0) gameOver("dead");
    else if (busted) gameOver("busted");
  }

  // ---- discrete actions, once per frame ----
  function buttonAt(x, y) {
    for (const button of renderer.buttons) {
      if (pointInRect(x, y, button)) return button.id;
    }
    return null;
  }

  function handleGlobalActions() {
    if (input.consumePressed("mute")) {
      const muted = audio.toggleMute();
      showMessage(muted ? "Sound muted" : "Sound on", 2);
    }
    if (input.consumePressed("pause")) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce("Paused.");
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce("Playing.");
      }
    }
    const clicked = input.wasClicked() ? buttonAt(input.pointer.screenX, input.pointer.screenY) : null;
    if (screen === SCREEN_TITLE) {
      if (input.wasPressed("confirm") || input.wasPressed("punch") || clicked === "new") startNew();
      else if (clicked === "continue") continueGame();
    } else if (screen === SCREEN_OVER) {
      if (input.wasPressed("confirm") || clicked === "restart") startNew();
      else if (clicked === "title") {
        screen = SCREEN_TITLE;
        state.hasSave = hasSaveGame();
      }
    } else if (screen === SCREEN_PAUSED && clicked === "resume") {
      input.consumeUiInput();
      screen = SCREEN_PLAY;
      announce("Playing.");
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // Aim uses world coordinates; combat.js reads pointer.x / pointer.y directly.
    const world = renderer.screenToWorld(input.pointer.screenX, input.pointer.screenY);
    input.pointer.x = world.x;
    input.pointer.y = world.y;

    handleGlobalActions();

    let consumed = false;
    if (screen === SCREEN_PLAY) {
      accumulator += delta;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(STEP);
        accumulator -= STEP;
        if (!consumed) {
          input.endFrame(); // edge-triggered actions fire in the first step only
          consumed = true;
        }
      }
    } else {
      accumulator = 0;
    }

    renderer.draw(state, screen, delta);
    hud.draw(state, screen);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce("Paused.");
    }
  });

  announce("Sunbreak: Coastline. Press Enter or click New Game to begin.");
  requestAnimationFrame(frame);
}
