import { WORLD, clamp, distance, angleDelta, makeRng, turnToward } from "./config.js";
import { createVehicle, updateVehicle } from "./vehicles.js";
import { damagePlayer } from "./player.js";

const WANTED_THRESHOLDS = [0, 18, 40, 62, 82];

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

export function reportCrime(police, amount, now, x, y) {
  const wasCold = police.heat <= 0;
  police.heat = clamp(police.heat + amount, 0, 100);
  // P2-3: brief head start at the start of a chase so a stolen car can build
  // speed before the first unit is on its bumper.
  if (wasCold && police.heat > 0) police.spawnTimer = Math.max(police.spawnTimer, 2.5);
  police.timeSinceSeen = 0;
  police.lastSeenX = x;
  police.lastSeenY = y;
  updateWantedLevel(police);
}

export function updateWantedLevel(police) {
  let stars = police.heat > 0 ? 1 : 0;
  for (let index = 1; index < WANTED_THRESHOLDS.length; index += 1) {
    if (police.heat >= WANTED_THRESHOLDS[index]) stars = index + 1;
  }
  police.wanted = stars;
}

export function isPlayerHidden(police, player, city) {
  for (const unit of police.units) {
    if (distance(unit.x, unit.y, player.x, player.y) < 300) return false;
  }
  for (const officer of police.officers) {
    if (distance(officer.x, officer.y, player.x, player.y) < 230) return false;
  }
  return true;
}

function spawnPoliceUnit(police, player) {
  const spawnAngle = police.rng() * Math.PI * 2;
  const spawnDistance = 520 + police.rng() * 200;
  let x = player.x + Math.cos(spawnAngle) * spawnDistance;
  let y = player.y + Math.sin(spawnAngle) * spawnDistance;
  if (x < 70) x = 70;
  if (x > WORLD.oceanStart - 70) x = WORLD.oceanStart - 70;
  if (y < 70) y = 70;
  if (y > WORLD.height - 70) y = WORLD.height - 70;
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
  if (police.officers.length >= 5) return;
  const side = police.rng() > 0.5 ? 1 : -1;
  const officer = {
    x: unit.x + Math.cos(unit.angle + Math.PI / 2) * side * 28,
    y: unit.y + Math.sin(unit.angle + Math.PI / 2) * side * 28,
    angle: unit.angle,
    speed: 112,
    health: 48,
    radius: 9,
    cooldown: 0,
    color: "#315a91",
  };
  police.officers.push(officer);
}

export function updatePolice(police, player, city, delta, now, combat) {
  if (police.heat <= 0) {
    clearPolice(police);
    return false;
  }
  const previousHeat = police.heat;
  // P2-4: bailing out of a moving car next to officers used to be an instant,
  // unavoidable bust. Give the player a short window to sprint clear.
  if (police.prevVehicle && !player.vehicle) police.bustGrace = 1.8;
  police.prevVehicle = player.vehicle;
  police.bustGrace = Math.max(0, police.bustGrace - delta);
  const visible = !isPlayerHidden(police, player, city);
  police.sight = visible;
  if (visible) {
    police.sight = true;
    police.timeSinceSeen = 0;
    police.lastSeenX = player.x;
    police.lastSeenY = player.y;
    // P2-3: a chase is not a life sentence. Keeping moving bleeds heat even in
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
  updateWantedLevel(police);
  if (police.heat <= 0) {
    clearPolice(police);
    return false;
  }

  if (police.wanted > 0) {
    police.spawnTimer -= delta;
    const targetUnits = Math.min(6, police.wanted + (police.wanted >= 4 ? 1 : 0));
    if (police.spawnTimer <= 0 && police.units.length < targetUnits) {
      spawnPoliceUnit(police, player);
      police.spawnTimer = police.wanted >= 4 ? 1.4 : 2.4;
    }
  }

  for (const unit of police.units) {
    const target = player.vehicle || player;
    const distanceToTarget = distance(unit.x, unit.y, target.x, target.y);
    if (distanceToTarget < 135) spawnOfficer(police, unit);
    unit.target = { x: target.x, y: target.y };
    const desiredAngle = Math.atan2(target.y - unit.y, target.x - unit.x);
    const turn = angleDelta(unit.angle, desiredAngle);
    unit.angle = turnToward(unit.angle, desiredAngle, delta * 2.4);
    unit.ramCooldown = Math.max(0, (unit.ramCooldown || 0) - delta);
    unit.ramRecover = Math.max(0, (unit.ramRecover || 0) - delta);
    const targetSpeed = unit.aiSpeed + (distanceToTarget > 160 ? 30 : 0);
    // P2-1: ease off briefly after a ram so the car has room to accelerate away.
    const chaseSpeed = unit.ramRecover > 0 ? targetSpeed * 0.25 : targetSpeed;
    unit.vx = Math.cos(unit.angle) * chaseSpeed;
    unit.vy = Math.sin(unit.angle) * chaseSpeed;
    unit.x += unit.vx * delta;
    unit.y += unit.vy * delta;
    city.resolveCircle(unit, unit.radius);
    // Keep a fleeing player from being pinned under a unit. The driver needs a
    // nonzero direction to sprint away, and 34px is still inside bust range.
    if (!player.vehicle) {
      const ud = distance(unit.x, unit.y, player.x, player.y);
      if (ud < 34) {
        if (ud > 0.01) {
          unit.x = player.x + (unit.x - player.x) / ud * 34;
          unit.y = player.y + (unit.y - player.y) / ud * 34;
        } else {
          unit.x = player.x + 34;
        }
      }
    }
    unit.speed = Math.hypot(unit.vx, unit.vy);

    if (player.vehicle === unit) continue;
    const collisionDistance = distance(unit.x, unit.y, target.x, target.y);
    // P2-1: one damaging ram per unit per second, instead of damage every tick.
    if (collisionDistance < unit.radius + target.radius + 8 && unit.ramCooldown <= 0) {
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
  }

  let carBustContact = false;
  let footBustContact = false;
  for (const officer of police.officers) {
    const target = player.vehicle || player;
    const distanceToTarget = distance(officer.x, officer.y, target.x, target.y);
    const desiredAngle = Math.atan2(target.y - officer.y, target.x - officer.x);
    officer.angle = turnToward(officer.angle, desiredAngle, delta * 7);
    if (distanceToTarget > 28) {
      officer.x += Math.cos(officer.angle) * officer.speed * delta;
      officer.y += Math.sin(officer.angle) * officer.speed * delta;
    }
    officer.cooldown = Math.max(0, officer.cooldown - delta);
    if (distanceToTarget < 190 && officer.cooldown <= 0 && combat) {
      combat.policeShoot(officer, player, now, combat);
      officer.cooldown = 1.1 + police.rng() * 0.7;
    }
    // A sprinting player must not be busted by brushing an officer. A player
    // who stays in reach for a moment, or stops, is still busted.
    if (!player.vehicle && distanceToTarget < 25) footBustContact = true;
    // A parked car is still busted, but only after briefly staying in reach of
    // an officer. This leaves time to complete a drop-off and drive off.
    if (player.vehicle && player.vehicle.speed < 35 && distanceToTarget < 34) carBustContact = true;
  }
  police.footBustTimer = footBustContact ? police.footBustTimer + delta : 0;
  police.carStoppedTimer = carBustContact ? police.carStoppedTimer + delta : 0;
  if (police.bustGrace <= 0 && (police.footBustTimer > 0.6 || police.carStoppedTimer > 1.2)) {
    police.busted = true;
    police.bustTimer = 0;
  }

  if (police.heat !== previousHeat && police.wanted > 0) police.lastSeenX = player.x;
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
