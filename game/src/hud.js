// The in-game HUD on its own transparent canvas (pointer-events: none in the page):
// health, cash, wanted stars, ammo, speed, the live mission objective and a minimap
// of the city's roads with the player, police and mission markers on it.
import { COLORS, HUD, ROAD_WIDTH, WORLD, clamp, streetNameAt } from "./config.js";
import { activeMission, missionMarker, missionTimeRemaining } from "./missions.js";
import { getVehicleSpeed } from "./vehicles.js";
import { SCREEN_PLAY, SCREEN_PAUSED } from "./render.js";

const TOTAL_JOBS = 5;
const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

export function createHud(canvas, gameCanvas) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let width = 1280;
  let height = 720;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(320, window.innerWidth);
    height = Math.max(240, window.innerHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function text(value, x, y, size, color, align = "left", weight = "normal") {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha = 0.62) {
    ctx.fillStyle = `rgba(18,24,32,${alpha})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(242,199,106,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // A horizontal fill bar with a translucent track underneath.
  function meter(x, y, w, h, ratio, fill) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
  }

  // A filled circle with a dark ring, used for minimap markers.
  // ringR defaults to just outside the dot; pass it when the ring is wider.
  function mapDot(x, y, r, fill, ring = "#14181f", ringR = r + 2.5) {
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function star(cx, cy, r, filled) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? "#ffd45e" : "rgba(255,255,255,0.45)";
    ctx.fill();
    ctx.strokeStyle = filled ? "#8a5a1e" : "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function drawHealth(player, x, y) {
    const w = HUD.healthWidth;
    const h = HUD.healthHeight;
    text("HEALTH", x, y - 7, 12, "#f0e4c8", "left", "bold");
    panel(x, y, w, h, 0.72);
    const ratio = clamp(player.health / player.maxHealth, 0, 1);
    const fill = ratio > 0.55 ? "#6fc47a" : ratio > 0.25 ? "#e8b455" : "#e06052";
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2, y + 2, (w - 4) * ratio, h - 4);
    text(`${Math.ceil(player.health)}`, x + w + 10, y + h - 2, 15, "#ffffff", "left", "bold");
  }

  function drawStars(police, x, y) {
    const active = police ? police.wanted : 0;
    text("WANTED", x, y - 12, 12, active > 0 ? "#ffd45e" : "rgba(255,255,255,0.55)", "center", "bold");
    const total = 5;
    const gap = HUD.starSize * 2.5;
    const start = x - ((total - 1) * gap) / 2;
    for (let i = 0; i < total; i += 1) star(start + i * gap, y + 6, HUD.starSize, i < active);
  }

  function drawAmmo(combat, x, y) {
    const status = combat
      ? { magazine: combat.magazine, reserve: combat.reserveAmmo, reloading: combat.reloadTimer > 0 }
      : { magazine: 0, reserve: 0, reloading: false };
    text("PISTOL", x, y - 8, 12, "#f0e4c8", "right", "bold");
    text(status.reloading ? "RELOADING" : `${status.magazine} / ${status.reserve}`, x, y + 18, 26,
      status.magazine === 0 ? "#ff8a76" : "#ffffff", "right", "bold");
  }

  function drawSpeed(player, x, y) {
    if (!player.vehicle) {
      text("ON FOOT", x, y, 18, "#d9c9a6", "right", "bold");
      return;
    }
    const kmh = getVehicleSpeed(player.vehicle);
    const barW = 150;
    text(`${kmh}`, x, y, 34, "#ffe6a8", "right", "bold");
    text("KM/H", x, y + 18, 12, "#d9c9a6", "right");
    meter(x - barW, y + 27, barW, 6, kmh / 230, kmh > 170 ? "#e06052" : "#e0a94a");
    const hp = clamp(player.vehicle.health / 100, 0, 1);
    text("CAR", x, y - 24, 11, "#c9d0d6", "right", "bold");
    meter(x - barW, y - 18, barW, 5, hp, hp > 0.4 ? "#7bbf86" : "#e06052");
  }

  function drawObjective(state, x, y, w) {
    const missions = state.missions;
    const active = activeMission(missions);
    const finished = missions && missions.completed.length >= TOTAL_JOBS;
    const wanted = state.police ? state.police.wanted : 0;
    let title;
    let objective;
    if (wanted > 0) {
      title = "PURSUIT IN PROGRESS";
      objective = `LOSE THE POLICE  (${wanted} star${wanted === 1 ? "" : "s"})`;
    } else if (active) {
      title = `${active.title}  ·  ${active.subtitle}`;
      objective = active.step.label;
    } else if (finished) {
      title = "SUNBREAK: COASTLINE";
      objective = "All jobs done. The coastline is yours.";
    } else if (missions) {
      title = "SUNBREAK: COASTLINE";
      objective = "Press E at Nia's radio for the next job";
    } else {
      title = "SUNBREAK: COASTLINE";
      objective = "Explore the city";
    }
    const remaining = missionTimeRemaining(missions);
    const lines = remaining !== null ? 2 : 1;
    const h = 52 + lines * 22;
    ctx.fillStyle = "rgba(18,24,32,0.74)";
    ctx.fillRect(x, y - h, w, h);
    ctx.strokeStyle = "rgba(242,199,106,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y - h + 0.5, w - 1, h - 1);
    text(title, x + 14, y - h + 22, 12, "#f2c76a", "left", "bold");
    text(objective, x + 14, y - h + 44, 17, "#fff4d4", "left", "bold");
    if (remaining !== null) {
      text(`TIME ${remaining.toFixed(1)}s`, x + 14, y - h + 68, 14,
        remaining < 12 ? "#ff8a76" : "#c9d0d6", "left", "bold");
    }
  }

  function drawMinimap(state, x, y) {
    const mw = HUD.minimapWidth;
    const mh = HUD.minimapHeight;
    panel(x, y, mw, mh, 0.78);
    if (!state.city) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, mw - 2, mh - 2);
    ctx.clip();

    const pad = 8;
    const scale = Math.min((mw - pad * 2) / WORLD.width, (mh - pad * 2) / WORLD.height);
    const ox = x + (mw - WORLD.width * scale) / 2;
    const oy = y + (mh - WORLD.height * scale) / 2;
    const mx = (wx) => ox + wx * scale;
    const my = (wy) => oy + wy * scale;

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(ox, oy, WORLD.width * scale, WORLD.height * scale);
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(mx(WORLD.oceanStart), oy, (WORLD.width - WORLD.oceanStart) * scale, WORLD.height * scale);

    ctx.fillStyle = "rgba(120,100,74,0.26)";
    for (const b of state.city.buildings) {
      ctx.fillRect(mx(b.x), my(b.y), Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }

    ctx.strokeStyle = COLORS.asphalt;
    ctx.lineWidth = Math.max(1.5, ROAD_WIDTH * scale * 0.62);
    ctx.beginPath();
    for (const road of state.city.roadX) {
      ctx.moveTo(mx(road), my(0));
      ctx.lineTo(mx(road), my(WORLD.height));
    }
    for (const road of state.city.roadY) {
      ctx.moveTo(mx(0), my(road));
      ctx.lineTo(mx(WORLD.oceanStart), my(road));
    }
    ctx.stroke();

    const marker = missionMarker(state.missions);
    if (marker) mapDot(mx(marker.x), my(marker.y), 5, "#ffd45e");
    const active = activeMission(state.missions);
    if (active && active.step && Number.isFinite(active.step.x)) {
      mapDot(mx(active.step.x), my(active.step.y), 5.5, "#7eecb2");
    }
    if (state.police) {
      for (const unit of state.police.units) {
        ctx.fillStyle = "rgba(255,106,106,0.85)";
        ctx.fillRect(mx(unit.x) - 1.5, my(unit.y) - 1.5, 3, 3);
      }
      for (const officer of state.police.officers) {
        ctx.fillStyle = "rgba(122,168,255,0.75)";
        ctx.fillRect(mx(officer.x) - 1, my(officer.y) - 1, 2, 2);
      }
    }
    const p = state.player;
    if (p) {
      const px = mx(p.x);
      const py = my(p.y);
      const tipX = px + Math.cos(p.angle) * 16;
      const tipY = py + Math.sin(p.angle) * 16;
      ctx.strokeStyle = "#14181f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      mapDot(px, py, 5, "#ffd45e", "#14181f", 7);
    }
    ctx.restore();
    text("COASTLINE", x + 8, y + 14, 10, "rgba(255,255,255,0.85)", "left", "bold");
    if (state.player) {
      text(streetNameAt(state.player.x, state.player.y, "vertical"), x + 8, y + mh - 7, 10, "#ffe6a8", "left", "bold");
    }
  }

  function draw(state, screen) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const m = HUD.minimapMargin;
    const player = state.player;

    drawHealth(player, m, 34);
    if (player) text(`$${Math.round(player.cash).toLocaleString("en-US")}`, m, 88, 24, "#ffd45e", "left", "bold");
    drawStars(state.police, width / 2, 36);
    drawAmmo(state.combat, width - m, 38);
    drawSpeed(player, width - m, height - 34);
    drawObjective(state, width / 2 - 260, height - 18, 520);
    drawMinimap(state, m, height - m - HUD.minimapHeight);

    if (state.message && state.messageTimer > 0) {
      ctx.fillStyle = "rgba(18,24,32,0.82)";
      const tw = Math.min(width - 60, Math.max(280, state.message.length * 8 + 40));
      ctx.fillRect(width / 2 - tw / 2, 96, tw, 36);
      text(state.message, width / 2, 120, 15, "#fff4d4", "center", "bold");
    }
  }

  resize();
  window.addEventListener("resize", resize);
  return { resize, draw };
}
