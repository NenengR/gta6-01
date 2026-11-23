import { ROAD_X, ROAD_Y, WORLD, angleDelta, clamp, distance, makeRng, pick, turnToward } from "./config.js";
import { createVehicle, resolveVehicleCollision } from "./vehicles.js";

const PAINT = ["#d34f45", "#e4a73d", "#3f8ea3", "#e8e1cf", "#6f7f92", "#7b9560", "#9c5f83", "#d9d4c8"];
const WALKER_COLORS = ["#e7b276", "#7bb4aa", "#d68179", "#9a83bb", "#e5d7ad", "#7095ba"];
const PARKED_SPOTS = [
  { x: 680, y: 500, angle: Math.PI / 2 },
  { x: 1110, y: 740, angle: 0 },
  { x: 1480, y: 1120, angle: Math.PI / 2 },
  { x: 1880, y: 1420, angle: 0 },
  { x: 2260, y: 1860, angle: Math.PI / 2 },
  { x: 820, y: 1940, angle: Math.PI },
  { x: 2380, y: 620, angle: 0 },
];

function pickWaypoint(rng, roadX, roadY) {
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

  for (let i = 0; i < 34; i += 1) {
    const waypoint = pickWaypoint(rng, city.roadX, city.roadY);
    const heading = waypoint.vertical
      ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2)
      : (rng() > 0.5 ? 0 : Math.PI);
    const car = createVehicle({
      x: waypoint.x,
      y: waypoint.y,
      angle: heading,
      color: PAINT[i % PAINT.length],
      type: i % 9 === 0 ? "truck" : "sedan",
      ai: true,
    });
    car.target = waypoint;
    car.rng = rng;
    car.aiSpeed = 72 + rng() * 70;
    car.aiCruise = car.aiSpeed;
    car.slowdown = 0;
    cars.push(car);
  }

  for (let i = 0; i < 20; i += 1) {
    const horizontal = i % 2 === 0;
    const lane = pick(rng, horizontal ? city.roadY : city.roadX);
    pedestrians.push({
      x: horizontal ? rng() * 2600 : lane + 55 + rng() * 16,
      y: horizontal ? lane + 55 + rng() * 16 : rng() * 2100,
      angle: rng() * Math.PI * 2,
      speed: 28 + rng() * 25,
      phase: rng() * Math.PI * 2,
      color: pick(rng, WALKER_COLORS),
      radius: 7,
      kind: "pedestrian",
      health: 60,
      maxHealth: 60,
      dead: false,
    });
  }

  return { rng, cars, pedestrians };
}

function retargetCar(car, city) {
  const next = pickWaypoint(car.rng, city.roadX, city.roadY);
  const vertical = Math.abs(next.x - car.x) < 3;
  next.vertical = vertical;
  next.y = vertical ? (next.y > car.y ? WORLD.height + 80 : -80) : next.y;
  next.x = vertical ? next.x : (next.x > car.x ? WORLD.oceanStart - 160 : -80);
  car.target = next;
}

function steerCar(car, delta, city) {
  const target = car.target;
  const bearing = Math.atan2(target.y - car.y, target.x - car.x);
  const error = angleDelta(car.angle, bearing);
  car.angle = turnToward(car.angle, car.angle + error, delta * 1.8);
  const factor = clamp(1 - Math.abs(error) * 0.7, 0.22, 1);
  car.vx = Math.cos(car.angle) * car.aiCruise * factor;
  car.vy = Math.sin(car.angle) * car.aiCruise * factor;
  if (distance(car.x, car.y, target.x, target.y) < 70) retargetCar(car, city);
}

function lookAhead(car, traffic, player) {
  let nearest = null;
  let nearestGap = 135;
  const forwardX = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const scan = (other, laneWidth) => {
    const gap = distance(car.x, car.y, other.x, other.y);
    if (gap >= nearestGap) return;
    const ahead = forwardX * (other.x - car.x) + forwardY * (other.y - car.y);
    const across = Math.abs(-forwardY * (other.x - car.x) + forwardX * (other.y - car.y));
    if (ahead > 0 && across < laneWidth) {
      nearest = other;
      nearestGap = gap;
    }
  };
  for (const other of traffic.cars) {
    if (other !== car) scan(other, 28);
  }
  if (player.vehicle && player.vehicle !== car) scan(player.vehicle, 30);
  return { obstacle: nearest, gap: nearestGap };
}

function driveCar(car, traffic, player, city, delta) {
  const seen = lookAhead(car, traffic, player);
  if (seen.obstacle && seen.gap < 100) {
    car.aiCruise = Math.max(28, car.aiSpeed * (seen.gap - 42) / 58);
    car.slowdown = 1;
  } else {
    car.aiCruise += (car.aiSpeed - car.aiCruise) * (1 - Math.exp(-delta * 2.5));
    car.slowdown = Math.max(0, car.slowdown - delta);
  }
  steerCar(car, delta, city);
  car.x += car.vx * delta;
  car.y += car.vy * delta;
  city.resolveCircle(car, car.radius);
  car.speed = Math.hypot(car.vx, car.vy);
  const offMap = car.x < -130 || car.x > WORLD.oceanStart - 90 || car.y < -130 || car.y > WORLD.height + 130;
  if (offMap) {
    const waypoint = pickWaypoint(car.rng, city.roadX, city.roadY);
    car.x = waypoint.x;
    car.y = waypoint.y;
    car.target = waypoint;
  }
}

function wanderPedestrian(pedestrian, rng, delta) {
  pedestrian.phase += delta * 2.2;
  pedestrian.x += Math.cos(pedestrian.angle) * pedestrian.speed * delta;
  pedestrian.y += Math.sin(pedestrian.angle) * pedestrian.speed * delta;
  const outside = pedestrian.x < 90 || pedestrian.x > WORLD.oceanStart - 170
    || pedestrian.y < 90 || pedestrian.y > WORLD.height - 90;
  if (outside) pedestrian.angle += Math.PI * (0.55 + rng() * 0.7);
}

export function updateTraffic(traffic, player, city, delta, now) {
  for (const car of traffic.cars) {
    // Parked cars are scenery until stolen. An abandoned car has ai = false and
    // must never steer itself after the player exits.
    if (!car.ai || car.occupied || car.parked || car.health <= 0) continue;
    driveCar(car, traffic, player, city, delta);
  }
  for (const pedestrian of traffic.pedestrians) {
    if (pedestrian.dead) continue;
    wanderPedestrian(pedestrian, traffic.rng, delta);
  }
  void now;
}

export function addParkedCars(traffic, city) {
  PARKED_SPOTS.forEach((spot, index) => {
    const car = createVehicle({ ...spot, color: PAINT[index % PAINT.length], parked: true });
    traffic.cars.push(car);
  });
  void city;
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
    const gap = Math.hypot(dx, dy);
    const minGap = vehicle.radius + pedestrian.radius;
    if (gap >= minGap) continue;
    const nx = gap > 0 ? dx / gap : Math.cos(vehicle.angle);
    const ny = gap > 0 ? dy / gap : Math.sin(vehicle.angle);
    pedestrian.x = vehicle.x + nx * (minGap + 1);
    pedestrian.y = vehicle.y + ny * (minGap + 1);
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
