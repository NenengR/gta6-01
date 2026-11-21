// HUD overlay: health bar, cash, wanted stars, speed, mission objective and a
// minimap canvas showing roads, player, police and mission markers.
import { ROAD_X, ROAD_Y, ROAD_WIDTH, WORLD, COLORS, clamp, distance } from "./config.js";

export function createHud(container) {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.pointerEvents = "none";
  root.style.inset = "0";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.color = "#f5ead4";
  root.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";
  root.style.userSelect = "none";

  // Health bar (top left)
  const healthWrap = document.createElement("div");
  healthWrap.style.position = "absolute";
  healthWrap.style.left = "18px";
  healthWrap.style.top = "18px";
  healthWrap.style.width = "170px";
  const healthLabel = document.createElement("div");
  healthLabel.style.fontSize = "12px";
  healthLabel.style.opacity = "0.8";
  healthLabel.textContent = "HEALTH";
  const healthBar = document.createElement("div");
  healthBar.style.position = "relative";
  healthBar.style.height = "10px";
  healthBar.style.background = "rgba(0,0,0,0.45)";
  healthBar.style.border = "1px solid rgba(255,255,255,0.35)";
  healthBar.style.borderRadius = "2px";
  healthBar.style.marginTop = "4px";
  const healthFill = document.createElement("div");
  healthFill.style.height = "10px";
  healthFill.style.width = "100%";
  healthFill.style.background = "#e85b4c";
  healthBar.appendChild(healthFill);
  healthWrap.appendChild(healthLabel);
  healthWrap.appendChild(healthBar);
  root.appendChild(healthWrap);

  // Cash (below health)
  const cashWrap = document.createElement("div");
  cashWrap.style.position = "absolute";
  cashWrap.style.left = "18px";
  cashWrap.style.top = "66px";
  cashWrap.style.fontSize = "16px";
  cashWrap.style.fontWeight = "700";
  cashWrap.textContent = "$0";
  root.appendChild(cashWrap);

  // Wanted stars (top right)
  const starsWrap = document.createElement("div");
  starsWrap.style.position = "absolute";
  starsWrap.style.right = "18px";
  starsWrap.style.top = "18px";
  starsWrap.style.display = "flex";
  starsWrap.style.gap = "7px";
  const stars = [];
  for (let i = 0; i < 5; i += 1) {
    const star = document.createElement("div");
    star.style.width = "16px";
    star.style.height = "16px";
    star.style.border = "2px solid rgba(255,220,90,0.5)";
    star.style.borderRadius = "2px";
    star.style.background = "transparent";
    star.style.position = "relative";
    stars.push(star);
    starsWrap.appendChild(star);
  }
  root.appendChild(starsWrap);

  // Speed (top right, below stars)
  const speedWrap = document.createElement("div");
  speedWrap.style.position = "absolute";
  speedWrap.style.right = "18px";
  speedWrap.style.top = "52px";
  speedWrap.style.fontSize = "14px";
  speedWrap.style.fontWeight = "700";
  speedWrap.textContent = "0 km/h";
  root.appendChild(speedWrap);

  // Mission objective (center top)
  const missionWrap = document.createElement("div");
  missionWrap.style.position = "absolute";
  missionWrap.style.left = "50%";
  missionWrap.style.top = "18px";
  missionWrap.style.transform = "translateX(-50%)";
  missionWrap.style.fontSize = "15px";
  missionWrap.style.fontWeight = "700";
  missionWrap.style.textAlign = "center";
  missionWrap.style.maxWidth = "60%";
  missionWrap.textContent = "";
  root.appendChild(missionWrap);

  // Minimap (bottom right)
  const mapWrap = document.createElement("div");
  mapWrap.style.position = "absolute";
  mapWrap.style.right = "18px";
  mapWrap.style.bottom = "18px";
  mapWrap.style.width = "170px";
  mapWrap.style.height = "130px";
  mapWrap.style.background = "rgba(0,0,0,0.5)";
  mapWrap.style.border = "1px solid rgba(255,255,255,0.4)";
  mapWrap.style.borderRadius = "4px";
  mapWrap.style.overflow = "hidden";
  const minimap = document.createElement("canvas");
  minimap.width = 170;
  minimap.height = 130;
  minimap.style.width = "100%";
  minimap.style.height = "100%";
  minimap.style.display = "block";
  mapWrap.appendChild(minimap);
  root.appendChild(mapWrap);

  container.appendChild(root);

  const ctx = minimap.getContext("2d");
  const mapW = minimap.width;
  const mapH = minimap.height;

  return {
    show() { root.style.display = ""; },
    hide() { root.style.display = "none"; },
    update(player, police, missions, city, now, speedKmh) {
      // Health
      const healthPct = clamp(player.health / player.maxHealth, 0, 1);
      healthFill.style.width = `${healthPct * 100}%`;
      healthFill.style.background = healthPct > 0.5 ? "#8cc66b" : healthPct > 0.25 ? "#e8c54c" : "#e85b4c";

      // Cash
      cashWrap.textContent = `$${Math.round(player.cash)}`;

      // Wanted stars
      const wanted = police.wanted || 0;
      for (let i = 0; i < 5; i += 1) {
        const on = i < wanted;
        stars[i].style.background = on ? "#f5d76a" : "transparent";
        stars[i].style.borderColor = on ? "#f5d76a" : "rgba(255,220,90,0.5)";
        stars[i].style.boxShadow = on ? "0 0 8px rgba(245,215,106,0.8)" : "none";
      }

      // Speed
      speedWrap.textContent = `${speedKmh} km/h`;

      // Mission objective
      const objective = missions ? missions.objectiveText || "" : "";
      missionWrap.textContent = objective;

      // Minimap
      drawMinimap(ctx, player, police, missions, city, mapW, mapH);
    },
  };
}

function drawMinimap(ctx, player, police, missions, city, width, height) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(20, 22, 24, 0.85)";
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width / WORLD.width, height / WORLD.height) * 0.92;
  const ox = (width - WORLD.width * scale) / 2;
  const oy = (height - WORLD.height * scale) / 2;

  // Roads
  ctx.strokeStyle = "#5a666e";
  ctx.lineWidth = 2;
  for (const x of city.roadX) {
    ctx.beginPath();
    ctx.moveTo(ox + x * scale, oy);
    ctx.lineTo(ox + x * scale, oy + WORLD.height * scale);
    ctx.stroke();
  }
  for (const y of city.roadY) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * scale);
    ctx.lineTo(ox + (WORLD.oceanStart - 60) * scale, oy + y * scale);
    ctx.stroke();
  }

  // Mission marker
  if (missions && missions.missionMarker) {
    const m = missions.missionMarker;
    ctx.fillStyle = "#f5d76a";
    ctx.beginPath();
    ctx.arc(ox + m.x * scale, oy + m.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5d3a1a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Police units
  ctx.fillStyle = "#b8c4d9";
  for (const unit of (police.units || [])) {
    ctx.fillRect(ox + unit.x * scale - 1.5, oy + unit.y * scale - 1.5, 3, 3);
  }
  // Officers
  ctx.fillStyle = "#7a93c4";
  for (const officer of (police.officers || [])) {
    ctx.fillRect(ox + officer.x * scale - 1, oy + officer.y * scale - 1, 2, 2);
  }

  // Player
  ctx.fillStyle = player.vehicle ? "#e85b4c" : "#8cc66b";
  const pRadius = player.vehicle ? 3 : 2;
  ctx.beginPath();
  ctx.arc(ox + player.x * scale, oy + player.y * scale, pRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();
}
