// The playable city, built from the world layout. It answers the questions
// every other module asks: is this point on a road, does it hit a building,
// which district is it in, is it water. It also keeps the day and night
// clock and places the small details: trees, lamps and signs.
import { CONFIG } from './config.js';

export function makeCity(world, rng) {
  let clock = 8;
  const details = buildDetails(world, rng);

  function inside(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  return {
    world,
    details,
    isRoad(x, y) {
      for (const r of world.roads) {
        if (inside(r, x, y)) return true;
      }
      return false;
    },
    hitsBuilding(x, y) {
      for (const b of world.buildings) {
        if (inside(b, x, y)) return true;
      }
      return false;
    },
    isWater(x, y) {
      return inside(world.sea, x, y);
    },
    isSand(x, y) {
      return inside(world.sand, x, y);
    },
    districtAt(x, y) {
      for (const d of world.districts) {
        if (inside(d, x, y)) return d.name;
      }
      return 'Old Town';
    },
    update(dt) {
      clock += dt * 0.02;
      if (clock >= 24) clock -= 24;
    },
    hour() {
      return clock;
    },
    daylight() {
      const t = (clock - 6) / 12;
      if (t < 0 || t > 1) return 0.25;
      return 0.25 + 0.75 * Math.sin(t * Math.PI);
    },
  };
}

function buildDetails(world, rng) {
  const trees = [];
  const lamps = [];
  const signs = [];
  for (let i = 0; i < 48; i++) {
    const x = rng.float(320, CONFIG.city.width - 60);
    const y = rng.float(60, CONFIG.city.height - 60);
    let bad = false;
    for (const b of world.buildings) {
      if (x >= b.x - 20 && x <= b.x + b.w + 20 && y >= b.y - 20 && y <= b.y + b.h + 20) {
        bad = true;
        break;
      }
    }
    if (!bad) trees.push({ x: Math.round(x), y: Math.round(y), r: rng.int(10, 16) });
  }
  for (const r of world.roads) {
    if (!r.vertical) continue;
    for (const h of world.roads) {
      if (h.vertical) continue;
      lamps.push({ x: r.x + r.w + 14, y: h.y + h.h + 14 });
    }
  }
  const spots = [
    world.spawns.missionTargets.lime,
    world.spawns.missionTargets.docks,
    world.spawns.missionTargets.lighthouse,
    world.spawns.policeStation,
  ];
  for (const s of spots) {
    signs.push({ x: s.x + 40, y: s.y - 30, text: '!' });
  }
  return { trees, lamps, signs };
}
