import { PICKUPS, WORLD, clamp, distance } from "./config.js";
import { damagePlayer } from "./player.js";

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

export function updateCombat(combat, player, input, city, delta, now, pointer, police, traffic, onCrime) {
  combat.punchCooldown = Math.max(0, combat.punchCooldown - delta);
  combat.fireCooldown = Math.max(0, combat.fireCooldown - delta);
  combat.hitFlash = Math.max(0, combat.hitFlash - delta);
  for (const effect of combat.effects) effect.life -= delta;
  combat.effects = combat.effects.filter((effect) => effect.life > 0);

  if (player.vehicle) return;

  if (input.wasPressed("reload") && combat.reloadTimer <= 0 && combat.magazine < 12 && combat.reserveAmmo > 0) {
    combat.reloadTimer = 0.85;
  }
  if (combat.reloadTimer > 0) {
    combat.reloadTimer = Math.max(0, combat.reloadTimer - delta);
    if (combat.reloadTimer === 0) {
      const needed = 12 - combat.magazine;
      const loaded = Math.min(needed, combat.reserveAmmo);
      combat.magazine += loaded;
      combat.reserveAmmo -= loaded;
    }
  }

  if (input.wasPressed("punch") && combat.punchCooldown <= 0) {
    combat.punchCooldown = 0.46;
    const target = findPunchTarget(player, combat, police, traffic);
    if (target) {
      target.health -= 28;
      target.hit = 0.18;
      combat.hitFlash = 0.12;
      combat.effects.push({ type: "impact", x: target.x, y: target.y, life: 0.22, maxLife: 0.22 });
      if (police.officers.includes(target)) {
        target.health -= 6;
        if (target.health <= 0) police.officers = police.officers.filter((officer) => officer !== target);
      } else if (target.kind === "pedestrian") {
        target.health -= 8;
        if (target.health <= 0) target.dead = true;
      }
      target.health = Math.max(0, target.health);
      onCrime(target.health <= 0 ? "murder" : "assault", target.x, target.y);
    } else {
      combat.effects.push({ type: "punch", x: player.x + Math.cos(player.angle) * 26, y: player.y + Math.sin(player.angle) * 26, life: 0.15, maxLife: 0.15 });
    }
  }

  if (input.mouseDown && combat.fireCooldown <= 0 && combat.reloadTimer <= 0) {
    if (combat.magazine > 0) {
      combat.magazine -= 1;
      combat.fireCooldown = 0.19;
      firePistol(combat, player, pointer, police, onCrime, now);
    } else {
      combat.fireCooldown = 0.28;
    }
  }
}

function findPunchTarget(player, combat, police, traffic) {
  const reach = 42;
  for (const officer of police.officers) {
    if (officer.health > 0 && distance(player.x, player.y, officer.x, officer.y) < reach) return officer;
  }
  for (const pedestrian of traffic.pedestrians) {
    if (!pedestrian.dead && distance(player.x, player.y, pedestrian.x, pedestrian.y) < reach) return pedestrian;
  }
  return null;
}

function firePistol(combat, player, pointer, police, onCrime, now) {
  const targetAngle = pointer ? Math.atan2(pointer.y - player.y, pointer.x - player.x) : player.angle;
  player.angle = targetAngle;
  const originX = player.x + Math.cos(targetAngle) * 18;
  const originY = player.y + Math.sin(targetAngle) * 18;
  const spread = (Math.random() - 0.5) * 0.075;
  const angle = targetAngle + spread;
  const shot = {
    x: originX,
    y: originY,
    vx: Math.cos(angle) * 920,
    vy: Math.sin(angle) * 920,
    life: 0.8,
    maxLife: 0.8,
    kind: "bullet",
  };
  combat.effects.push(shot);
  combat.effects.push({ type: "muzzle", x: originX, y: originY, life: 0.07, maxLife: 0.07 });
  onCrime("gunshot", originX, originY);


}

export function policeShoot(officer, player, now, combat) {
  const spread = (Math.random() - 0.5) * 0.18;
  const angle = officer.angle + spread;
  officer.bullet = {
    x: officer.x + Math.cos(angle) * 16,
    y: officer.y + Math.sin(angle) * 16,
    vx: Math.cos(angle) * 650,
    vy: Math.sin(angle) * 650,
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

export function updateCombatBullets(combat, player, police, city, delta, onCrime, traffic = { cars: [], pedestrians: [] }) {
  for (const effect of combat.effects) {
    if (effect.life <= 0 || (effect.kind !== "bullet" && effect.kind !== "enemyBullet")) continue;
    // Sweep in short segments so fast bullets cannot skip a person or a wall.
    const steps = Math.max(1, Math.ceil(Math.hypot(effect.vx, effect.vy) * delta / 4));
    for (let index = 0; index < steps && effect.life > 0; index += 1) {
      effect.x += effect.vx * delta / steps;
      effect.y += effect.vy * delta / steps;
      if (effect.x < 0 || effect.x > WORLD.oceanStart || effect.y < 0 || effect.y > WORLD.height
          || city.buildings.some((b) => effect.x >= b.x && effect.x <= b.x + b.w && effect.y >= b.y && effect.y <= b.y + b.h)) {
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
      const targets = [...police.officers, ...traffic.pedestrians, ...traffic.cars, ...police.units];
      const target = targets.find((item) => item.health > 0 && !item.dead
        && distance(effect.x, effect.y, item.x, item.y) <= (item.radius || 9) + 2);
      if (!target) continue;
      target.health = Math.max(0, target.health - 34);
      target.hit = 0.18;
      effect.life = 0;
      const person = police.officers.includes(target) || traffic.pedestrians.includes(target);
      if (person) onCrime(target.health <= 0 ? "murder" : "assault", target.x, target.y);
      if (target.health <= 0) {
        target.dead = true;
        police.officers = police.officers.filter((item) => item !== target);
      }
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

// P1-8: a health kit and an ammo crate live in the city and respawn after jobs.
export function createPickups() {
  return PICKUPS.map((item) => ({ ...item, active: true }));
}

export function updatePickups(pickups, player, combat, onPickup) {
  let collected = 0;
  for (const item of pickups) {
    if (!item.active || !player || !combat) continue;
    if (distance(player.x, player.y, item.x, item.y) > (item.radius || 24)) continue;
    if (item.kind === "health") {
      if (player.health >= player.maxHealth) continue;
      const before = player.health;
      player.health = Math.min(player.maxHealth, player.health + item.amount);
      if (onPickup) onPickup(item, player.health - before);
    } else if (item.kind === "ammo") {
      if (combat.reserveAmmo >= 96) continue;
      const before = combat.reserveAmmo;
      combat.reserveAmmo = Math.min(96, combat.reserveAmmo + item.amount);
      if (onPickup) onPickup(item, combat.reserveAmmo - before);
    } else {
      continue;
    }
    item.active = false;
    collected += 1;
  }
  return collected;
}

export function respawnPickups(pickups) {
  for (const item of pickups) item.active = true;
}
