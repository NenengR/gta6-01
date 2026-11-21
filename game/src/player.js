import { WORLD, clamp, turnToward } from "./config.js";

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

export function updatePlayer(player, input, city, delta, now) {
  if (player.vehicle) return;

  let moveX = 0;
  let moveY = 0;
  if (input.isDown("forward")) moveY -= 1;
  if (input.isDown("back")) moveY += 1;
  if (input.isDown("left")) moveX -= 1;
  if (input.isDown("right")) moveX += 1;
  const length = Math.hypot(moveX, moveY);
  const sprinting = input.isDown("sprint") && player.stamina > 1 && length > 0;
  const speed = sprinting ? 225 : 155;

  if (length > 0) {
    moveX /= length;
    moveY /= length;
    const targetX = moveX * speed;
    const targetY = moveY * speed;
    const response = 1 - Math.exp(-delta * 12);
    player.vx += (targetX - player.vx) * response;
    player.vy += (targetY - player.vy) * response;
    player.angle = turnToward(player.angle, Math.atan2(moveY, moveX), delta * 12);
  } else {
    const response = 1 - Math.exp(-delta * 10);
    player.vx *= 1 - response;
    player.vy *= 1 - response;
  }

  player.stamina = clamp(player.stamina + (sprinting ? -28 : 17) * delta, 0, 100);
  player.x += player.vx * delta;
  player.y += player.vy * delta;
  city.resolveCircle(player, player.radius);
  player.x = clamp(player.x, player.radius, WORLD.oceanStart - player.radius);
  player.y = clamp(player.y, player.radius, WORLD.height - player.radius);
  player.hurtFlash = Math.max(0, player.hurtFlash - delta);

  if (now < player.invulnerableUntil) player.health = Math.min(player.maxHealth, player.health + 28 * delta);
}

export function damagePlayer(player, amount, now, direction = 0) {
  if (now < player.invulnerableUntil) return false;
  player.health = clamp(player.health - amount, 0, player.maxHealth);
  player.invulnerableUntil = now + 0.55;
  player.hurtFlash = 0.28;
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
