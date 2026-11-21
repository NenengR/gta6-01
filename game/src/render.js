// Drawing only: a smooth camera over the city, warm sun-soaked light, every entity
// and effect, plus the screen panels. The camera also converts pointer coordinates
// between screen pixels and world space for aiming.
import { CAMERA, COLORS, ROAD_X, ROAD_Y, STREET_NAMES, WORLD, clamp, lerp } from "./config.js";
import { drawCityBuildings, drawCityGround } from "./city.js";
import { missionMarker, activeMission, showRadioMarker } from "./missions.js";

export const SCREEN_TITLE = "title";
export const SCREEN_PLAY = "play";
export const SCREEN_PAUSED = "paused";
export const SCREEN_OVER = "over";

const FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let cssWidth = 1280;
  let cssHeight = 720;
  let camX = 1080;
  let camY = 780;
  let cameraReady = false;
  const buttons = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = Math.max(320, window.innerWidth);
    cssHeight = Math.max(240, window.innerHeight);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
  }

  function screenToWorld(sx, sy) {
    return {
      x: camX + (sx - cssWidth / 2) / CAMERA.zoom,
      y: camY + (sy - cssHeight / 2) / CAMERA.zoom,
    };
  }

  function text(value, x, y, size, color, align = "left", weight = "normal") {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- camera ----
  function updateCamera(state, delta) {
    const player = state.player;
    if (!player) return;
    const target = player.vehicle || player;
    const lead = CAMERA.lookAhead;
    const goalX = target.x + (target.vx || 0) * lead;
    const goalY = target.y + (target.vy || 0) * lead;
    if (!cameraReady) {
      camX = goalX;
      camY = goalY;
      cameraReady = true;
    } else {
      const response = 1 - Math.exp(-clamp(delta, 0, 0.1) * CAMERA.follow);
      camX = lerp(camX, goalX, response);
      camY = lerp(camY, goalY, response);
    }
    const halfW = cssWidth / (2 * CAMERA.zoom);
    const halfH = cssHeight / (2 * CAMERA.zoom);
    camX = halfW * 2 >= WORLD.width ? WORLD.width / 2 : clamp(camX, halfW - CAMERA.margin, WORLD.width - halfW + CAMERA.margin);
    camY = halfH * 2 >= WORLD.height ? WORLD.height / 2 : clamp(camY, halfH - CAMERA.margin, WORLD.height - halfH + CAMERA.margin);
  }

  // ---- world entities ----
  function drawVehicle(v, now) {
    const L = v.length;
    const W = v.width;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    ctx.fillStyle = "rgba(28,24,28,0.28)";
    ctx.fillRect(-L / 2 + 6, -W / 2 + 7, L, W);
    ctx.fillStyle = v.color;
    ctx.fillRect(-L / 2, -W / 2, L, W);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L - 6, 4);
    ctx.fillStyle = "rgba(22,34,44,0.72)";
    ctx.fillRect(-L / 2 + L * 0.26, -W / 2 + 2, L * 0.36, W - 4);
    ctx.fillStyle = "rgba(255,240,190,0.85)";
    ctx.fillRect(L / 2 - 5, -W / 2 + 2, 5, 6);
    ctx.fillRect(L / 2 - 5, W / 2 - 8, 5, 6);
    ctx.fillStyle = "#b23c34";
    ctx.fillRect(-L / 2 + 1, -W / 2 + 2, 4, 5);
    ctx.fillRect(-L / 2 + 1, W / 2 - 7, 4, 5);
    if (v.police) {
      const flash = Math.floor(now * 6) % 2 === 0;
      ctx.fillStyle = flash ? "#3f6cff" : "#7b8aa0";
      ctx.fillRect(-3, -W / 2 - 2, 6, 6);
      ctx.fillStyle = flash ? "#7b8aa0" : "#ff4b4b";
      ctx.fillRect(-3, W / 2 - 4, 6, 6);
    }
    ctx.restore();

    if (v.skid > 0) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      ctx.globalAlpha = Math.min(0.5, v.skid * 0.6);
      ctx.fillStyle = "#20242a";
      const len = 34 + v.skid * 44;
      ctx.fillRect(-L / 2 - len, -W / 2 + 3, len, 4);
      ctx.fillRect(-L / 2 - len, W / 2 - 7, len, 4);
      ctx.restore();
    }
  }

  function drawPedestrian(p) {
    ctx.fillStyle = "rgba(30,26,30,0.22)";
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 5, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = Math.sin(p.phase) * 1.6;
    ctx.fillStyle = p.dead ? "#8a7f78" : p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7b98f";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 7 + bob, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOfficer(o, now) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.angle);
    ctx.fillStyle = "rgba(20,24,32,0.26)";
    ctx.beginPath();
    ctx.ellipse(4, 6, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = o.color || "#315a91";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0d2a8";
    ctx.beginPath();
    ctx.arc(2, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd76a";
    ctx.fillRect(-2, -5, 3, 3);
    if (o.cooldown > 0.7) {
      ctx.fillStyle = "rgba(255,232,150,0.9)";
      ctx.beginPath();
      ctx.arc(12, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayerOnFoot(player, now) {
    if (player.invulnerableUntil > now && Math.floor(now * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = "rgba(26,22,28,0.3)";
    ctx.beginPath();
    ctx.ellipse(4, 6, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = player.hurtFlash > 0 ? "#ff8a76" : "#e8c260";
    roundRect(-8, -10, 19, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#c98d5d";
    ctx.beginPath();
    ctx.arc(3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b4a63";
    ctx.beginPath();
    ctx.arc(3, 0, 7, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.fill();
    ctx.fillStyle = "#c98d5d";
    ctx.fillRect(8, -3, 11, 5);
    ctx.restore();
  }

  function drawEffects(combat) {
    if (!combat || !combat.effects) return;
    for (const e of combat.effects) {
      const t = clamp(1 - e.life / (e.maxLife || 0.3), 0, 1);
      const kind = e.type || e.kind;
      if (kind === "bullet" || kind === "enemyBullet") {
        const len = kind === "bullet" ? 16 : 11;
        const a = Math.atan2(e.vy, e.vx);
        ctx.strokeStyle = kind === "bullet" ? "#ffe9a0" : "#ff8b6a";
        ctx.lineWidth = kind === "bullet" ? 3 : 2.4;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - Math.cos(a) * len, e.y - Math.sin(a) * len);
        ctx.stroke();
      } else if (kind === "muzzle") {
        ctx.fillStyle = `rgba(255,224,140,${1 - t})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 5 + 9 * t, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === "impact") {
        ctx.strokeStyle = `rgba(255,246,210,${1 - t})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 4 + 16 * t, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === "punch") {
        ctx.strokeStyle = `rgba(255,238,180,${1 - t})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 10 + 8 * t, -0.8, 0.8);
        ctx.stroke();
      } else if (kind === "crash") {
        ctx.strokeStyle = `rgba(255,205,120,${1 - t})`;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + t;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3);
          ctx.lineTo(e.x + Math.cos(a) * (10 + 20 * t), e.y + Math.sin(a) * (10 + 20 * t));
          ctx.stroke();
        }
      }
    }
  }

  function drawPickups(pickups, now) {
    if (!pickups) return;
    for (const item of pickups) {
      if (!item.active) continue;
      const bob = Math.sin(now * 3 + item.x) * 3;
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      ctx.fillStyle = "rgba(18,24,32,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, 17 - bob, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = item.kind === "health" ? "#e4f0dc" : "#f2d27a";
      ctx.fillRect(-13, -13, 26, 26);
      ctx.strokeStyle = item.kind === "health" ? "#5c9665" : "#a97c2c";
      ctx.lineWidth = 2;
      ctx.strokeRect(-13, -13, 26, 26);
      ctx.fillStyle = item.kind === "health" ? "#c9504d" : "#7a5a20";
      if (item.kind === "health") {
        ctx.fillRect(-3, -9, 6, 18);
        ctx.fillRect(-9, -3, 18, 6);
      } else {
        ctx.fillRect(-7, -8, 4, 16);
        ctx.fillRect(3, -8, 4, 16);
      }
      ctx.restore();
      text(item.label, item.x, item.y - 24, 11,
        item.kind === "health" ? "#bff0c6" : "#ffe6a8", "center", "bold");
    }
  }

  function drawMarkers(state) {
    const { missions, time } = state;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    const marker = missionMarker(missions);
    if (showRadioMarker(missions) && marker) {
      ctx.strokeStyle = `rgba(255,206,104,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 26 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,206,104,0.16)";
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 30, 0, Math.PI * 2);
      ctx.fill();
      text("NIA'S RADIO", marker.x, marker.y - 40, 13, "#ffe6a8", "center", "bold");
      text("E to start", marker.x, marker.y + 52, 11, "#fff4d4", "center");
    }
    const active = activeMission(missions);
    if (active && active.step && Number.isFinite(active.step.x)) {
      const s = active.step;
      ctx.strokeStyle = `rgba(126,236,178,${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(126,236,178,0.14)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      text("OBJECTIVE", s.x, s.y - s.radius - 12, 12, "#c8ffe1", "center", "bold");
    }
  }

  function drawStreetNames() {
    const halfW = cssWidth / (2 * CAMERA.zoom);
    const halfH = cssHeight / (2 * CAMERA.zoom);
    const left = camX - halfW;
    const top = camY - halfH;
    function label(value, x, y) {
      ctx.strokeStyle = "rgba(20,24,32,0.85)";
      ctx.lineWidth = 3;
      ctx.strokeText(value, x, y);
      ctx.fillStyle = "rgba(255,246,220,0.78)";
      ctx.fillText(value, x, y);
    }
    ctx.save();
    ctx.font = "bold 13px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i < ROAD_Y.length; i += 1) {
      if (ROAD_Y[i] < top - 20 || ROAD_Y[i] > top + halfH * 2 + 20) continue;
      label(STREET_NAMES.horizontal[i], left + 74, ROAD_Y[i] - 18);
    }
    for (let i = 0; i < ROAD_X.length; i += 1) {
      if (ROAD_X[i] < left - 20 || ROAD_X[i] > left + halfW * 2 + 20) continue;
      ctx.save();
      ctx.translate(ROAD_X[i] + 18, top + 150);
      ctx.rotate(-Math.PI / 2);
      label(STREET_NAMES.vertical[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWarmLight() {
    const halfW = cssWidth / (2 * CAMERA.zoom);
    const halfH = cssHeight / (2 * CAMERA.zoom);
    const x = camX - halfW;
    const y = camY - halfH;
    const w = halfW * 2;
    const h = halfH * 2;
    const glow = ctx.createRadialGradient(x + w * 0.28, y + h * 0.2, 40, x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.9);
    glow.addColorStop(0, "rgba(255,214,140,0.20)");
    glow.addColorStop(0.55, "rgba(255,178,100,0.07)");
    glow.addColorStop(1, "rgba(86,52,70,0.13)");
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
  }

  // ---- panels (screen pixels) ----
  function drawPanel(title, subtitle, lines, panelButtons, prompt, accent = "#f2c76a") {
    buttons.length = 0;
    const pw = Math.min(700, cssWidth - 40);
    const rowH = 30;
    const buttonH = 52;
    const gap = 12;
    const ph = 150 + lines.length * rowH + panelButtons.length * (buttonH + gap) + 66;
    const px = (cssWidth - pw) / 2;
    const py = (cssHeight - ph) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(16,20,28,0.45)";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "rgba(20,26,34,0.95)";
    roundRect(px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(242,199,106,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const cx = cssWidth / 2;
    text(title, cx, py + 74, 52, accent, "center", "bold");
    if (subtitle) text(subtitle, cx, py + 104, 17, "#d9c9a6", "center", "bold");
    let cursor = py + 142;
    for (const line of lines) {
      text(line, cx, cursor, 15, "#c9d0d6", "center");
      cursor += rowH;
    }
    cursor += 8;
    for (const b of panelButtons) {
      const bw = Math.min(360, pw - 80);
      const bx = cx - bw / 2;
      ctx.fillStyle = b.primary ? "#e0a94a" : "rgba(255,255,255,0.10)";
      roundRect(bx, cursor, bw, buttonH, 10);
      ctx.fill();
      ctx.strokeStyle = b.primary ? "#ffd98a" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(b.label, cx, cursor + 33, 20, b.primary ? "#241a12" : "#f3efe2", "center", "bold");
      buttons.push({ id: b.id, x: bx, y: cursor, w: bw, h: buttonH });
      cursor += buttonH + gap;
    }
    if (prompt) text(prompt, cx, py + ph - 24, 13, "#9aa6ad", "center");
  }

  function drawBriefing(briefing) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = Math.min(560, cssWidth - 60);
    const x = (cssWidth - w) / 2;
    const y = 150;
    const h = 46 + briefing.lines.length * 24;
    ctx.fillStyle = "rgba(18,24,32,0.88)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(242,199,106,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    text(`BRIEFING  ·  ${briefing.title}`, x + 14, y + 24, 14, "#f2c76a", "left", "bold");
    briefing.lines.forEach((line, index) => text(line, x + 14, y + 48 + index * 24, 13, "#fff4d4", "left"));
  }

  function drawPanels(state, screen) {
    if (screen === SCREEN_PLAY && state.briefing && state.briefing.timer > 0) drawBriefing(state.briefing);
    if (screen === SCREEN_TITLE) {
      drawPanel(
        "SUNBREAK",
        "COASTLINE  —  an original open-world crime story",
        [
          "One city. Five jobs. A ledger everybody wants.",
          "Move / drive: WASD or Arrows    Steal or exit car: E",
          "Punch: Space    Shoot: F or left mouse    Reload: R",
          "Pause: P    Mute: M",
        ],
        [
          { id: "new", label: "NEW GAME", primary: true },
          ...(state.hasSave ? [{ id: "continue", label: "CONTINUE SAVE", primary: false }] : []),
        ],
        "Click a button or press Enter to begin",
      );
    } else if (screen === SCREEN_PAUSED) {
      drawPanel("PAUSED", "The city waits for you.", ["Take a breath. The sirens can hold."],
        [{ id: "resume", label: "RESUME", primary: true }], "Press P or Escape to resume");
    } else if (screen === SCREEN_OVER) {
      const busted = state.gameOverReason === "busted";
      const done = state.missions ? state.missions.completed.length : 0;
      drawPanel(
        busted ? "BUSTED" : "WASTED",
        busted ? "The blue lights caught up with you." : "The streets took their due.",
        [`Cash on hand: $${state.player ? state.player.cash : 0}`, `Jobs finished: ${done} / 5`, "The coastline is still out there."],
        [
          { id: "restart", label: "RESTART", primary: true },
          { id: "title", label: "TITLE SCREEN", primary: false },
        ],
        "Press Enter to restart",
        busted ? "#8fb8ff" : "#ff9b87",
      );
    } else {
      buttons.length = 0;
    }
  }

  // ---- one frame ----
  function draw(state, screen, delta = 0) {
    updateCamera(state, delta);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const s = dpr * CAMERA.zoom;
    ctx.setTransform(s, 0, 0, s,
      dpr * cssWidth / 2 - camX * s,
      dpr * cssHeight / 2 - camY * s);

    const city = state.city;
    if (city) {
      drawCityGround(ctx, city);
      drawCityBuildings(ctx, city);
      drawStreetNames();
      drawPickups(state.pickups, state.time || 0);
      drawMarkers(state);
      const now = state.time || 0;
      const cars = state.traffic ? state.traffic.cars : [];
      const police = state.police;
      for (const v of cars) if (v.skid > 0) drawVehicle(v, now);
      for (const v of cars) if (!(v.skid > 0)) drawVehicle(v, now);
      if (police) for (const v of police.units) drawVehicle(v, now);
      if (state.traffic) for (const p of state.traffic.pedestrians) drawPedestrian(p, now);
      if (police) for (const o of police.officers) drawOfficer(o, now);
      if (state.player && !state.player.vehicle) drawPlayerOnFoot(state.player, now);
      drawEffects(state.combat);
      drawWarmLight();
    }

    drawPanels(state, screen);
  }

  resize();
  window.addEventListener("resize", resize);
  return {
    draw,
    resize,
    screenToWorld,
    buttons,
    get cssWidth() { return cssWidth; },
    get cssHeight() { return cssHeight; },
    get camera() { return { x: camX, y: camY }; },
  };
}
