import { COAST, COLORS, LANDMARKS, ROAD_X, ROAD_Y, ROAD_WIDTH, STREET_NAMES, WORLD, makeRng, pick } from "./config.js";

const BUILDING_COLORS = ["#d87955", "#e29b62", "#c9684f", "#e7b86f", "#b85c52", "#d99872"];

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function reservedRect(landmark) {
  const pad = landmark.kind === "npc" ? 20 : 54;
  return { x: landmark.x - pad, y: landmark.y - pad, w: pad * 2, h: pad * 2 };
}

function nearLandmark(x, y, radius) {
  for (const landmark of LANDMARKS) {
    const rect = reservedRect(landmark);
    const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
    if ((x - cx) ** 2 + (y - cy) ** 2 < (radius + 2) ** 2) return true;
  }
  return false;
}

function onAsphalt(x, y, radius) {
  const limit = ROAD_WIDTH / 2 + radius;
  return ROAD_X.some((road) => Math.abs(x - road) <= limit)
    || ROAD_Y.some((road) => Math.abs(y - road) <= limit);
}

function buildingAt(x, y, buildings) {
  return buildings.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

function makeBlock(cx, cy, width, depth, rng, index) {
  const buildings = [];
  const plaza = (index * 7 + Math.floor(rng() * 5)) % 13 === 0;
  const gap = 14;
  const cellWidth = (width - gap) / 2;
  const cellDepth = (depth - gap) / 2;
  let plazaRect = null;
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      if (plaza && row === 1 && column === 1) {
        plazaRect = { x: cx + cellWidth + gap, y: cy + cellDepth + gap, w: cellWidth, h: cellDepth };
        continue;
      }
      const widthJitter = (rng() - 0.5) * 12;
      const depthJitter = (rng() - 0.5) * 10;
      buildings.push({
        x: cx + column * (cellWidth + gap) + widthJitter,
        y: cy + row * (cellDepth + gap) + depthJitter,
        w: cellWidth - widthJitter,
        h: cellDepth - depthJitter,
        color: pick(rng, BUILDING_COLORS),
        roof: pick(rng, ["#8e5146", "#a85c45", "#86504a", "#b66a4d"]),
        sign: rng() > 0.72 ? pick(rng, ["MARKET", "CAFE", "HOTEL", "STUDIO", "DINER"]) : "",
        height: 3 + Math.floor(rng() * 5),
      });
    }
  }
  return { buildings, plaza, plazaRect };
}

export function createCity(seed = 1) {
  const rng = makeRng(seed);
  const buildings = [];
  const plazas = [];
  const trees = [];
  let blockIndex = 0;

  for (let column = 0; column < ROAD_X.length - 1; column += 1) {
    for (let row = 0; row < ROAD_Y.length - 1; row += 1) {
      const margin = ROAD_WIDTH / 2 + 14;
      const width = ROAD_X[column + 1] - ROAD_X[column] - margin * 2;
      const depth = ROAD_Y[row + 1] - ROAD_Y[row] - margin * 2;
      const block = makeBlock(ROAD_X[column] + margin, ROAD_Y[row] + margin, width, depth, rng, blockIndex);
      blockIndex += 1;
      for (const building of block.buildings) {
        const rect = { x: building.x, y: building.y, w: building.w, h: building.h };
        const reserved = LANDMARKS.some((lm) => rectsOverlap(rect.x, rect.y, rect.w, rect.h,
          reservedRect(lm).x, reservedRect(lm).y, reservedRect(lm).w, reservedRect(lm).h));
        if (!reserved) buildings.push(building);
      }
      if (block.plaza && block.plazaRect) {
        const rect = block.plazaRect;
        const px = rect.x + rect.w / 2;
        const py = rect.y + rect.h / 2;
        plazas.push({ x: px, y: py, w: rect.w, h: rect.h, r: Math.min(rect.w, rect.h) * 0.45 });
        trees.push({ x: px - rect.w * 0.3, y: py - rect.h * 0.3, r: 14 });
        trees.push({ x: px + rect.w * 0.3, y: py + rect.h * 0.3, r: 12 });
      }
    }
  }

  // P1-3: corner trees sit on the sidewalk strip, never on the road surface.
  for (let column = 0; column < ROAD_X.length; column += 1) {
    for (let row = 0; row < ROAD_Y.length; row += 1) {
      if (rng() > 0.62) {
        const tree = {
          x: ROAD_X[column] + ROAD_WIDTH / 2 + 11,
          y: ROAD_Y[row] + ROAD_WIDTH / 2 + 11,
          r: 9 + rng() * 1.5,
        };
        if (!onAsphalt(tree.x, tree.y, tree.r)
          && !nearLandmark(tree.x, tree.y, tree.r)
          && !buildingAt(tree.x, tree.y, buildings)) trees.push(tree);
      }
    }
  }

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
      for (const building of buildings) {
        const closestX = Math.max(building.x, Math.min(entity.x, building.x + building.w));
        const closestY = Math.max(building.y, Math.min(entity.y, building.y + building.h));
        const deltaX = entity.x - closestX;
        const deltaY = entity.y - closestY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared >= radius * radius) continue;
        if (distanceSquared > 0.0001) {
          const length = Math.sqrt(distanceSquared);
          entity.x += (deltaX / length) * (radius - length);
          entity.y += (deltaY / length) * (radius - length);
        } else {
          const distances = [
            { amount: entity.x - building.x, axis: "x", target: building.x - radius },
            { amount: building.x + building.w - entity.x, axis: "x", target: building.x + building.w + radius },
            { amount: entity.y - building.y, axis: "y", target: building.y - radius },
            { amount: building.y + building.h - entity.y, axis: "y", target: building.y + building.h + radius },
          ];
          const nearest = distances.sort((a, b) => a.amount - b.amount)[0];
          entity[nearest.axis] = nearest.target;
        }
      }
      entity.x = Math.max(radius, Math.min(entity.x, WORLD.oceanStart - radius));
      entity.y = Math.max(radius, Math.min(entity.y, WORLD.height - radius));
      return entity;
    },
  };
}

function drawPlazas(ctx, city) {
  for (const plaza of city.plazas) {
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    ctx.strokeStyle = "rgba(150,122,84,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(plaza.x + 1, plaza.y + 1, plaza.w - 2, plaza.h - 2);
    ctx.strokeStyle = "rgba(150,122,84,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plaza.x, plaza.y + plaza.h / 2);
    ctx.lineTo(plaza.x + plaza.w, plaza.y + plaza.h / 2);
    ctx.moveTo(plaza.x + plaza.w / 2, plaza.y);
    ctx.lineTo(plaza.x + plaza.w / 2, plaza.y + plaza.h);
    ctx.stroke();
    ctx.fillStyle = "#8d6a45";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PLAZA", plaza.x + plaza.w / 2, plaza.y + plaza.h * 0.28);
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
  drawPlazas(ctx, city);

  const roadEnd = COAST.waterStart - 10;
  ctx.strokeStyle = COLORS.sidewalk;
  ctx.lineWidth = city.roadWidth + 28;
  for (const road of city.roadX) {
    ctx.beginPath();
    ctx.moveTo(road, 0);
    ctx.lineTo(road, city.height);
    ctx.stroke();
  }
  for (const road of city.roadY) {
    ctx.beginPath();
    ctx.moveTo(0, road);
    ctx.lineTo(roadEnd, road);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.asphalt;
  ctx.lineWidth = city.roadWidth;
  for (const road of city.roadX) {
    ctx.beginPath();
    ctx.moveTo(road, 0);
    ctx.lineTo(road, city.height);
    ctx.stroke();
  }
  for (const road of city.roadY) {
    ctx.beginPath();
    ctx.moveTo(0, road);
    ctx.lineTo(roadEnd, road);
    ctx.stroke();
  }

  ctx.save();
  ctx.strokeStyle = COLORS.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([24, 22]);
  for (const road of city.roadX) {
    ctx.beginPath();
    ctx.moveTo(road, 0);
    ctx.lineTo(road, city.height);
    ctx.stroke();
  }
  for (const road of city.roadY) {
    ctx.beginPath();
    ctx.moveTo(0, road);
    ctx.lineTo(roadEnd, road);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLandmark(ctx, landmark) {
  if (landmark.kind === "tower") {
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
  } else if (landmark.kind === "lockup") {
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
  } else if (landmark.kind === "gallery") {
    ctx.fillStyle = "#e6dcc0";
    ctx.fillRect(landmark.x - 38, landmark.y - 26, 76, 52);
    ctx.fillStyle = "#b99246";
    ctx.fillRect(landmark.x - 38, landmark.y - 32, 76, 10);
    ctx.fillStyle = "#8c6b32";
    for (let i = -2; i <= 2; i += 1) ctx.fillRect(landmark.x + i * 15 - 3, landmark.y - 22, 6, 42);
  } else {
    ctx.fillStyle = landmark.color || "#d9a06b";
    ctx.fillRect(landmark.x - 8, landmark.y - 8, 16, 20);
    ctx.fillStyle = "#e7b98f";
    ctx.beginPath();
    ctx.arc(landmark.x, landmark.y - 13, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = landmark.kind === "npc" ? "#fff4d4" : "#f5d78c";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(landmark.label, landmark.x, landmark.kind === "npc" ? landmark.y - 24 : landmark.y + 42);
}

export function drawCityLandmarks(ctx, city) {
  for (const landmark of LANDMARKS) {
    ctx.save();
    drawLandmark(ctx, landmark);
    ctx.restore();
  }
  void city;
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
  for (const tree of city.trees) {
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
  drawCityLandmarks(ctx, city);
}
