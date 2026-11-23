// Heads-up display for Sunbreak Coastline.
//
// drawHud draws the overlay on top of the scene: health, money, wanted
// stars, the current mission, the status line, the minimap frame, and the
// title, pause, busted, wasted and mission-complete screens. The two exact
// status strings live here so main.js and shots.js share one copy.

import { MINIMAP_RECT } from './render.js';

export const TITLE_TEXT = 'Sunbreak: Coastline. Press Enter or click New Game to begin.';
export const NEW_GAME_TEXT = "New game. Find Nia's radio on Lime Street and press E.";

function money(n) {
  return '$' + Math.floor(n || 0).toLocaleString('en-US');
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawHealthMoney(ctx, state) {
  const p = state.player || {};
  const health = typeof p.health === 'number' ? p.health : 100;
  const max = p.maxHealth || 100;
  const frac = Math.max(0, Math.min(1, health / max));
  panel(ctx, 12, 12, 260, 64);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', 24, 32);
  ctx.fillStyle = '#222';
  ctx.fillRect(84, 20, 168, 16);
  ctx.fillStyle = frac > 0.5 ? '#3fae5a' : frac > 0.25 ? '#e8a13a' : '#d83a3a';
  ctx.fillRect(84, 20, 168 * frac, 16);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(money(p.money), 24, 64);
}

function drawWanted(ctx, state) {
  const p = state.player || {};
  const wanted = Math.max(0, Math.min(5, p.wanted || 0));
  panel(ctx, 524, 12, 232, 44);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('WANTED', 538, 40);
  ctx.font = '26px system-ui, sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < wanted ? '#ffd76a' : 'rgba(255,255,255,0.25)';
    ctx.fillText(i < wanted ? '★' : '☆', 606 + i * 28, 40);
  }
}

function drawMission(ctx, state) {
  const missions = state.missions || {};
  let current = null;
  let done = 0;
  try {
    current = typeof missions.current === 'function' ? missions.current() : null;
    done = typeof missions.index === 'function' ? missions.index() : 0;
  } catch (e) {
    current = null;
    done = 0;
  }
  panel(ctx, 12, 88, 300, 76);
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(current ? (current.name || 'Mission') : 'No mission', 24, 110);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '13px system-ui, sans-serif';
  const desc = current ? (current.text || '') : '';
  ctx.fillText(desc.slice(0, 46), 24, 130);
  if (current && current.reward) {
    ctx.fillStyle = '#9fd68a';
    ctx.fillText('Reward: ' + money(current.reward), 24, 150);
  }
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Mission ' + (done + 1) + ' of 5', 232, 110);
}

function drawStatus(ctx, state) {
  const text = state.status || '';
  if (!text) return;
  ctx.font = '15px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 28;
  const x = (ctx.canvas.width - w) / 2;
  const y = ctx.canvas.height - 44;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
  ctx.fillRect(x, y, w, 28);
  ctx.strokeStyle = 'rgba(255,215,106,0.5)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 27);
  ctx.fillStyle = '#ffd76a';
  ctx.textAlign = 'center';
  ctx.fillText(text, ctx.canvas.width / 2, y + 19);
  ctx.textAlign = 'left';
}

function drawMessages(ctx, state) {
  const list = (state.messages || []).slice(-3);
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  list.forEach((m, i) => {
    const frac = Math.min(1, (m.t || 0) / (m.life || 4));
    ctx.globalAlpha = frac > 0.8 ? 1 - (frac - 0.8) / 0.2 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(m.text || '', ctx.canvas.width / 2, 96 + i * 22);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawMinimapFrame(ctx) {
  const r = MINIMAP_RECT;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('MAP', r.x, r.y - 6);
}

function drawDistrict(ctx, state) {
  const p = state.player;
  const city = state.city;
  if (!p || !city || typeof city.districtAt !== 'function') return;
  const name = city.districtAt(p.x, p.y);
  if (!name) return;
  const night = typeof city.daylight === 'function' ? city.daylight() < 0.35 : false;
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(name + (night ? '  ·  Night' : '  ·  Day'), 12, ctx.canvas.height - 16);
}

function dimScreen(ctx) {
  ctx.fillStyle = 'rgba(6, 10, 18, 0.78)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawTitle(ctx, state) {
  dimScreen(ctx);
  const cx = ctx.canvas.width / 2;
  ctx.fillStyle = '#2e6da8';
  ctx.fillRect(0, 560, ctx.canvas.width, 240);
  ctx.fillStyle = '#dcc389';
  ctx.fillRect(0, 540, ctx.canvas.width, 20);
  ctx.fillStyle = '#20242c';
  const skyline = [90, 150, 110, 190, 130, 170, 100, 160, 120, 180];
  skyline.forEach((h, i) => {
    ctx.fillRect(60 + i * 122, 540 - h, 84, h);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SUNBREAK', cx, 190);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('COASTLINE', cx, 262);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(TITLE_TEXT, cx, 330);
  ctx.fillStyle = '#9aa4b2';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('WASD or arrows to move  ·  E to interact and steal cars  ·  P to pause  ·  M to mute', cx, 392);
  ctx.fillText('Steal cars, earn money, outrun the police, finish all five story missions.', cx, 420);
  const best = state.best || 0;
  if (best > 0) {
    ctx.fillStyle = '#9fd68a';
    ctx.fillText('Best score: ' + money(best), cx, 462);
  }
  ctx.textAlign = 'left';
}

function drawPause(ctx) {
  dimScreen(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('PAUSED', ctx.canvas.width / 2, 380);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#9aa4b2';
  ctx.fillText('Press P to resume.', ctx.canvas.width / 2, 424);
  ctx.textAlign = 'left';
}

function drawEnd(ctx, state, kind) {
  dimScreen(ctx);
  const cx = ctx.canvas.width / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#6ab0ff' : '#ff5a5a';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', cx, 340);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(
    kind === 'busted' ? 'The police caught you.' : 'You did not make it.',
    cx,
    384,
  );
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('Score: ' + money(state.score || 0) + '   ·   Best: ' + money(state.best || 0), cx, 420);
  ctx.fillStyle = '#9aa4b2';
  ctx.fillText('Press Enter to try again.', cx, 458);
  ctx.textAlign = 'left';
}

function drawMissionBanner(ctx, state) {
  const done = state.completedMission || null;
  const cx = ctx.canvas.width / 2;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.82)';
  ctx.fillRect(cx - 260, 300, 520, 110);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 260, 300, 520, 110);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('MISSION COMPLETE', cx, 348);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(
    (done ? (done.name || '') : '') + (done && done.reward ? '  ·  +' + money(done.reward) : ''),
    cx,
    384,
  );
  ctx.textAlign = 'left';
}

export function drawHud(ctx, state) {
  const mode = state.mode || 'title';
  if (mode === 'title') {
    drawTitle(ctx, state);
    return;
  }
  drawHealthMoney(ctx, state);
  drawWanted(ctx, state);
  drawMission(ctx, state);
  drawMessages(ctx, state);
  drawStatus(ctx, state);
  drawMinimapFrame(ctx);
  drawDistrict(ctx, state);
  if (mode === 'paused') drawPause(ctx);
  else if (mode === 'busted') drawEnd(ctx, state, 'busted');
  else if (mode === 'wasted') drawEnd(ctx, state, 'wasted');
  else if (mode === 'mission-complete') drawMissionBanner(ctx, state);
}
