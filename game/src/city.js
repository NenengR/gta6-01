import { COLORS, ROAD_X, ROAD_Y, ROAD_WIDTH, STREET_NAMES, WORLD, makeRng, pick } from "./config.js";

const BUILDING_COLORS = ["#d87955", "#e29b62", "#c9684f", "#e7b86f", "#b85c52", "#d99872"];

function makeBlock(cx, cy, width, depth, rng, index) {
  const buildings = [];
  const plaza = (index * 7 + Math.floor(rng() * 5)) % 13 === 0;
  const gap = 14;
  const cellWidth = (width - gap) / 2;
  const cellDepth = (depth - gap) / 2;
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      if (plaza && row === 1 && column === 1) continue;
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
  return { buildings, plaza };
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
      const block = makeBlock(
        ROAD_X[column] + margin,
        ROAD_Y[row] + margin,
        ROAD_X[column + 1] - ROAD_X[column] - margin * 2,
        ROAD_Y[row + 1] - ROAD_Y[row] - margin * 2,
        rng,
        blockIndex,
      );
      blockIndex += 1;
      buildings.push(...block.buildings);
      if (block.plaza) {
        const plazaX = ROAD_X[column] + ROAD_WIDTH / 2;
        const plazaY = ROAD_Y[row] + ROAD_WIDTH / 2;
        plazas.push({ x: plazaX, y: plazaY, r: 82 });
        trees.push({ x: plazaX + 60, y: plazaY - 58, r: 17 }, { x: plazaX - 64, y: plazaY + 54, r: 15 });
      }
    }
  }

  for (let column = 0; column < ROAD_X.length; column += 1) {
    for (let row = 0; row < ROAD_Y.length; row += 1) {
      if (rng() > 0.62) {
        trees.push({ x: ROAD_X[column] + 62, y: ROAD_Y[row] + 66, r: 14 + rng() * 7 });
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
    drawCityGround(ctx) {
      return drawCityGround(ctx, this);
    },
    drawCityBuildings(ctx) {
      return drawCityBuildings(ctx, this);
    },
  };
}

export function drawCityGround(ctx, city) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, city.width, city.height);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(city.width - 380, 0, 380, city.height);
  ctx.fillStyle = COLORS.sandLight;
  ctx.fillRect(city.width - 190, 0, 190, city.height);
  ctx.fillStyle = COLORS.ocean;
  ctx.fillRect(city.width - 220, 0, 220, city.height);
  ctx.fillStyle = COLORS.oceanDeep;
  ctx.fillRect(city.width - 85, 0, 85, city.height);

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
    ctx.lineTo(city.width - 220, road);
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
    ctx.lineTo(city.width - 220, road);
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
    ctx.lineTo(city.width - 220, road);
    ctx.stroke();
  }
  ctx.restore();
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
}
