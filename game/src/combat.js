import { WORLD, clamp, distance } from "./config.js";
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
      if (target.kind === "officer") {
        target.health -= 6;
        if (target.health <= 0) police.officers = police.officers.filter((officer) => officer !== target);
      } else if (target.kind === "pedestrian") {
        target.health -= 8;
        if (target.health <= 0) target.dead = true;
      }
      onCrime("assault", target.x, target.y);
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
    if (distance(player.x, player.y, officer.x, officer.y) < reach) return officer;
  }
  for (const pedestrian of traffic.pedestrians) {
    if (!pedestrian.dead && distance(player.x, player.y, pedestrian.x, pedestrian.y) < reach) return pedestrian;
  }
  return null;
}

function firePistol(combat, player, pointer, police, onCrime, now) {
  const originX = player.x + Math.cos(player.angle) * 18;
  const originY = player.y + Math.sin(player.angle) * 18;
  const targetAngle = pointer ? Math.atan2(pointer.y - player.y, pointer.x - player.x) : player.angle;
  player.angle = targetAngle;
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

  for (const officer of police.officers) {
    if (officer.health > 0 && distance(officer.x, officer.y, originX, originY) < 28) {
      officer.health -= 34;
      officer.hit = 0.18;
      if (officer.health <= 0) police.officers = police.officers.filter((item) => item !== officer);
    }
  }
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

export function updateCombatBullets(combat, player, police, city, delta, onCrime) {
  for (const effect of combat.effects) {
    if (effect.kind !== "bullet" && effect.kind !== "enemyBullet") continue;
    effect.x += effect.vx * delta;
    effect.y += effect.vy * delta;
    if (effect.x < 0 || effect.x > WORLD.oceanStart || effect.y < 0 || effect.y > WORLD.height) effect.life = 0;
    for (const building of city.buildings) {
      if (effect.x > building.x && effect.x < building.x + building.w && effect.y > building.y && effect.y < building.y + building.h) effect.life = 0;
    }
    if (effect.kind === "enemyBullet" && distance(effect.x, effect.y, player.x, player.y) < 13) {
      effect.life = 0;
      damagePlayer(player, 8, performance.now() / 1000, 1);
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
