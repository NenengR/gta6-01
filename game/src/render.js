// Rendering: camera that follows the player/car, warm sun-soaked lighting, and
// drawing of roads, buildings, cars, pedestrians, police and effects.
import { WORLD, COLORS, clamp, lerp, distance, angleTo } from "./config.js";

export const SCREEN_TITLE = "title";
export const SCREEN_PLAY = "play";
export const SCREEN_PAUSED = "paused";
export const SCREEN_OVER = "over";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const camera = { x: 0, y: 0 };
  let shake = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx - camera.x + canvas.width / 2,
      y: wy - camera.y + canvas.height / 2,
    };
  }

  function updateCamera(targetX, targetY, delta) {
    const response = 1 - Math.exp(-delta * 6);
    camera.x += (targetX - camera.x) * response;
    camera.y += (targetY - camera.y) * response;
    if (shake > 0) {
      shake = Math.max(0, shake - delta);
      camera.x += (Math.random() - 0.5) * shake * 6;
      camera.y += (Math.random() - 0.5) * shake * 6;
    }
  }

  function setShake(amount) {
    shake = Math.max(shake, amount);
  }

  function clear() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function beginWorld() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(canvas.width / 2 - camera.x, canvas.height / 2 - camera.y);
  }

  function endWorld() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Sun glow
  function drawSun() {
    const gradient = ctx.createRadialGradient(
      WORLD.width - 520, 220, 10,
      WORLD.width - 520, 220, 520,
    );
    gradient.addColorStop(0, COLORS.sun);
    gradient.addColorStop(1, "rgba(255,194,112,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  function drawVehicle(ctx, vehicle) {
    const half = vehicle.length / 2;
    const cx = vehicle.x;
    const cy = vehicle.y;
    const angle = vehicle.angle;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-half, -vehicle.width / 2);
    ctx.lineTo(half, -vehicle.width / 2);
    ctx.lineTo(half, vehicle.width / 2);
    ctx.lineTo(-half, vehicle.width / 2);
    ctx.closePath();

    const isPolice = Boolean(vehicle.police);
    ctx.fillStyle = isPolice ? "#e8edf0" : vehicle.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Roof / cabin highlight
    ctx.fillStyle = isPolice ? "#ffffff" : "rgba(255,255,255,0.25)";
    ctx.fillRect(-half + 6, -vehicle.width / 2 + 4, vehicle.length - 12, vehicle.width / 2 - 6);

    if (isPolice) {
      ctx.fillStyle = "#e85b4c";
      ctx.fillRect(-half + 10, -vehicle.width / 2 - 2, 8, 4);
      ctx.fillRect(half - 18, -vehicle.width / 2 - 2, 8, 4);
    }

    ctx.restore();

    // Skid marks
    if (vehicle.skid > 0) {
      ctx.globalAlpha = 0.35 * vehicle.skid;
      ctx.fillStyle = "#2a2a2a";
      const lx = -Math.sin(angle) * 6;
      const ly = Math.cos(angle) * 6;
      ctx.fillRect(vehicle.x + lx - 2, vehicle.y + ly - 2, 18, 6);
      ctx.globalAlpha = 1;
    }
  }

  function drawPedestrian(ctx, p) {
    ctx.fillStyle = p.dead ? "#6b5b5b" : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOfficer(ctx, officer) {
    ctx.fillStyle = officer.color;
    ctx.beginPath();
    ctx.arc(officer.x, officer.y, officer.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(ctx, player) {
    if (player.vehicle) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    const flashing = player.hurtFlash > 0 && Math.floor(player.hurtFlash * 40) % 2 === 0;
    ctx.fillStyle = flashing ? "#ffffff" : "#8cc66b";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEffect(ctx, effect) {
    if (effect.kind === "bullet" || effect.kind === "enemyBullet") {
      ctx.fillStyle = effect.kind === "enemyBullet" ? "#e85b4c" : "#f5d76a";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.type === "muzzle") {
      const alpha = effect.life / effect.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fff8e0";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 5 + alpha * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (effect.type === "impact") {
      const alpha = effect.life / effect.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#f5d76a";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 4 + (1 - alpha) * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (effect.type === "punch") {
      ctx.fillStyle = "#e8edf0";
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    resize,
    setShake,
    draw(city, player, traffic, police, combat, screen, target) {
      resize();
      const targetX = target ? target.x : player.x;
      const targetY = target ? target.y : player.y;
      updateCamera(targetX, targetY, 1 / 60);

      clear();
      beginWorld();
      drawSun();
      city.drawCityGround(ctx, city);
      city.drawCityBuildings(ctx, city);

      // Pedestrians
      for (const p of traffic.pedestrians) {
        if (!p.dead) drawPedestrian(ctx, p);
      }

      // Traffic cars
      for (const car of traffic.cars) {
        if (car === player.vehicle) continue;
        drawVehicle(ctx, car);
      }

      // Player vehicle
      if (player.vehicle) drawVehicle(ctx, player.vehicle);

      // Police units
      for (const unit of police.units) {
        if (unit === player.vehicle) continue;
        drawVehicle(ctx, unit);
      }

      // Player on foot
      drawPlayer(ctx, player);

      // Officers
      for (const officer of police.officers) {
        drawOfficer(ctx, officer);
      }

      // Combat effects
      for (const effect of combat.effects) {
        drawEffect(ctx, effect);
      }

      endWorld();

      // Screen overlays
      if (screen === SCREEN_PAUSED || screen === SCREEN_TITLE || screen === SCREEN_OVER) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f5ead4";
        ctx.font = "bold 36px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (screen === SCREEN_TITLE) {
          ctx.fillText("Sunbreak Coastline", canvas.width / 2, canvas.height / 2 - 20);
          ctx.font = "18px system-ui";
          ctx.fillStyle = "#d8c7a8";
          ctx.fillText("Press Space or click to start", canvas.width / 2, canvas.height / 2 + 24);
        } else if (screen === SCREEN_PAUSED) {
          ctx.fillText("Paused", canvas.width / 2, canvas.height / 2);
          ctx.font = "18px system-ui";
          ctx.fillStyle = "#d8c7a8";
          ctx.fillText("Press P to resume", canvas.width / 2, canvas.height / 2 + 28);
        } else if (screen === SCREEN_OVER) {
          ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 20);
          ctx.font = "18px system-ui";
          ctx.fillStyle = "#d8c7a8";
          ctx.fillText("Press Space or click to restart", canvas.width / 2, canvas.height / 2 + 24);
        }
      }
    },
  };
}
