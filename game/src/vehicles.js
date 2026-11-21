import { VEHICLE_COLORS, WORLD, angleDelta, clamp, distance, turnToward } from "./config.js";

let vehicleId = 0;

export function createVehicle({ x, y, angle = 0, color, type = "sedan", parked = false, ai = false } = {}) {
  vehicleId += 1;
  return {
    id: vehicleId,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steer: 0,
    color: color || VEHICLE_COLORS[vehicleId % VEHICLE_COLORS.length],
    type,
    parked,
    ai,
    occupied: false,
    radius: type === "truck" ? 25 : 20,
    length: type === "truck" ? 58 : 48,
    width: type === "truck" ? 27 : 22,
    health: 100,
    skid: 0,
    crashCooldown: 0,
    enginePower: type === "truck" ? 360 : 430,
    maxSpeed: type === "truck" ? 390 : 520,
  };
}

export function updateVehicle(vehicle, input, city, delta, now, controlled = false) {
  vehicle.crashCooldown = Math.max(0, vehicle.crashCooldown - delta);
  vehicle.skid = Math.max(0, vehicle.skid - delta * 1.8);

  if (!controlled) {
    vehicle.x += vehicle.vx * delta;
    vehicle.y += vehicle.vy * delta;
    city.resolveCircle(vehicle, vehicle.radius);
    vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
    return;
  }

  const throttle = (input.isDown("forward") ? 1 : 0) - (input.isDown("back") ? 1 : 0);
  const steering = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  const speedAlongCar = Math.cos(vehicle.angle) * vehicle.vx + Math.sin(vehicle.angle) * vehicle.vy;
  const maxReverse = 150;

  if (throttle > 0) {
    const grip = 1 - Math.exp(-delta * 2.4);
    vehicle.vx += Math.cos(vehicle.angle) * vehicle.enginePower * grip * delta;
    vehicle.vy += Math.sin(vehicle.angle) * vehicle.enginePower * grip * delta;
  } else if (throttle < 0) {
    const grip = 1 - Math.exp(-delta * 3.5);
    vehicle.vx += Math.cos(vehicle.angle) * vehicle.enginePower * 0.58 * grip * delta;
    vehicle.vy += Math.sin(vehicle.angle) * vehicle.enginePower * 0.58 * grip * delta;
  }

  const forwardSpeed = Math.cos(vehicle.angle) * vehicle.vx + Math.sin(vehicle.angle) * vehicle.vy;
  const reverseDrag = throttle === 0 ? 0.985 : 0.997;
  const lateralX = -Math.sin(vehicle.angle);
  const lateralY = Math.cos(vehicle.angle);
  const lateralSpeed = lateralX * vehicle.vx + lateralY * vehicle.vy;
  const gripAmount = 1 - Math.exp(-delta * (vehicle.skid > 0 ? 1.4 : 7.5));
  vehicle.vx -= lateralX * lateralSpeed * gripAmount;
  vehicle.vy -= lateralY * lateralSpeed * gripAmount;
  vehicle.vx *= reverseDrag;
  vehicle.vy *= reverseDrag;

  if (Math.abs(forwardSpeed) > vehicle.maxSpeed) {
    const scale = vehicle.maxSpeed / Math.abs(forwardSpeed);
    vehicle.vx *= scale;
    vehicle.vy *= scale;
  }
  if (throttle < 0 && forwardSpeed < -maxReverse) {
    const scale = maxReverse / Math.abs(forwardSpeed);
    vehicle.vx *= scale;
    vehicle.vy *= scale;
  }

  const speedRatio = clamp(Math.abs(speedAlongCar) / 190, 0, 1);
  if (steering !== 0 && Math.abs(speedAlongCar) > 8) {
    const turnRate = (1.8 + 2.1 * (1 - speedRatio)) * (speedAlongCar < 0 ? -1 : 1);
    vehicle.angle = turnToward(vehicle.angle, vehicle.angle + steering * turnRate * delta * 3, delta * 5);
    if (Math.abs(speedAlongCar) > 300 && Math.abs(steering) > 0) vehicle.skid = Math.max(vehicle.skid, 0.45);
  }

  const oldX = vehicle.x;
  const oldY = vehicle.y;
  vehicle.x += vehicle.vx * delta;
  vehicle.y += vehicle.vy * delta;
  const before = { x: vehicle.x, y: vehicle.y };
  city.resolveCircle(vehicle, vehicle.radius);
  if (Math.abs(before.x - vehicle.x) > 0.5 || Math.abs(before.y - vehicle.y) > 0.5) {
    const impact = Math.hypot(vehicle.x - oldX, vehicle.y - oldY);
    if (impact > 0.4 && vehicle.crashCooldown <= 0) {
      vehicle.health = clamp(vehicle.health - impact * 0.55, 0, 100);
      vehicle.crashCooldown = 0.18;
      vehicle.skid = 0.8;
    }
    vehicle.vx *= 0.45;
    vehicle.vy *= 0.45;
  }
  vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
}

export function getVehicleSpeed(vehicle) {
  return Math.round(vehicle.speed * 0.42);
}

export function isVehicleSlow(vehicle) {
  return vehicle.speed < 95;
}

export function nearbyVehicle(vehicles, player) {
  let nearest = null;
  let nearestDistance = 72;
  for (const vehicle of vehicles) {
    if (vehicle.occupied) continue;
    const currentDistance = distance(player.x, player.y, vehicle.x, vehicle.y);
    if (currentDistance < nearestDistance) {
      nearest = vehicle;
      nearestDistance = currentDistance;
    }
  }
  return nearest;
}

export function crashVehicle(vehicle, amount, now) {
  if (now < vehicle.crashCooldown) return;
  vehicle.health = clamp(vehicle.health - amount, 0, 100);
  vehicle.crashCooldown = 0.28;
  vehicle.skid = 1;
  vehicle.vx *= 0.65;
  vehicle.vy *= 0.65;
}

export function vehicleForwardPoint(vehicle, distanceAhead = 55) {
  return {
    x: vehicle.x + Math.cos(vehicle.angle) * distanceAhead,
    y: vehicle.y + Math.sin(vehicle.angle) * distanceAhead,
  };
}

export function recoverVehicle(vehicle) {
  vehicle.x = clamp(vehicle.x, vehicle.radius, WORLD.oceanStart - vehicle.radius);
  vehicle.y = clamp(vehicle.y, vehicle.radius, WORLD.height - vehicle.radius);
  vehicle.vx = 0;
  vehicle.vy = 0;
  vehicle.angle = 0;
  vehicle.speed = 0;
}
