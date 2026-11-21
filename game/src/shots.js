// Deterministic shot staging for ?shot=start|drive|chase|mission&seed=N.
// Each shot builds a fresh world from the given seed and returns the state the
// renderer paints, plus the screen overlay to show.
import { createCity } from "./city.js";
import { createPlayer, placePlayer } from "./player.js";
import { createVehicle } from "./vehicles.js";
import { createTraffic, addParkedCars } from "./traffic.js";
import { createPolice } from "./police.js";
import { createCombat } from "./combat.js";
import { createMissionSystem, startMission, availableMission } from "./missions.js";
import { SCREEN_TITLE, SCREEN_PLAY } from "./render.js";

export function stageShot(name, seed) {
  const city = createCity(seed);
  const traffic = createTraffic(seed, city);
  addParkedCars(traffic, city);
  const police = createPolice(seed);
  const combat = createCombat();
  const missions = createMissionSystem();

  if (name === "mission") {
    startMission(missions, availableMission(missions).id, 0);
    const player = createPlayer();
    placePlayer(player, 1080, 640);
    return { city, player, traffic, police, combat, missions, screen: SCREEN_PLAY };
  }

  if (name === "chase") {
    const player = createPlayer(1480, 1040);
    const car = createVehicle({ x: 1480, y: 1040, angle: 0, type: "sedan" });
    car.occupied = true;
    player.vehicle = car;
    police.heat = 70;
    police.wanted = 3;
    const unit = createVehicle({ x: 1480, y: 900, angle: Math.PI / 2, color: "#e8edf0", type: "police", ai: true });
    unit.police = true; unit.occupied = true; unit.aiSpeed = 200;
    police.units.push(unit);
    return { city, player, traffic, police, combat, missions, screen: SCREEN_PLAY };
  }

  if (name === "drive") {
    const player = createPlayer(1080, 780);
    const car = createVehicle({ x: 1080, y: 780, angle: 0, type: "sedan" });
    car.occupied = true;
    player.vehicle = car;
    return { city, player, traffic, police, combat, missions, screen: SCREEN_PLAY };
  }

  // start: title screen, on foot
  const player = createPlayer(1080, 780);
  return { city, player, traffic, police, combat, missions, screen: SCREEN_TITLE };
}
