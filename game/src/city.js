import { COAST, COLORS, LANDMARKS, ROAD_X, ROAD_Y, ROAD_WIDTH, STREET_NAMES, WORLD, makeRng, pick } from "./config.js";

const FACADE_COLORS = ["#d87955", "#e29b62", "#c9684f", "#e7b86f", "#b85c52", "#d99872"];
const ROOF_COLORS = ["#8e5146", "#a85c45", "#86504a", "#b66a4d"];
const SIGN_WORDS = ["MARKET", "CAFE", "HOTEL", "STUDIO", "DINER"];
const BLOCK_GAP = 14;

function boxesIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function landmarkZone(landmark) {
  const half = landmark.kind === "npc" ? 20 : 54;
  return { x: landmark.x - half, y: landmark.y - half, w: half * 2, h: half * 2 };
}

function pointNearZone(x, y, zone, radius) {
  const nearestX = Math.max(zone.x, Math.min(x, zone.x + zone.w));
  const nearestY = Math.max(zone.y, Math.min(y, zone.y + zone.h));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < (radius + 2) * (radius + 2);
}

function touchesLandmark(x, y, radius) {
  for (const landmark of LANDMARKS) {
    if (pointNearZone(x, y, landmarkZone(landmark), radius)) return true;
  }
  return false;
}

function onRoadSurface(x, y, radius) {
  const reach = ROAD_WIDTH / 2 + radius;
  for (const road of ROAD_X) {
    if (Math.abs(x - road) <= reach) return true;
  }
  for (const road of ROAD_Y) {
    if (Math.abs(y - road) <= reach) return true;
  }
  return false;
}

function insideAnyBuilding(x, y, buildings) {
  for (const building of buildings) {
    if (x >= building.x && x <= building.x + building.w && y >= building.y && y <= building.y + building.h) return true;
  }
  return false;
}

function buildBlock(originX, originY, spanX, spanY, rng, blockNo) {
  const buildings = [];
  const hasPlaza = (blockNo * 7 + Math.floor(rng() * 5)) % 13 === 0;
  const cellW = (spanX - BLOCK_GAP) / 2;
  const cellH = (spanY - BLOCK_GAP) / 2;
  let plazaCell = null;
  const cells = [
    { row: 0, col: 0 }, { row: 0, col: 1 },
    { row: 1, col: 0 }, { row: 1, col: 1 },
  ];
  for (const cell of cells) {
    if (hasPlaza && cell.row === 1 && cell.col === 1) {
      plazaCell = { x: originX + cellW + BLOCK_GAP, y: originY + cellH + BLOCK_GAP, w: cellW, h: cellH };
      continue;
    }
    const jitterX = (rng() - 0.5) * 12;
    const jitterY = (rng() - 0.5) * 10;
    buildings.push({
      x: originX + cell.col * (cellW + BLOCK_GAP) + jitterX,
      y: originY + cell.row * (cellH + BLOCK_GAP) + jitterY,
      w: cellW - jitterX,
      h: cellH - jitterY,
      color: pick(rng, FACADE_COLORS),
      roof: pick(rng, ROOF_COLORS),
      sign: rng() > 0.72 ? pick(rng, SIGN_WORDS) : "",
      height: 3 + Math.floor(rng() * 5),
    });
  }
  return { buildings, plazaCell };
}

function scatterCornerTrees(rng, buildings, trees) {
  for (const roadX of ROAD_X) {
    for (const roadY of ROAD_Y) {
      if (rng() <= 0.62) continue;
      const tree = {
        x: roadX + ROAD_WIDTH / 2 + 11,
        y: roadY + ROAD_WIDTH / 2 + 11,
        r: 9 + rng() * 1.5,
      };
      const clear = !onRoadSurface(tree.x, tree.y, tree.r)
        && !touchesLandmark(tree.x, tree.y, tree.r)
        && !insideAnyBuilding(tree.x, tree.y, buildings);
      if (clear) trees.push(tree);
    }
  }
}

function pushOutOfBuildings(entity, radius, buildings) {
  for (const building of buildings) {
    const nearestX = Math.max(building.x, Math.min(entity.x, building.x + building.w));
    const nearestY = Math.max(building.y, Math.min(entity.y, building.y + building.h));
    const dx = entity.x - nearestX;
    const dy = entity.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq >= radius * radius) continue;
    if (distSq > 0.0001) {
      const len = Math.sqrt(distSq);
      entity.x += (dx / len) * (radius - len);
      entity.y += (dy / len) * (radius - len);
      continue;
    }
    const exits = [
      { gap: entity.x - building.x, axis: "x", place: building.x - radius },
      { gap: building.x + building.w - entity.x, axis: "x", place: building.x + building.w + radius },
      { gap: entity.y - building.y, axis: "y", place: building.y - radius },
      { gap: building.y + building.h - entity.y, axis: "y", place: building.y + building.h + radius },
    ];
    let best = exits[0];
    for (const exit of exits) {
      if (exit.gap < best.gap) best = exit;
    }
    entity[best.axis] = best.place;
  }
}

export function createCity(seed = 1) {
  const rng = makeRng(seed);
  const buildings = [];
  const plazas = [];
  const trees = [];
  const edge = ROAD_WIDTH / 2 + 14;
  let blockNo = 0;

  for (let col = 0; col < ROAD_X.length - 1; col += 1) {
    for (let row = 0; row < ROAD_Y.length - 1; row += 1) {
      const spanX = ROAD_X[col + 1] - ROAD_X[col] - edge * 2;
      const spanY = ROAD_Y[row + 1] - ROAD_Y[row] - edge * 2;
      const block = buildBlock(ROAD_X[col] + edge, ROAD_Y[row] + edge, spanX, spanY, rng, blockNo);
      blockNo += 1;
      for (const building of block.buildings) {
        const overlapsLandmark = LANDMARKS.some((landmark) => {
          const zone = landmarkZone(landmark);
          return boxesIntersect(building.x, building.y, building.w, building.h, zone.x, zone.y, zone.w, zone.h);
        });
        if (!overlapsLandmark) buildings.push(building);
      }
      if (block.plazaCell) {
        const cell = block.plazaCell;
        const centerX = cell.x + cell.w / 2;
        const centerY = cell.y + cell.h / 2;
        plazas.push({ x: centerX, y: centerY, w: cell.w, h: cell.h, r: Math.min(cell.w, cell.h) * 0.45 });
        trees.push({ x: centerX - cell.w * 0.3, y: centerY - cell.h * 0.3, r: 14 });
        trees.push({ x: centerX + cell.w * 0.3, y: centerY + cell.h * 0.3, r: 12 });
      }
    }
  }

  // Corner trees sit on the sidewalk strip, never on the road surface.
  scatterCornerTrees(rng, buildings, trees);

  return {
    seed,
    width: WORLD.width,
    height: WORLD.height,
    roadX: ROAD_X,
    roadY: ROAD_Y,
    roadWidth: ROAD_WIDTH,
    buildings,
    plazas,
    trees,
    names: STREET_NAMES,
    isRoad(x, y) {
      if (x > WORLD.oceanStart - 10) return false;
      return ROAD_X.some((road) => Math.abs(x - road) <= ROAD_WIDTH / 2)
        || ROAD_Y.some((road) => Math.abs(y - road) <= ROAD_WIDTH / 2);
    },
    resolveCircle(entity, radius) {
      pushOutOfBuildings(entity, radius, buildings);
      entity.x = Math.max(radius, Math.min(entity.x, WORLD.oceanStart - radius));
      entity.y = Math.max(radius, Math.min(entity.y, WORLD.height - radius));
      return entity;
    },
  };
}

function paintPlazas(ctx, city) {
  for (const plaza of city.plazas) {
    const centerX = plaza.x + plaza.w / 2;
    const centerY = plaza.y + plaza.h / 2;
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    ctx.strokeStyle = "rgba(150,122,84,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(plaza.x + 1, plaza.y + 1, plaza.w - 2, plaza.h - 2);
    ctx.strokeStyle = "rgba(150,122,84,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plaza.x, centerY);
    ctx.lineTo(plaza.x + plaza.w, centerY);
    ctx.moveTo(centerX, plaza.y);
    ctx.lineTo(centerX, plaza.y + plaza.h);
    ctx.stroke();
    ctx.fillStyle = "#8d6a45";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PLAZA", centerX, plaza.y + plaza.h * 0.28);
  }
}

function strokeRoadLines(ctx, roads, vertical, height, limit) {
  for (const road of roads) {
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(road, 0);
      ctx.lineTo(road, height);
    } else {
      ctx.moveTo(0, road);
      ctx.lineTo(limit, road);
    }
    ctx.stroke();
  }
}

export function drawCityGround(ctx, city) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, city.width, city.height);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(COAST.sandStart, 0, city.width - COAST.sandStart, city.height);
  ctx.fillStyle = COLORS.sandLight;
  ctx.fillRect(COAST.wetSandStart, 0, COAST.waterStart - COAST.wetSandStart, city.height);
  ctx.fillStyle = COLORS.ocean;
  ctx.fillRect(COAST.waterStart, 0, city.width - COAST.waterStart, city.height);
  ctx.fillStyle = COLORS.oceanDeep;
  ctx.fillRect(COAST.deepWaterStart, 0, city.width - COAST.deepWaterStart, city.height);
  paintPlazas(ctx, city);

  const roadEnd = COAST.waterStart - 10;
  const passes = [
    { style: COLORS.sidewalk, width: city.roadWidth + 28, dashed: false },
    { style: COLORS.asphalt, width: city.roadWidth, dashed: false },
    { style: COLORS.lane, width: 3, dashed: true },
  ];
  for (const pass of passes) {
    ctx.save();
    ctx.strokeStyle = pass.style;
    ctx.lineWidth = pass.width;
    if (pass.dashed) ctx.setLineDash([24, 22]);
    strokeRoadLines(ctx, city.roadX, true, city.height, roadEnd);
    strokeRoadLines(ctx, city.roadY, false, city.height, roadEnd);
    ctx.restore();
  }
}

function paintLandmark(ctx, landmark) {
  switch (landmark.kind) {
    case "tower": {
      ctx.strokeStyle = "#d9e2e8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(landmark.x - 18, landmark.y + 14);
      ctx.lineTo(landmark.x, landmark.y - 72);
      ctx.lineTo(landmark.x + 18, landmark.y + 14);
      ctx.moveTo(landmark.x - 12, landmark.y - 20);
      ctx.lineTo(landmark.x + 12, landmark.y - 20);
      ctx.moveTo(landmark.x - 6, landmark.y - 46);
      ctx.lineTo(landmark.x + 6, landmark.y - 46);
      ctx.stroke();
      ctx.fillStyle = "#ff6d63";
      ctx.beginPath();
      ctx.arc(landmark.x, landmark.y - 76, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "lockup": {
      ctx.fillStyle = "#6b747c";
      ctx.fillRect(landmark.x - 34, landmark.y - 24, 68, 48);
      ctx.fillStyle = "#3c454c";
      ctx.fillRect(landmark.x - 26, landmark.y - 14, 52, 38);
      ctx.strokeStyle = "#98a5ad";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const y = landmark.y - 8 + i * 8;
        ctx.beginPath();
        ctx.moveTo(landmark.x - 24, y);
        ctx.lineTo(landmark.x + 24, y);
        ctx.stroke();
      }
      break;
    }
    case "gallery": {
      ctx.fillStyle = "#e6dcc0";
      ctx.fillRect(landmark.x - 38, landmark.y - 26, 76, 52);
      ctx.fillStyle = "#b99246";
      ctx.fillRect(landmark.x - 38, landmark.y - 32, 76, 10);
      ctx.fillStyle = "#8c6b32";
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(landmark.x + i * 15 - 3, landmark.y - 22, 6, 42);
      break;
    }
    default: {
      ctx.fillStyle = landmark.color || "#d9a06b";
      ctx.fillRect(landmark.x - 8, landmark.y - 8, 16, 20);
      ctx.fillStyle = "#e7b98f";
      ctx.beginPath();
      ctx.arc(landmark.x, landmark.y - 13, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  const isPerson = landmark.kind === "npc";
  ctx.fillStyle = isPerson ? "#fff4d4" : "#f5d78c";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(landmark.label, landmark.x, isPerson ? landmark.y - 24 : landmark.y + 42);
}

export function drawCityLandmarks(ctx, city) {
  for (const landmark of LANDMARKS) {
    ctx.save();
    paintLandmark(ctx, landmark);
    ctx.restore();
  }
  void city;
}

function paintTree(ctx, tree) {
  ctx.fillStyle = "rgba(30,55,34,0.24)";
  ctx.beginPath();
  ctx.arc(tree.x + 5, tree.y + 7, tree.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#47764d";
  ctx.beginPath();
  ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#72a45d";
  ctx.beginPath();
  ctx.arc(tree.x - tree.r * 0.25, tree.y - tree.r * 0.25, tree.r * 0.62, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCityBuildings(ctx, city) {
  for (const building of city.buildings) {
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(building.x + 9, building.y + 11, building.w, building.h);
    ctx.fillStyle = building.color;
    ctx.fillRect(building.x, building.y, building.w, building.h);
    ctx.fillStyle = building.roof;
    ctx.fillRect(building.x + 8, building.y + 8, building.w - 16, building.h - 16);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(building.x + 13, building.y + 13, building.w - 26, building.h - 26);
    if (building.sign) {
      ctx.fillStyle = "#f5d78c";
      ctx.fillRect(building.x + 14, building.y + building.h - 24, Math.min(70, building.w - 28), 13);
      ctx.fillStyle = "#5b3b34";
      ctx.font = "bold 8px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(building.sign, building.x + building.w / 2, building.y + building.h - 14);
    }
  }
  for (const tree of city.trees) paintTree(ctx, tree);
  drawCityLandmarks(ctx, city);
}
