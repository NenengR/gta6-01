// The layout of Sunbreak Coastline as plain data: districts, roads,
// buildings, the beach and the sea, and every spawn point the game needs.
// No drawing here, only rectangles and points other modules can ask about.
import { CONFIG } from './config.js';

export function buildWorld(rng) {
  const W = CONFIG.city.width;
  const H = CONFIG.city.height;
  const roadW = 96;
  const vRoads = [400, 1000, 1600, 2200, 2800];
  const hRoads = [350, 900, 1450, 2000];

  const roads = [];
  for (const x of vRoads) {
    roads.push({ x: x - roadW / 2, y: 0, w: roadW, h: H, vertical: true });
  }
  for (const y of hRoads) {
    roads.push({ x: 0, y: y - roadW / 2, w: W, h: roadW, vertical: false });
  }

  const districts = [
    { name: 'Beach', x: 0, y: 0, w: 280, h: H },
    { name: 'Downtown', x: 900, y: 700, w: 1400, h: 900 },
    { name: 'Docks', x: 2200, y: 1800, w: 1000, h: 600 },
    { name: 'Suburbs', x: 900, y: 0, w: 2300, h: 600 },
  ];

  const sea = { x: 0, y: 0, w: 110, h: H };
  const sand = { x: 110, y: 0, w: 170, h: H };
  const plaza = { x: 1450, y: 1250, w: 300, h: 200 };

  const buildings = [];
  const colEdges = [0, 352, 448, 952, 1048, 1552, 1648, 2152, 2248, 2752, 2848, W];
  const rowEdges = [0, 302, 398, 852, 948, 1402, 1498, 1952, 2048, H];
  for (let ci = 0; ci < colEdges.length - 1; ci += 2) {
    for (let ri = 0; ri < rowEdges.length - 1; ri += 2) {
      const bx = colEdges[ci];
      const by = rowEdges[ri];
      const bw = colEdges[ci + 1] - bx;
      const bh = rowEdges[ri + 1] - by;
      if (bw < 120 || bh < 120) continue;
      if (bx + bw < 300) continue;
      const count = rng.int(1, 2);
      for (let k = 0; k < count; k++) {
        const w = rng.float(bw * 0.3, bw * 0.7);
        const h = rng.float(bh * 0.3, bh * 0.7);
        const x = bx + 24 + rng.float(0, Math.max(1, bw - w - 48));
        const y = by + 24 + rng.float(0, Math.max(1, bh - h - 48));
        buildings.push({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(h),
          color: rng.pick(CONFIG.colors.building),
        });
      }
    }
  }

  const parkedCars = [];
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      const roadX = rng.pick(vRoads);
      parkedCars.push({ x: roadX + 62, y: rng.float(120, H - 120), angle: Math.PI / 2 });
    } else {
      const roadY = rng.pick(hRoads);
      parkedCars.push({ x: rng.float(320, W - 120), y: roadY + 62, angle: 0 });
    }
  }

  const spawns = {
    player: { x: 1600, y: 940 },
    policeStation: { x: 1600, y: 1500 },
    parkedCars,
    missionTargets: {
      lime: { x: 1000, y: 902 },
      docks: { x: 2650, y: 2100 },
      lighthouse: { x: 170, y: 180 },
    },
  };

  return { roads, buildings, districts, sea, sand, plaza, spawns };
}
