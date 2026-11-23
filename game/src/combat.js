import { PICKUPS, WORLD, clamp, distance } from "./config.js";
import { damagePlayer } from "./player.js";

const MAGAZINE_SIZE = 12;
const RELOAD_TIME = 0.85;
const PUNCH_COOLDOWN = 0.46;
const PUNCH_DAMAGE = 28;
const PUNCH_REACH = 42;
const FIRE_COOLDOWN = 0.19;
const EMPTY_CLICK_DELAY = 0.28;
const BULLET_SPEED = 920;
const BULLET_LIFE = 0.8;
const BULLET_DAMAGE = 34;
const ENEMY_BULLET_SPEED = 650;
const MAX_RESERVE = 96;

export function createCombat() {
  return {
    ammo: 24,
    magazine: 12,
    reserveAmmo: 48,
    punchCooldown: 0,
    fireCooldown: 0,
    reloadTimer: 0,
    effects: [],
    hitFlash: 0,
  };
}

function ageEffects(combat, delta) {
  combat.punchCooldown = Math.max(0, combat.punchCooldown - delta);
  combat.fireCooldown = Math.max(0, combat.fireCooldown - delta);
  combat.hitFlash = Math.max(0, combat.hitFlash - delta);
  for (const effect of combat.effects) effect.life -= delta;
  combat.effects = combat.effects.filter((effect) => effect.life > 0);
}

function processReload(combat, input, delta) {
  if (input.wasPressed("reload") && combat.reloadTimer <= 0 && combat.magazine < MAGAZINE_SIZE && combat.reserveAmmo > 0) {
    combat.reloadTimer = RELOAD_TIME;
  }
  if (combat.reloadTimer <= 0) return;
  combat.reloadTimer = Math.max(0, combat.reloadTimer - delta);
  if (combat.reloadTimer !== 0) return;
  const needed = MAGAZINE_SIZE - combat.magazine;
  const loaded = Math.min(needed, combat.reserveAmmo);
  combat.magazine += loaded;
  combat.reserveAmmo -= loaded;
}

function nearestPunchTarget(player, police, traffic) {
  for (const officer of police.officers) {
    if (officer.health > 0 && distance(player.x, player.y, officer.x, officer.y) < PUNCH_REACH) return officer;
  }
  for (const pedestrian of traffic.pedestrians) {
    if (!pedestrian.dead && distance(player.x, player.y, pedestrian.x, pedestrian.y) < PUNCH_REACH) return pedestrian;
  }
  return null;
}

function landPunch(combat, player, police, traffic, onCrime) {
  combat.punchCooldown = PUNCH_COOLDOWN;
  const target = nearestPunchTarget(player, police, traffic);
  if (!target) {
    combat.effects.push({
      type: "punch",
      x: player.x + Math.cos(player.angle) * 26,
      y: player.y + Math.sin(player.angle) * 26,
      life: 0.15,
      maxLife: 0.15,
    });
    return;
  }
  target.health -= PUNCH_DAMAGE;
  target.hit = 0.18;
  combat.hitFlash = 0.12;
  combat.effects.push({ type: "impact", x: target.x, y: target.y, life: 0.22, maxLife: 0.22 });
  const isOfficer = police.officers.includes(target);
  if (isOfficer) {
    target.health -= 6;
    if (target.health <= 0) police.officers = police.officers.filter((officer) => officer !== target);
  } else if (target.kind === "pedestrian") {
    target.health -= 8;
    if (target.health <= 0) target.dead = true;
  }
  target.health = Math.max(0, target.health);
  onCrime(target.health <= 0 ? "murder" : "assault", target.x, target.y);
}

function shootPistol(combat, player, pointer, onCrime) {
  const aim = pointer ? Math.atan2(pointer.y - player.y, pointer.x - player.x) : player.angle;
  player.angle = aim;
  const muzzleX = player.x + Math.cos(aim) * 18;
  const muzzleY = player.y + Math.sin(aim) * 18;
  const spread = (Math.random() - 0.5) * 0.075;
  const flight = aim + spread;
  combat.effects.push({
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(flight) * BULLET_SPEED,
    vy: Math.sin(flight) * BULLET_SPEED,
    life: BULLET_LIFE,
    maxLife: BULLET_LIFE,
    kind: "bullet",
  });
  combat.effects.push({ type: "muzzle", x: muzzleX, y: muzzleY, life: 0.07, maxLife: 0.07 });
  onCrime("gunshot", muzzleX, muzzleY);
}

export function updateCombat(combat, player, input, city, delta, now, pointer, police, traffic, onCrime) {
  ageEffects(combat, delta);
  if (player.vehicle) return;
  processReload(combat, input, delta);
  if (input.wasPressed("punch") && combat.punchCooldown <= 0) {
    landPunch(combat, player, police, traffic, onCrime);
  }
  if (input.mouseDown && combat.fireCooldown <= 0 && combat.reloadTimer <= 0) {
    if (combat.magazine > 0) {
      combat.magazine -= 1;
      combat.fireCooldown = FIRE_COOLDOWN;
      shootPistol(combat, player, pointer, onCrime);
    } else {
      combat.fireCooldown = EMPTY_CLICK_DELAY;
    }
  }
  void city;
  void now;
}

export function policeShoot(officer, player, now, combat) {
  const spread = (Math.random() - 0.5) * 0.18;
  const flight = officer.angle + spread;
  officer.bullet = {
    x: officer.x + Math.cos(flight) * 16,
    y: officer.y + Math.sin(flight) * 16,
    vx: Math.cos(flight) * ENEMY_BULLET_SPEED,
    vy: Math.sin(flight) * ENEMY_BULLET_SPEED,
    life: 0.75,
    maxLife: 0.75,
    kind: "enemyBullet",
  };
  combat.effects.push(officer.bullet);
  if (Math.random() < 0.42 && distance(officer.x, officer.y, player.x, player.y) < 190) {
    damagePlayer(player, 7, now, 1);
  }
}

export function addCombatEffect(combat, effect) {
  combat.effects.push({ maxLife: 0.3, ...effect });
}

function bulletBlocked(bullet, city) {
  if (bullet.x < 0 || bullet.x > WORLD.oceanStart || bullet.y < 0 || bullet.y > WORLD.height) return true;
  for (const building of city.buildings) {
    if (bullet.x >= building.x && bullet.x <= building.x + building.w
        && bullet.y >= building.y && bullet.y <= building.y + building.h) return true;
  }
  return false;
}

function resolvePlayerBullet(bullet, police, traffic, onCrime) {
  const targets = [...police.officers, ...traffic.pedestrians, ...traffic.cars, ...police.units];
  if (targets.length === 0) return false;
  const hit = targets.find((item) => item.health > 0 && !item.dead
    && distance(bullet.x, bullet.y, item.x, item.y) <= (item.radius || 9) + 2);
  if (!hit) return false;
  hit.health = Math.max(0, hit.health - BULLET_DAMAGE);
  hit.hit = 0.18;
  bullet.life = 0;
  const isPerson = police.officers.includes(hit) || traffic.pedestrians.includes(hit);
  if (isPerson) onCrime(hit.health <= 0 ? "murder" : "assault", hit.x, hit.y);
  if (hit.health <= 0) {
    hit.dead = true;
    police.officers = police.officers.filter((item) => item !== hit);
  }
  return true;
}

export function updateCombatBullets(combat, player, police, city, delta, onCrime, traffic = { cars: [], pedestrians: [] }) {
  for (const effect of combat.effects) {
    if (effect.life <= 0 || (effect.kind !== "bullet" && effect.kind !== "enemyBullet")) continue;
    // Sweep in short segments so fast bullets cannot skip a person or a wall.
    const steps = Math.max(1, Math.ceil(Math.hypot(effect.vx, effect.vy) * delta / 4));
    for (let i = 0; i < steps && effect.life > 0; i += 1) {
      effect.x += effect.vx * delta / steps;
      effect.y += effect.vy * delta / steps;
      if (bulletBlocked(effect, city)) {
        effect.life = 0;
        break;
      }
      if (effect.kind === "enemyBullet") {
        if (distance(effect.x, effect.y, player.x, player.y) < 13) {
          effect.life = 0;
          damagePlayer(player, 8, performance.now() / 1000, 1);
        }
        continue;
      }
      resolvePlayerBullet(effect, police, traffic, onCrime);
    }
  }
}

export function combatStatus(combat) {
  return {
    magazine: combat.magazine,
    reserve: combat.reserveAmmo,
    reloading: combat.reloadTimer > 0,
  };
}

// A health kit and an ammo crate live in the city and respawn after jobs.
export function createPickups() {
  return PICKUPS.map((item) => ({ ...item, active: true }));
}

function collectPickup(item, player, combat, onPickup) {
  if (item.kind === "health") {
    if (player.health >= player.maxHealth) return false;
    const before = player.health;
    player.health = Math.min(player.maxHealth, player.health + item.amount);
    if (onPickup) onPickup(item, player.health - before);
    return true;
  }
  if (item.kind === "ammo") {
    if (combat.reserveAmmo >= MAX_RESERVE) return false;
    const before = combat.reserveAmmo;
    combat.reserveAmmo = Math.min(MAX_RESERVE, combat.reserveAmmo + item.amount);
    if (onPickup) onPickup(item, combat.reserveAmmo - before);
    return true;
  }
  return false;
}

export function updatePickups(pickups, player, combat, onPickup) {
  let collected = 0;
  for (const item of pickups) {
    if (!item.active || !player || !combat) continue;
    if (distance(player.x, player.y, item.x, item.y) > (item.radius || 24)) continue;
    if (!collectPickup(item, player, combat, onPickup)) continue;
    item.active = false;
    collected += 1;
  }
  return collected;
}

export function respawnPickups(pickups) {
  for (const item of pickups) item.active = true;
}
