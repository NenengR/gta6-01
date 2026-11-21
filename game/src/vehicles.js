import { VEHICLE_COLORS, WORLD, angleDelta, clamp, distance, turnToward } from "./config.js";

let vehicleId = 0;

// IDs are local to a newly generated world, not to the lifetime of the page.
export function resetVehicleIds() {
  vehicleId = 0;
}

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
    stolen: false,
    radius: type === "truck" ? 25 : 20,
    length: type === "truck" ? 58 : 48,
    width: type === "truck" ? 27 : 22,
    health: 100,
    skid: 0,
    launch: 0,
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

  // P2-2: integrate engine force once per step. The old grip term multiplied
  // enginePower by an exponential factor AND by delta again, so a car at full
  // throttle topped out near 95 px/s and could never outrun a 213 px/s unit.
  vehicle.launch = clamp(vehicle.launch + (throttle !== 0 ? delta * 2.2 : -delta * 3), 0, 1);
  const drive = vehicle.enginePower * vehicle.launch * delta;
  if (throttle > 0) {
    vehicle.vx += Math.cos(vehicle.angle) * drive;
    vehicle.vy += Math.sin(vehicle.angle) * drive;
  } else if (throttle < 0) {
    vehicle.vx -= Math.cos(vehicle.angle) * drive * 0.58;
    vehicle.vy -= Math.sin(vehicle.angle) * drive * 0.58;
  }

  const forwardSpeed = Math.cos(vehicle.angle) * vehicle.vx + Math.sin(vehicle.angle) * vehicle.vy;
  const reverseDrag = throttle === 0 ? 0.985 : 0.997;
  const lateralX = -Math.sin(vehicle.angle);
  const lateralY = Math.cos(vehicle.angle);
  const lateralSpeed = lateralX * vehicle.vx + lateralY * vehicle.vy;
  const gripAmount = 1 - Math.exp(-delta * (vehicle.skid > 0 ? 1.4 : 4.5));
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
      vehicle.health = clamp(vehicle.health - impact * 0.3, 0, 100);
      vehicle.crashCooldown = 0.18;
      vehicle.skid = 0.5;
    }
    vehicle.vx *= 0.8;
    vehicle.vy *= 0.8;
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
  vehicle.launch = 0;
}

// Separate overlapping bodies and apply damage only for closing impacts.
export function resolveVehicleCollision(vehicle, other) {
  const dx = other.x - vehicle.x;
  const dy = other.y - vehicle.y;
  const separation = Math.hypot(dx, dy);
  const minimum = vehicle.radius + other.radius;
  if (separation >= minimum) return 0;
  const nx = separation > 0 ? dx / separation : Math.cos(vehicle.angle);
  const ny = separation > 0 ? dy / separation : Math.sin(vehicle.angle);
  const overlap = minimum - separation + 0.1;
  vehicle.x -= nx * overlap / 2;
  vehicle.y -= ny * overlap / 2;
  other.x += nx * overlap / 2;
  other.y += ny * overlap / 2;
  const closing = Math.max(0, (vehicle.vx - other.vx) * nx + (vehicle.vy - other.vy) * ny);
  if (closing <= 0) return 0;
  vehicle.vx -= nx * closing * 0.65;
  vehicle.vy -= ny * closing * 0.65;
  other.vx += nx * closing * 0.65;
  other.vy += ny * closing * 0.65;
  vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
  other.speed = Math.hypot(other.vx, other.vy);
  const damage = Math.min(55, closing * 0.12);
  vehicle.health = Math.max(0, vehicle.health - damage);
  other.health = Math.max(0, other.health - damage);
  vehicle.crashCooldown = 0.25;
  return damage;
}

export function markVehicleStolen(vehicle) {
  if (vehicle.police || vehicle.stolen) return false;
  vehicle.stolen = true;
  return true;
}
