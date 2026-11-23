import { WORLD, clamp, distance, angleDelta, makeRng, turnToward } from "./config.js";
import { createVehicle, updateVehicle } from "./vehicles.js";
import { damagePlayer } from "./player.js";

const WANTED_THRESHOLDS = [0, 18, 40, 62, 82];
const MAX_UNITS = 6;
const MAX_OFFICERS = 5;
const UNIT_VIEW = 300;
const OFFICER_VIEW = 230;

export function createPolice(seed = 1) {
  const rng = makeRng(seed + 401);
  return {
    rng,
    heat: 0,
    wanted: 0,
    sight: false,
    lastSeenX: 0,
    lastSeenY: 0,
    timeSinceSeen: 999,
    spawnTimer: 0,
    bustGrace: 0,
    footBustTimer: 0,
    carStoppedTimer: 0,
    prevVehicle: null,
    units: [],
    officers: [],
    busted: false,
    bustTimer: 0,
  };
}

function starsForHeat(heat) {
  if (heat <= 0) return 0;
  let stars = 1;
  for (let i = 1; i < WANTED_THRESHOLDS.length; i += 1) {
    if (heat >= WANTED_THRESHOLDS[i]) stars = i + 1;
  }
  return stars;
}

export function updateWantedLevel(police) {
  police.wanted = starsForHeat(police.heat);
}

export function reportCrime(police, amount, now, x, y) {
  const wasCold = police.heat <= 0;
  police.heat = clamp(police.heat + amount, 0, 100);
  // Brief head start at the start of a chase so a stolen car can build
  // speed before the first unit is on its bumper.
  if (wasCold && police.heat > 0) police.spawnTimer = Math.max(police.spawnTimer, 2.5);
  police.timeSinceSeen = 0;
  police.lastSeenX = x;
  police.lastSeenY = y;
  updateWantedLevel(police);
  void now;
}

export function isPlayerHidden(police, player, city) {
  for (const unit of police.units) {
    if (distance(unit.x, unit.y, player.x, player.y) < UNIT_VIEW) return false;
  }
  for (const officer of police.officers) {
    if (distance(officer.x, officer.y, player.x, player.y) < OFFICER_VIEW) return false;
  }
  return true;
}

function spawnPoliceUnit(police, player) {
  const bearing = police.rng() * Math.PI * 2;
  const range = 520 + police.rng() * 200;
  const x = clamp(player.x + Math.cos(bearing) * range, 70, WORLD.oceanStart - 70);
  const y = clamp(player.y + Math.sin(bearing) * range, 70, WORLD.height - 70);
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
  unit.ramCooldown = 0;
  unit.ramRecover = 0;
  unit.aiSpeed = 150 + police.wanted * 12;
  unit.target = { x: player.x, y: player.y };
  police.units.push(unit);
}

function spawnOfficer(police, unit) {
  if (police.officers.length >= MAX_OFFICERS) return;
  const side = police.rng() > 0.5 ? 1 : -1;
  const perp = unit.angle + Math.PI / 2;
  police.officers.push({
    x: unit.x + Math.cos(perp) * side * 28,
    y: unit.y + Math.sin(perp) * side * 28,
    angle: unit.angle,
    speed: 112,
    health: 48,
    radius: 9,
    cooldown: 0,
    color: "#315a91",
  });
}

function chaseUnit(police, unit, player, city, delta, now) {
  const target = player.vehicle || player;
  const gap = distance(unit.x, unit.y, target.x, target.y);
  if (gap < 135) spawnOfficer(police, unit);
  unit.target = { x: target.x, y: target.y };
  const bearing = Math.atan2(target.y - unit.y, target.x - unit.x);
  unit.angle = turnToward(unit.angle, bearing, delta * 2.4);
  unit.ramCooldown = Math.max(0, (unit.ramCooldown || 0) - delta);
  unit.ramRecover = Math.max(0, (unit.ramRecover || 0) - delta);
  let cruise = unit.aiSpeed + (gap > 160 ? 30 : 0);
  // Ease off briefly after a ram so the car has room to accelerate away.
  if (unit.ramRecover > 0) cruise *= 0.25;
  unit.vx = Math.cos(unit.angle) * cruise;
  unit.vy = Math.sin(unit.angle) * cruise;
  unit.x += unit.vx * delta;
  unit.y += unit.vy * delta;
  city.resolveCircle(unit, unit.radius);
  // Keep a fleeing player from being pinned under a unit. The driver needs a
  // nonzero direction to sprint away, and 34px is still inside bust range.
  if (!player.vehicle) {
    const pin = distance(unit.x, unit.y, player.x, player.y);
    if (pin < 34) {
      if (pin > 0.01) {
        unit.x = player.x + (unit.x - player.x) / pin * 34;
        unit.y = player.y + (unit.y - player.y) / pin * 34;
      } else {
        unit.x = player.x + 34;
      }
    }
  }
  unit.speed = Math.hypot(unit.vx, unit.vy);

  if (player.vehicle === unit) return;
  const contact = distance(unit.x, unit.y, target.x, target.y);
  // One damaging ram per unit per second, instead of damage every tick.
  if (contact >= unit.radius + target.radius + 8 || unit.ramCooldown > 0) return;
  unit.ramCooldown = 1;
  if (player.vehicle) {
    const impact = Math.abs(player.vehicle.speed - unit.speed) * 0.2;
    player.vehicle.health = clamp(player.vehicle.health - impact, 0, 100);
    player.vehicle.vx *= 0.82;
    player.vehicle.vy *= 0.82;
    unit.ramRecover = 0.7;
  } else {
    damagePlayer(player, 9, now, Math.sign(angleDelta(player.angle, unit.angle)));
    unit.ramRecover = 0.4;
  }
  unit.vx *= -0.25;
  unit.vy *= -0.25;
}

function chaseOfficers(police, player, delta, now, combat) {
  let footContact = false;
  let stoppedContact = false;
  for (const officer of police.officers) {
    const target = player.vehicle || player;
    const gap = distance(officer.x, officer.y, target.x, target.y);
    const bearing = Math.atan2(target.y - officer.y, target.x - officer.x);
    officer.angle = turnToward(officer.angle, bearing, delta * 7);
    if (gap > 28) {
      officer.x += Math.cos(officer.angle) * officer.speed * delta;
      officer.y += Math.sin(officer.angle) * officer.speed * delta;
    }
    officer.cooldown = Math.max(0, officer.cooldown - delta);
    if (gap < 190 && officer.cooldown <= 0 && combat) {
      combat.policeShoot(officer, player, now, combat);
      officer.cooldown = 1.1 + police.rng() * 0.7;
    }
    // A sprinting player must not be busted by brushing an officer. A player
    // who stays in reach for a moment, or stops, is still busted.
    if (!player.vehicle && gap < 25) footContact = true;
    // A parked car is still busted, but only after briefly staying in reach of
    // an officer. This leaves time to complete a drop-off and drive off.
    if (player.vehicle && player.vehicle.speed < 35 && gap < 34) stoppedContact = true;
  }
  police.footBustTimer = footContact ? police.footBustTimer + delta : 0;
  police.carStoppedTimer = stoppedContact ? police.carStoppedTimer + delta : 0;
  if (police.bustGrace <= 0 && (police.footBustTimer > 0.6 || police.carStoppedTimer > 1.2)) {
    police.busted = true;
    police.bustTimer = 0;
  }
}

function bleedHeat(police, player, city, delta) {
  const seen = !isPlayerHidden(police, player, city);
  police.sight = seen;
  if (seen) {
    police.timeSinceSeen = 0;
    police.lastSeenX = player.x;
    police.lastSeenY = player.y;
    // A chase is not a life sentence. Keeping moving bleeds heat even in
    // view. Stopping or bailing out next to officers still leaves the player
    // exposed to rams, gunfire and a bust.
    const moving = player.vehicle
      ? player.vehicle.speed > 160
      : Math.hypot(player.vx, player.vy) > 140;
    if (moving) police.heat = clamp(police.heat - delta * 1.8, 0, 100);
  } else {
    police.timeSinceSeen += delta;
    if (police.timeSinceSeen > 7) {
      police.heat = clamp(police.heat - delta * (5.5 + police.wanted * 0.7), 0, 100);
    }
  }
}

function unitCountTarget(wanted) {
  return Math.min(MAX_UNITS, wanted + (wanted >= 4 ? 1 : 0));
}

export function updatePolice(police, player, city, delta, now, combat) {
  if (police.heat <= 0) {
    clearPolice(police);
    return false;
  }
  const heatBefore = police.heat;
  // Bailing out of a moving car next to officers used to be an instant,
  // unavoidable bust. Give the player a short window to sprint clear.
  if (police.prevVehicle && !player.vehicle) police.bustGrace = 1.8;
  police.prevVehicle = player.vehicle;
  police.bustGrace = Math.max(0, police.bustGrace - delta);
  bleedHeat(police, player, city, delta);
  updateWantedLevel(police);
  if (police.heat <= 0) {
    clearPolice(police);
    return false;
  }

  if (police.wanted > 0) {
    police.spawnTimer -= delta;
    const targetUnits = unitCountTarget(police.wanted);
    if (police.spawnTimer <= 0 && police.units.length < targetUnits) {
      spawnPoliceUnit(police, player);
      police.spawnTimer = police.wanted >= 4 ? 1.4 : 2.4;
    }
  }

  for (const unit of police.units) chaseUnit(police, unit, player, city, delta, now);
  chaseOfficers(police, player, delta, now, combat);

  if (police.heat !== heatBefore && police.wanted > 0) police.lastSeenX = player.x;
  return police.busted;
}

export function removeOfficer(police, officer) {
  const index = police.officers.indexOf(officer);
  if (index >= 0) police.officers.splice(index, 1);
}

export function clearPolice(police) {
  police.heat = 0;
  police.wanted = 0;
  police.sight = false;
  police.units.length = 0;
  police.officers.length = 0;
  police.busted = false;
  police.bustTimer = 0;
  police.spawnTimer = 0;
  police.bustGrace = 0;
  police.footBustTimer = 0;
  police.carStoppedTimer = 0;
  police.prevVehicle = null;
  police.timeSinceSeen = 999;
}

export function policeStars(police) {
  return police.wanted;
}
