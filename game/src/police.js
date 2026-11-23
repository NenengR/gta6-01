// The police. When the wanted level rises, police cars spawn near the
// player and chase; at three stars and above they set up roadblocks ahead
// of the player. If a unit gets close to the player on foot, the player
// is arrested and the run ends busted. When no unit can see the player
// for a while, the wanted level cools down.
import { CONFIG } from './config.js';

export function makePolice(rng, city, vehicles) {
  const units = [];
  const blocks = [];
  let spawnTimer = 0;
  let hiddenTimer = 0;

  function spawnUnit(player) {
    const angle = rng.float(0, Math.PI * 2);
    const dist = rng.float(420, 620);
    let x = player.x + Math.cos(angle) * dist;
    let y = player.y + Math.sin(angle) * dist;
    x = Math.max(60, Math.min(CONFIG.city.width - 60, x));
    y = Math.max(60, Math.min(CONFIG.city.height - 60, y));
    const car = vehicles.add('cruiser', x, y, Math.atan2(player.y - y, player.x - x));
    car.driver = 'police';
    units.push({ car, siren: true });
  }

  function placeRoadblocks(player) {
    blocks.length = 0;
    for (let i = 0; i < 2; i++) {
      const ahead = 320 + i * 160;
      const bx = player.x + Math.cos(player.angle) * ahead;
      const by = player.y + Math.sin(player.angle) * ahead;
      blocks.push({ x: bx, y: by, angle: player.angle + Math.PI / 2 });
    }
  }

  return {
    units,
    blocks,
    heat() {
      return units.length;
    },
    isChasing() {
      return units.length > 0;
    },
    clear() {
      for (const u of units) {
        const i = vehicles.list.indexOf(u.car);
        if (i >= 0) vehicles.list.splice(i, 1);
      }
      units.length = 0;
      blocks.length = 0;
      spawnTimer = 0;
      hiddenTimer = 0;
    },
    update(dt, player) {
      if (player.wanted <= 0) {
        for (let i = units.length - 1; i >= 0; i--) {
          const u = units[i];
          if (!u.car) {
            units.splice(i, 1);
            continue;
          }
          const d = Math.hypot(u.car.x - player.x, u.car.y - player.y);
          if (d > 900) {
            const idx = vehicles.list.indexOf(u.car);
            if (idx >= 0) vehicles.list.splice(idx, 1);
            units.splice(i, 1);
          }
        }
        blocks.length = 0;
        return false;
      }
      const want = Math.min(CONFIG.police.maxUnits, player.wanted + 2);
      spawnTimer -= dt;
      if (units.length < want && spawnTimer <= 0) {
        spawnUnit(player);
        spawnTimer = CONFIG.police.spawnDelay;
      }
      if (player.wanted >= CONFIG.police.roadblockAt && blocks.length === 0) {
        placeRoadblocks(player);
      }
      let seen = false;
      for (const u of units) {
        const car = u.car;
        if (!car || car.wrecked) continue;
        const dx = player.x - car.x;
        const dy = player.y - car.y;
        const d = Math.hypot(dx, dy);
        if (d < CONFIG.police.sightDist) seen = true;
        const wantAngle = Math.atan2(dy, dx);
        let diff = wantAngle - car.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 2 * dt));
        car.speed = Math.min(CONFIG.police.chaseSpeed, car.speed + 420 * dt);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        if (!city.hitsBuilding(nx, car.y) && !city.isWater(nx, car.y)) car.x = nx;
        if (!city.hitsBuilding(car.x, ny) && !city.isWater(car.x, ny)) car.y = ny;
        if (d < CONFIG.police.arrestDist && player.onFoot) {
          return true;
        }
      }
      if (seen) {
        hiddenTimer = 0;
      } else {
        hiddenTimer += dt;
        if (hiddenTimer > CONFIG.police.hideDelay) {
          player.lowerWanted(1);
          hiddenTimer = 0;
        }
      }
      return false;
    },
  };
}
