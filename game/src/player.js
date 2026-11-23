import { WORLD, clamp, turnToward } from "./config.js";

const WALK_SPEED = 155;
const SPRINT_SPEED = 225;
const ACCEL_RATE = 12;
const DECEL_RATE = 10;
const STAMINA_DRAIN = 28;
const STAMINA_REGEN = 17;
const HEALTH_REGEN = 28;
const HURT_TIME = 0.28;
const INVULN_TIME = 0.55;

export function createPlayer(x = 1080, y = 780) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    radius: 12,
    health: 100,
    maxHealth: 100,
    cash: 250,
    stamina: 100,
    invulnerableUntil: 0,
    vehicle: null,
    hurtFlash: 0,
  };
}

function readMoveInput(input) {
  let x = 0;
  let y = 0;
  if (input.isDown("forward")) y -= 1;
  if (input.isDown("back")) y += 1;
  if (input.isDown("left")) x -= 1;
  if (input.isDown("right")) x += 1;
  const magnitude = Math.hypot(x, y);
  if (magnitude > 0) {
    x /= magnitude;
    y /= magnitude;
  }
  return { x, y, magnitude };
}

export function updatePlayer(player, input, city, delta, now) {
  if (player.vehicle) return;

  const move = readMoveInput(input);
  const wantsSprint = input.isDown("sprint") && player.stamina > 1 && move.magnitude > 0;
  const topSpeed = wantsSprint ? SPRINT_SPEED : WALK_SPEED;

  if (move.magnitude > 0) {
    const blend = 1 - Math.exp(-delta * ACCEL_RATE);
    player.vx += (move.x * topSpeed - player.vx) * blend;
    player.vy += (move.y * topSpeed - player.vy) * blend;
    player.angle = turnToward(player.angle, Math.atan2(move.y, move.x), delta * ACCEL_RATE);
  } else {
    const blend = 1 - Math.exp(-delta * DECEL_RATE);
    player.vx *= 1 - blend;
    player.vy *= 1 - blend;
  }

  const staminaDelta = (wantsSprint ? -STAMINA_DRAIN : STAMINA_REGEN) * delta;
  player.stamina = clamp(player.stamina + staminaDelta, 0, 100);
  player.x += player.vx * delta;
  player.y += player.vy * delta;
  city.resolveCircle(player, player.radius);
  player.x = clamp(player.x, player.radius, WORLD.oceanStart - player.radius);
  player.y = clamp(player.y, player.radius, WORLD.height - player.radius);
  player.hurtFlash = Math.max(0, player.hurtFlash - delta);

  const recovering = now < player.invulnerableUntil;
  if (recovering) {
    player.health = Math.min(player.maxHealth, player.health + HEALTH_REGEN * delta);
  }
}

export function damagePlayer(player, amount, now, direction = 0) {
  if (now < player.invulnerableUntil) return false;
  player.health = clamp(player.health - amount, 0, player.maxHealth);
  player.invulnerableUntil = now + INVULN_TIME;
  player.hurtFlash = HURT_TIME;
  if (direction) player.angle += (Math.random() - 0.5) * 0.25;
  return true;
}

export function healPlayer(player, amount) {
  player.health = clamp(player.health + amount, 0, player.maxHealth);
}

export function placePlayer(player, x, y, angle = player.angle) {
  player.x = x;
  player.y = y;
  player.angle = angle;
  player.vx = 0;
  player.vy = 0;
}
