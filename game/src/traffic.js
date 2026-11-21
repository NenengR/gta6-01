import { ROAD_X, ROAD_Y, WORLD, angleDelta, clamp, distance, makeRng, pick, turnToward } from "./config.js";
import { createVehicle, resolveVehicleCollision } from "./vehicles.js";

const COLORS = ["#d34f45", "#e4a73d", "#3f8ea3", "#e8e1cf", "#6f7f92", "#7b9560", "#9c5f83", "#d9d4c8"];

function makeTarget(rng, roadX, roadY) {
  const vertical = rng() > 0.5;
  if (vertical) {
    return {
      x: pick(rng, roadX) + (rng() > 0.5 ? 32 : -32),
      y: rng() * WORLD.height,
      vertical,
    };
  }
  return {
    x: rng() * (WORLD.oceanStart - 220),
    y: pick(rng, roadY) + (rng() > 0.5 ? 32 : -32),
    vertical,
  };
}

export function createTraffic(seed = 1, city) {
  const rng = makeRng(seed + 97);
  const cars = [];
  const pedestrians = [];

  for (let index = 0; index < 34; index += 1) {
    const target = makeTarget(rng, city.roadX, city.roadY);
    const car = createVehicle({
      x: target.x,
      y: target.y,
      angle: target.vertical ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() > 0.5 ? 0 : Math.PI),
      color: COLORS[index % COLORS.length],
      type: index % 9 === 0 ? "truck" : "sedan",
      ai: true,
    });
    car.target = target;
    car.rng = rng;
    car.aiSpeed = 72 + rng() * 70;
    car.aiCruise = car.aiSpeed;
    car.slowdown = 0;
    cars.push(car);
  }

  for (let index = 0; index < 20; index += 1) {
    const horizontal = index % 2 === 0;
    const lane = pick(rng, horizontal ? city.roadY : city.roadX);
    pedestrians.push({
      x: horizontal ? rng() * 2600 : lane + 55 + rng() * 16,
      y: horizontal ? lane + 55 + rng() * 16 : rng() * 2100,
      angle: rng() * Math.PI * 2,
      speed: 28 + rng() * 25,
      phase: rng() * Math.PI * 2,
      color: pick(rng, ["#e7b276", "#7bb4aa", "#d68179", "#9a83bb", "#e5d7ad", "#7095ba"]),
      radius: 7,
      kind: "pedestrian",
      health: 60,
      maxHealth: 60,
      dead: false,
    });
  }

  return { rng, cars, pedestrians };
}

function steerTrafficCar(car, delta, city) {
  const target = car.target;
  const angleToTarget = Math.atan2(target.y - car.y, target.x - car.x);
  const error = angleDelta(car.angle, angleToTarget);
  car.angle = turnToward(car.angle, car.angle + error, delta * 1.8);
  const speedFactor = clamp(1 - Math.abs(error) * 0.7, 0.22, 1);
  car.vx = Math.cos(car.angle) * car.aiCruise * speedFactor;
  car.vy = Math.sin(car.angle) * car.aiCruise * speedFactor;

  if (distance(car.x, car.y, target.x, target.y) < 70) {
    const next = makeTarget(car.rng, city.roadX, city.roadY);
    const vertical = Math.abs(next.x - car.x) < 3;
    next.vertical = vertical;
    next.y = vertical ? (next.y > car.y ? WORLD.height + 80 : -80) : next.y;
    next.x = vertical ? next.x : (next.x > car.x ? WORLD.oceanStart - 160 : -80);
    car.target = next;
  }
}

export function updateTraffic(traffic, player, city, delta, now) {
  for (const car of traffic.cars) {
    // Parked cars are scenery until stolen. An abandoned car has ai = false and
    // must never steer itself after the player exits (P1-7).
    if (!car.ai || car.occupied || car.parked || car.health <= 0) continue;
    let obstacle = null;
    let obstacleDistance = 135;
    for (const other of traffic.cars) {
      if (other === car) continue;
      const currentDistance = distance(car.x, car.y, other.x, other.y);
      if (currentDistance < obstacleDistance) {
        const aheadX = Math.cos(car.angle) * (other.x - car.x) + Math.sin(car.angle) * (other.y - car.y);
        const across = Math.abs(-Math.sin(car.angle) * (other.x - car.x) + Math.cos(car.angle) * (other.y - car.y));
        if (aheadX > 0 && across < 28) {
          obstacle = other;
          obstacleDistance = currentDistance;
        }
      }
    }
    if (player.vehicle && player.vehicle !== car) {
      const currentDistance = distance(car.x, car.y, player.vehicle.x, player.vehicle.y);
      if (currentDistance < obstacleDistance) {
        const aheadX = Math.cos(car.angle) * (player.vehicle.x - car.x) + Math.sin(car.angle) * (player.vehicle.y - car.y);
        const across = Math.abs(-Math.sin(car.angle) * (player.vehicle.x - car.x) + Math.cos(car.angle) * (player.vehicle.y - car.y));
        if (aheadX > 0 && across < 30) {
          obstacle = player.vehicle;
          obstacleDistance = currentDistance;
        }
      }
    }
    if (obstacle && obstacleDistance < 100) {
      car.aiCruise = Math.max(28, car.aiSpeed * (obstacleDistance - 42) / 58);
      car.slowdown = 1;
    } else {
      car.aiCruise += (car.aiSpeed - car.aiCruise) * (1 - Math.exp(-delta * 2.5));
      car.slowdown = Math.max(0, car.slowdown - delta);
    }
    steerTrafficCar(car, delta, city);
    car.x += car.vx * delta;
    car.y += car.vy * delta;
    city.resolveCircle(car, car.radius);
    car.speed = Math.hypot(car.vx, car.vy);
    if (car.x < -130 || car.x > WORLD.oceanStart - 90 || car.y < -130 || car.y > WORLD.height + 130) {
      const target = makeTarget(car.rng, city.roadX, city.roadY);
      car.x = target.x;
      car.y = target.y;
      car.target = target;
    }
  }

  for (const pedestrian of traffic.pedestrians) {
    if (pedestrian.dead) continue;
    pedestrian.phase += delta * 2.2;
    pedestrian.x += Math.cos(pedestrian.angle) * pedestrian.speed * delta;
    pedestrian.y += Math.sin(pedestrian.angle) * pedestrian.speed * delta;
    if (pedestrian.x < 90 || pedestrian.x > WORLD.oceanStart - 170 || pedestrian.y < 90 || pedestrian.y > WORLD.height - 90) {
      pedestrian.angle += Math.PI * (0.55 + traffic.rng() * 0.7);
    }
  }
}

export function addParkedCars(traffic, city) {
  const parkedPositions = [
    { x: 680, y: 500, angle: Math.PI / 2 },
    { x: 1110, y: 740, angle: 0 },
    { x: 1480, y: 1120, angle: Math.PI / 2 },
    { x: 1880, y: 1420, angle: 0 },
    { x: 2260, y: 1860, angle: Math.PI / 2 },
    { x: 820, y: 1940, angle: Math.PI },
    { x: 2380, y: 620, angle: 0 },
  ];
  for (const position of parkedPositions) {
    const car = createVehicle({ ...position, color: COLORS[parkedPositions.indexOf(position) % COLORS.length], parked: true });
    traffic.cars.push(car);
  }
}

export function findTrafficCar(traffic, id) {
  return traffic.cars.find((car) => car.id === id) || null;
}

export function resolvePlayerTrafficCollisions(traffic, vehicle, now, onCrime) {
  for (const car of traffic.cars) {
    if (car !== vehicle) resolveVehicleCollision(vehicle, car);
  }
  for (const pedestrian of traffic.pedestrians) {
    if (pedestrian.dead) continue;
    const dx = pedestrian.x - vehicle.x;
    const dy = pedestrian.y - vehicle.y;
    const separation = Math.hypot(dx, dy);
    const minimum = vehicle.radius + pedestrian.radius;
    if (separation >= minimum) continue;
    const nx = separation > 0 ? dx / separation : Math.cos(vehicle.angle);
    const ny = separation > 0 ? dy / separation : Math.sin(vehicle.angle);
    pedestrian.x = vehicle.x + nx * (minimum + 1);
    pedestrian.y = vehicle.y + ny * (minimum + 1);
    const impact = Math.max(0, vehicle.vx * nx + vehicle.vy * ny);
    if (impact < 20 || now < (pedestrian.vehicleHitUntil || 0)) continue;
    pedestrian.vehicleHitUntil = now + 0.6;
    pedestrian.health = Math.max(0, pedestrian.health - impact * 0.45);
    pedestrian.dead = pedestrian.health <= 0;
    pedestrian.hit = 0.3;
    vehicle.vx *= 0.85;
    vehicle.vy *= 0.85;
    vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
    onCrime(pedestrian.dead ? "murder" : "assault", pedestrian.x, pedestrian.y);
  }
}
