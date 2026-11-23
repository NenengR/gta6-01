import { VEHICLE_COLORS, WORLD, angleDelta, clamp, distance, turnToward } from "./config.js";

let nextVehicleId = 0;

const BODY = {
  sedan: { radius: 20, length: 48, width: 22, enginePower: 430, maxSpeed: 520 },
  truck: { radius: 25, length: 58, width: 27, enginePower: 360, maxSpeed: 390 },
};
const MAX_REVERSE_SPEED = 150;
const DISPLAY_SPEED_SCALE = 0.42;
const SLOW_SPEED = 95;
const NEARBY_RANGE = 72;

// IDs are local to a newly generated world, not to the lifetime of the page.
export function resetVehicleIds() {
  nextVehicleId = 0;
}

export function createVehicle({ x, y, angle = 0, color, type = "sedan", parked = false, ai = false } = {}) {
  nextVehicleId += 1;
  const dims = BODY[type] || BODY.sedan;
  return {
    id: nextVehicleId,
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    speed: 0,
    steer: 0,
    color: color || VEHICLE_COLORS[nextVehicleId % VEHICLE_COLORS.length],
    type,
    parked,
    ai,
    occupied: false,
    stolen: false,
    radius: dims.radius,
    length: dims.length,
    width: dims.width,
    health: 100,
    skid: 0,
    launch: 0,
    crashCooldown: 0,
    enginePower: dims.enginePower,
    maxSpeed: dims.maxSpeed,
  };
}

function coastVehicle(vehicle, city, delta) {
  vehicle.x += vehicle.vx * delta;
  vehicle.y += vehicle.vy * delta;
  city.resolveCircle(vehicle, vehicle.radius);
  vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
}

function applyEngine(vehicle, throttle, delta) {
  vehicle.launch = clamp(vehicle.launch + (throttle !== 0 ? delta * 2.2 : -delta * 3), 0, 1);
  const push = vehicle.enginePower * vehicle.launch * delta;
  const fx = Math.cos(vehicle.angle);
  const fy = Math.sin(vehicle.angle);
  if (throttle > 0) {
    vehicle.vx += fx * push;
    vehicle.vy += fy * push;
  } else if (throttle < 0) {
    vehicle.vx -= fx * push * 0.58;
    vehicle.vy -= fy * push * 0.58;
  }
}

function applyGripAndDrag(vehicle, throttle, delta) {
  const fx = Math.cos(vehicle.angle);
  const fy = Math.sin(vehicle.angle);
  const sideX = -fy;
  const sideY = fx;
  const sideSpeed = sideX * vehicle.vx + sideY * vehicle.vy;
  const grip = 1 - Math.exp(-delta * (vehicle.skid > 0 ? 1.4 : 4.5));
  vehicle.vx -= sideX * sideSpeed * grip;
  vehicle.vy -= sideY * sideSpeed * grip;
  const drag = throttle === 0 ? 0.985 : 0.997;
  vehicle.vx *= drag;
  vehicle.vy *= drag;
}

function clampSpeeds(vehicle, forwardSpeed) {
  if (Math.abs(forwardSpeed) > vehicle.maxSpeed) {
    const scale = vehicle.maxSpeed / Math.abs(forwardSpeed);
    vehicle.vx *= scale;
    vehicle.vy *= scale;
  }
  if (forwardSpeed < -MAX_REVERSE_SPEED) {
    const scale = MAX_REVERSE_SPEED / Math.abs(forwardSpeed);
    vehicle.vx *= scale;
    vehicle.vy *= scale;
  }
}

function applySteering(vehicle, steering, alongSpeed, delta) {
  const speedMagnitude = Math.abs(alongSpeed);
  if (steering === 0 || speedMagnitude <= 8) return;
  const speedRatio = clamp(speedMagnitude / 190, 0, 1);
  const direction = alongSpeed < 0 ? -1 : 1;
  const turnRate = (1.8 + 2.1 * (1 - speedRatio)) * direction;
  vehicle.angle = turnToward(vehicle.angle, vehicle.angle + steering * turnRate * delta * 3, delta * 5);
  if (speedMagnitude > 300) vehicle.skid = Math.max(vehicle.skid, 0.45);
}

export function updateVehicle(vehicle, input, city, delta, now, controlled = false) {
  vehicle.crashCooldown = Math.max(0, vehicle.crashCooldown - delta);
  vehicle.skid = Math.max(0, vehicle.skid - delta * 1.8);

  if (!controlled) {
    coastVehicle(vehicle, city, delta);
    return;
  }

  const throttle = (input.isDown("forward") ? 1 : 0) - (input.isDown("back") ? 1 : 0);
  const steering = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
  const alongBefore = Math.cos(vehicle.angle) * vehicle.vx + Math.sin(vehicle.angle) * vehicle.vy;

  // Integrate engine force once per step. The old grip term multiplied
  // enginePower by an exponential factor AND by delta again, so a car at full
  // throttle topped out near 95 px/s and could never outrun a 213 px/s unit.
  applyEngine(vehicle, throttle, delta);
  const alongAfter = Math.cos(vehicle.angle) * vehicle.vx + Math.sin(vehicle.angle) * vehicle.vy;
  applyGripAndDrag(vehicle, throttle, delta);
  clampSpeeds(vehicle, alongAfter);
  applySteering(vehicle, steering, alongBefore, delta);

  const startX = vehicle.x;
  const startY = vehicle.y;
  vehicle.x += vehicle.vx * delta;
  vehicle.y += vehicle.vy * delta;
  const afterMove = { x: vehicle.x, y: vehicle.y };
  city.resolveCircle(vehicle, vehicle.radius);
  const clipped = Math.abs(afterMove.x - vehicle.x) > 0.5 || Math.abs(afterMove.y - vehicle.y) > 0.5;
  if (clipped) {
    const impact = Math.hypot(vehicle.x - startX, vehicle.y - startY);
    if (impact > 0.4 && vehicle.crashCooldown <= 0) {
      vehicle.health = clamp(vehicle.health - impact * 0.3, 0, 100);
      vehicle.crashCooldown = 0.18;
      vehicle.skid = 0.5;
    }
    vehicle.vx *= 0.8;
    vehicle.vy *= 0.8;
  }
  vehicle.speed = Math.hypot(vehicle.vx, vehicle.vy);
  void now;
  void angleDelta;
}

export function getVehicleSpeed(vehicle) {
  return Math.round(vehicle.speed * DISPLAY_SPEED_SCALE);
}

export function isVehicleSlow(vehicle) {
  return vehicle.speed < SLOW_SPEED;
}

export function nearbyVehicle(vehicles, player) {
  let best = null;
  let bestDistance = NEARBY_RANGE;
  for (const candidate of vehicles) {
    if (candidate.occupied) continue;
    const gap = distance(player.x, player.y, candidate.x, candidate.y);
    if (gap < bestDistance) {
      best = candidate;
      bestDistance = gap;
    }
  }
  return best;
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
  const gap = Math.hypot(dx, dy);
  const minGap = vehicle.radius + other.radius;
  if (gap >= minGap) return 0;
  const nx = gap > 0 ? dx / gap : Math.cos(vehicle.angle);
  const ny = gap > 0 ? dy / gap : Math.sin(vehicle.angle);
  const push = minGap - gap + 0.1;
  vehicle.x -= nx * push / 2;
  vehicle.y -= ny * push / 2;
  other.x += nx * push / 2;
  other.y += ny * push / 2;
  const closing = Math.max(0, (vehicle.vx - other.vx) * nx + (vehicle.vy - other.vy) * ny);
  if (closing <= 0) return 0;
  const exchange = closing * 0.65;
  vehicle.vx -= nx * exchange;
  vehicle.vy -= ny * exchange;
  other.vx += nx * exchange;
  other.vy += ny * exchange;
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
