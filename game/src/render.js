// World rendering for Sunbreak Coastline.
//
// drawScene paints the city from the top down: sea, sand, grass, roads,
// sidewalks, buildings, plaza, trees, lamps and signs, then the traffic,
// parked and police cars, the pedestrians, the combat effects, the player,
// the mission marker and a night tint. drawMinimap paints the same city
// small in the top right corner. All layout comes from city.world
// (roads, buildings, districts, sea, sand, plaza) and city.details
// (trees, lamps, signs). Cars come from vehicles.list, police units from
// police.units, roadblocks from police.blocks, combat effects from
// combat.hits. Night is city.daylight() below 0.35.

import { CONFIG } from './config.js';

const VIEW_W = (CONFIG && CONFIG.canvas && (CONFIG.canvas.width || CONFIG.canvas.w)) || 1280;
const VIEW_H = (CONFIG && CONFIG.canvas && (CONFIG.canvas.height || CONFIG.canvas.h)) || 800;
const MINIMAP_RECT = { x: 1080, y: 12, w: 188, h: 132 };
const PALETTE_FALLBACK = {
  grass: '#4a7c59',
  road: '#2f333a',
  roadLine: '#d9d9d9',
  sidewalk: '#8d9099',
  building: '#6b5b73',
  buildingRoof: '#8a7a94',
  sand: '#e6d3a3',
  water: '#1f6f8b',
  lamp: '#f4d35e',
  lampGlow: '#f4d35e',
  tree: '#2e6b3a',
  treeTrunk: '#5d4037',
  roadEdge: '#1c1e24',
  player: '#f1c40f',
  ped: '#e67e22',
  police: '#1a5276',
  taxi: '#f1c40f',
  minimapBg: '#1c2b33',
};

function colors() {
  const cfg = (CONFIG && CONFIG.colors) || {};
  const out = {};
  for (const k of Object.keys(PALETTE_FALLBACK)) {
    out[k] = cfg[k] || PALETTE_FALLBACK[k];
  }
  out.sea = cfg.water || PALETTE_FALLBACK.water;
  out.person = cfg.player || PALETTE_FALLBACK.player;
  return out;
}

function worldSize() {
  const cfg = (CONFIG && CONFIG.city) || {};
  return {
    w: cfg.width || cfg.w || 3200,
    h: cfg.height || cfg.h || 2400,
  };
}

function layoutOf(city) {
  return (city && city.world) || {};
}

function detailsOf(city) {
  return (city && city.details) || {};
}

function isNight(city) {
  if (!city || typeof city.daylight !== 'function') return false;
  return city.daylight() < 0.35;
}

function missionTarget(state) {
  const missions = state.missions;
  if (!missions || typeof missions.targetPos !== 'function') return null;
  try {
    const pos = missions.targetPos();
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
  } catch (e) {
    return null;
  }
  return null;
}

function drawWorld(ctx, state) {
  const C = colors();
  const city = state.city;
  const world = layoutOf(city);
  const details = detailsOf(city);
  const size = worldSize();
  const cam = state.camera;
  const sea = world.sea || { x: 0, y: 0, w: 110, h: size.h };
  const sand = world.sand || { x: 110, y: 0, w: 170, h: size.h };

  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = C.sea;
  ctx.fillRect(sea.x - cam.x, sea.y - cam.y, sea.w, sea.h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = sea.y + 30 + i * 32;
    ctx.beginPath();
    for (let x = sea.x + 8; x < sea.x + sea.w - 8; x += 12) {
      const wy = y + Math.sin(x * 0.08 + (state.time || 0) * 1.6 + i) * 3;
      if (x === sea.x + 8) ctx.moveTo(x - cam.x, wy - cam.y);
      else ctx.lineTo(x - cam.x, wy - cam.y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = C.sand;
  ctx.fillRect(sand.x - cam.x, sand.y - cam.y, sand.w, sand.h);

  const roads = world.roads || [];
  for (const r of roads) {
    ctx.fillStyle = C.sidewalk;
    ctx.fillRect(r.x - cam.x - 6, r.y - cam.y - 6, r.w + 12, r.h + 12);
    ctx.fillStyle = C.road;
    ctx.fillRect(r.x - cam.x, r.y - cam.y, r.w, r.h);
    ctx.fillStyle = C.roadLine;
    if (r.w > r.h) {
      for (let x = r.x + 16; x < r.x + r.w; x += 42) {
        ctx.fillRect(x - cam.x, r.y + r.h / 2 - 1.5 - cam.y, 22, 3);
      }
    } else {
      for (let y = r.y + 16; y < r.y + r.h; y += 42) {
        ctx.fillRect(r.x + r.w / 2 - 1.5 - cam.x, y - cam.y, 3, 22);
      }
    }
  }

  const plaza = world.plaza;
  if (plaza) {
    ctx.fillStyle = C.sidewalk;
    ctx.fillRect(plaza.x - cam.x, plaza.y - cam.y, plaza.w, plaza.h);
    ctx.fillStyle = C.roadLine;
    ctx.fillRect(plaza.x + 8 - cam.x, plaza.y + 8 - cam.y, plaza.w - 16, 3);
    ctx.fillRect(plaza.x + 8 - cam.x, plaza.y + plaza.h - 11 - cam.y, plaza.w - 16, 3);
  }

  const buildings = world.buildings || [];
  for (const b of buildings) {
    ctx.fillStyle = C.building;
    ctx.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
    ctx.fillStyle = C.buildingRoof;
    ctx.fillRect(b.x + 6 - cam.x, b.y + 6 - cam.y, b.w - 12, b.h - 12);
    ctx.fillStyle = C.lampGlow;
    for (let wy = b.y + 14; wy < b.y + b.h - 8; wy += 24) {
      for (let wx = b.x + 10; wx < b.x + b.w - 8; wx += 20) {
        ctx.fillRect(wx - cam.x, wy - cam.y, 3, 4);
      }
    }
  }

  const districts = world.districts || [];
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  for (const d of districts) {
    ctx.fillText((d.name || '').toUpperCase(), d.x + d.w / 2 - cam.x, d.y + d.h / 2 - cam.y);
  }
  ctx.textAlign = 'left';

  const trees = details.trees || [];
  for (const t of trees) {
    const r = t.r || 8;
    ctx.fillStyle = C.treeTrunk;
    ctx.fillRect(t.x - cam.x - 2, t.y - cam.y + r - 2, 4, 6);
    ctx.fillStyle = C.tree;
    ctx.beginPath();
    ctx.arc(t.x - cam.x, t.y - cam.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const lamps = details.lamps || [];
  for (const l of lamps) {
    ctx.fillStyle = C.lamp;
    ctx.fillRect(l.x - cam.x - 2, l.y - cam.y - 2, 4, 4);
    ctx.fillStyle = C.lampGlow;
    ctx.beginPath();
    ctx.arc(l.x - cam.x, l.y - cam.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const signs = details.signs || [];
  for (const s of signs) {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(s.x - cam.x - 4, s.y - cam.y - 12, 8, 24);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(s.x - cam.x - 3, s.y - cam.y - 11, 6, 12);
    if (s.text) {
      ctx.fillStyle = '#f5f5f5';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.text, s.x - cam.x, s.y - cam.y + 24);
    }
  }
}

function drawCar(ctx, car, cam, C) {
  if (!car) return;
  ctx.save();
  ctx.translate(car.x - cam.x, car.y - cam.y);
  ctx.rotate(car.angle || 0);
  const w = car.w || (car.type === 'truck' ? 52 : 42);
  const h = car.h || (car.type === 'truck' ? 24 : 20);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  ctx.fillStyle = car.color || C.road;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.fillRect(-w * 0.16, -h / 2 + 3, w * 0.32, h - 6);
  ctx.fillStyle = '#fdf6d8';
  ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 5);
  ctx.fillRect(w / 2 - 3, h / 2 - 7, 3, 5);
  if (car.type === 'cruiser') {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-6, -h / 2 - 4, 6, 4);
    ctx.fillStyle = '#3498db';
    ctx.fillRect(0, -h / 2 - 4, 6, 4);
  }
  ctx.restore();
}

function drawPeople(ctx, state, C) {
  const cam = state.camera;
  const peds = (state.traffic && state.traffic.peds) || [];
  for (const p of peds) {
    if (!p) continue;
    ctx.fillStyle = p.color || C.ped;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, p.r || 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = state.player;
  if (p && p.onFoot) {
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y - cam.y, p.radius || 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - cam.x, p.y - cam.y);
    ctx.lineTo(p.x - cam.x + Math.cos(p.angle || 0) * 16, p.y - cam.y + Math.sin(p.angle || 0) * 16);
    ctx.stroke();
  }
}

function drawEffects(ctx, state, cam, C) {
  const hits = (state.combat && state.combat.hits) || [];
  for (const e of hits) {
    if (!e || typeof e.x !== 'number' || typeof e.y !== 'number') continue;
    const label = e.text || e.label || '';
    if (!label) continue;
    const life = typeof e.life === 'number' && e.life > 0 ? e.life : 1;
    const t = typeof e.t === 'number' ? e.t : 0;
    const a = Math.max(0, Math.min(1, 1 - t / life));
    ctx.globalAlpha = a;
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f5f5';
    ctx.fillText(label, e.x - cam.x, e.y - cam.y - 8);
    ctx.globalAlpha = 1;
  }
}

function drawMissionMarker(ctx, state, cam, C) {
  const target = missionTarget(state);
  if (!target) return;
  const x = target.x - cam.x;
  const y = target.y - cam.y;
  const bob = Math.sin((state.time || 0) * 3) * 4;
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y + bob - 26, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.moveTo(x, y + bob - 10);
  ctx.lineTo(x - 7, y + bob - 22);
  ctx.lineTo(x + 7, y + bob - 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(x, y + bob, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMinimap(ctx, state) {
  const C = colors();
  const city = state.city;
  const world = layoutOf(city);
  const size = worldSize();
  const r = MINIMAP_RECT;
  const sx = r.w / size.w;
  const sy = r.h / size.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = C.minimapBg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const sea = world.sea || { x: 0, y: 0, w: 110, h: size.h };
  const sand = world.sand || { x: 110, y: 0, w: 170, h: size.h };
  ctx.fillStyle = C.sea;
  ctx.fillRect(r.x + sea.x * sx, r.y + sea.y * sy, sea.w * sx, sea.h * sy);
  ctx.fillStyle = C.sand;
  ctx.fillRect(r.x + sand.x * sx, r.y + sand.y * sy, sand.w * sx, sand.h * sy);
  const roads = world.roads || [];
  ctx.fillStyle = C.roadLine;
  for (const road of roads) {
    ctx.fillRect(r.x + road.x * sx, r.y + road.y * sy, road.w * sx, road.h * sy);
  }
  const buildings = world.buildings || [];
  ctx.fillStyle = C.building;
  for (const b of buildings) {
    ctx.fillRect(r.x + b.x * sx, r.y + b.y * sy, b.w * sx, b.h * sy);
  }

  const target = missionTarget(state);
  if (target) {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(r.x + target.x * sx, r.y + target.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const cars = (state.vehicles && state.vehicles.list) || [];
  for (const car of cars) {
    if (!car) continue;
    ctx.fillStyle = car.type === 'cruiser' ? '#3498db' : '#ecf0f1';
    ctx.fillRect(r.x + car.x * sx - 1, r.y + car.y * sy - 1, 2, 2);
  }

  const units = (state.police && state.police.units) || [];
  for (const u of units) {
    if (!u || !u.car) continue;
    ctx.fillStyle = '#3498db';
    ctx.fillRect(r.x + u.car.x * sx - 2, r.y + u.car.y * sy - 2, 4, 4);
  }

  const p = state.player;
  if (p) {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(r.x + p.x * sx, r.y + p.y * sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const vw = VIEW_W * sx;
    const vh = VIEW_H * sy;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + state.camera.x * sx, r.y + state.camera.y * sy, vw, vh);
  }
  ctx.restore();
}

export function drawScene(ctx, state) {
  const cam = state.camera;
  const C = colors();
  drawWorld(ctx, state);

  const cars = (state.vehicles && state.vehicles.list) || [];
  for (const car of cars) drawCar(ctx, car, cam, C);

  const blocks = (state.police && state.police.blocks) || [];
  for (const b of blocks) {
    if (!b) continue;
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect((b.x || 0) - cam.x - 10, (b.y || 0) - cam.y - 3, 20, 6);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect((b.x || 0) - cam.x - 10, (b.y || 0) - cam.y - 3, 20, 2);
  }

  const units = (state.police && state.police.units) || [];
  for (const u of units) {
    if (u && u.car) drawCar(ctx, u.car, cam, C);
  }

  drawPeople(ctx, state, C);
  drawEffects(ctx, state, cam, C);
  drawMissionMarker(ctx, state, cam, C);

  if (isNight(state.city)) {
    ctx.fillStyle = 'rgba(8, 16, 48, 0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  drawMinimap(ctx, state);
}

export { MINIMAP_RECT };
